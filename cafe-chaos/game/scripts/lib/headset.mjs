/**
 * Drive the app as a headset user, in IWER (IWSDK's browser XR emulator,
 * Quest 3 profile): enter the immersive session, switch to hand tracking,
 * and move the head and hands smoothly through IWER's remote-control
 * commands (the same ones the `iwsdk xr` CLI uses). Optionally records a
 * video of exactly what the headset shows.
 *
 * Software rendering is slow here, so the session runs slower than real
 * time; `finish` speeds the video up by the measured factor, and every
 * timed move is stretched by the same factor, so motion plays back at
 * natural speed.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

/** The checks and recordings open the café in test mode (`?test`): no title card or walkthrough, all six servers, a free shop. */
export const APP_URL = process.env.APP_URL ?? 'https://localhost:8082/?test';
export const OUT_DIR = 'artifacts';

/**
 * Options: `size` (frame), `fovDeg` (vertical field of view: Quest 3 is
 * about 96 degrees per eye), `record` (a video name, or none),
 * `maxSpeedUp` (how far the session may be slowed to gather frames: the
 * video plays back at measured fps x speed-up, so a slow scene wants a
 * higher cap at the cost of recording time), and `prepare(h)`, run
 * before the first kept frame.
 */
export async function startHeadset({ size = { width: 1032, height: 800 }, fovDeg = 96, record = null, maxSpeedUp = 4, prepare } = {}) {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required'] });
  const startedAt = Date.now();
  const context = await browser.newContext({
    viewport: size,
    ignoreHTTPSErrors: true,
    ...(record ? { recordVideo: { dir: OUT_DIR, size } } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__cafe?.world && window.IWER_DEVICE, null, { timeout: 30000 });
  await page.evaluate(installHelpers);
  await page.evaluate((f) => window.__h.setup(f), fovDeg);
  const fps = await page.evaluate(() => window.__h.measureFps());
  const speedUp = Math.min(maxSpeedUp, Math.max(1, 30 / fps));
  await page.evaluate((s) => (window.__h.speedUp = s), speedUp);

  const call = (name, ...args) => page.evaluate(([n, a]) => window.__h[n](...a), [name, args]);
  const h = {
    page,
    errors,
    fps,
    speedUp,
    call,
    /** Wait `ms` of playback time. */
    pause: (ms) => page.waitForTimeout(ms * speedUp),
    /** Move the head to `position`, looking at `target`, over `ms` (playback time). */
    head: (position, target, ms = 0) => call('head', position, target, ms * speedUp),
    /**
     * Move the right hand so its grip (the palm, where IWSDK's grab sphere
     * is) reaches `grip`, turned to `orientation` (a quaternion), over `ms`.
     */
    hand: (grip, orientation, ms = 0) => call('hand', grip, orientation, ms * speedUp),
    /** Close (1) or open (0) the right hand's pinch: IWSDK grabs with it. */
    pinch: (value) => call('pinch', value),
    gripPoint: () => call('gripPoint'),
    /** Remember how the right hand holds the object named `name` (call right after grabbing it). */
    noteHold: (name) => call('noteHold', name),
    /**
     * Move the held object (see noteHold) to `position`, turned by Euler
     * degrees `{ yaw, pitch, roll }` (order YXZ), over `ms`: the hand goes
     * wherever it must to hold it there.
     */
    carry: (position, turn, ms = 0) => call('carry', position, turn, ms * speedUp),
    /** World position of a named scene object. */
    objectPosition: (name) => call('objectPosition', name),
    screenshot: (path) => page.screenshot({ path }),
    /**
     * Stop, and when recording, make the mp4: the video trimmed to the
     * content and sped up by the measured factor, with the game's own
     * soundtrack (its music, and every effect it logged, at the moment it
     * happened on the video's clock) rendered offline and mixed in.
     */
    /** Reload the page as a player would (what it saved stays), and set the headset up again. */
    async reload() {
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__cafe?.world && window.IWER_DEVICE, null, { timeout: 30000 });
      await page.evaluate(installHelpers);
      await page.evaluate((f) => window.__h.setup(f), fovDeg);
      await page.evaluate((s) => (window.__h.speedUp = s), speedUp);
    },
    async finish() {
      let wav = null;
      if (record) {
        const seconds = (Date.now() - contentBegins) / 1000 / speedUp + 0.5;
        // The video's clock starts 0.2 s (real time) before the content.
        const origin = pageOrigin - 0.2;
        wav = await page.evaluate(
          async ([seconds, origin, speedUp]) => {
            const { Soundscape, game } = window.__cafe;
            if (!Soundscape || !game) return null;
            const buffer = await Soundscape.renderOffline(game.sound.log, seconds, origin, speedUp);
            const bytes = new Uint8Array(Soundscape.toWav(buffer));
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            return btoa(binary);
          },
          [seconds, origin, speedUp],
        );
      }
      await context.close();
      await browser.close();
      if (!record) return errors;
      const webm = `${OUT_DIR}/${record}.webm`;
      renameSync(await video.path(), webm);
      const trim = Math.max(0, (contentBegins - startedAt) / 1000 - 0.2);
      const audio = [];
      if (wav) {
        writeFileSync(`${OUT_DIR}/${record}.wav`, Buffer.from(wav, 'base64'));
        audio.push('-i', `${OUT_DIR}/${record}.wav`, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '160k', '-shortest');
      }
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-ss', trim.toFixed(2), '-i', webm, ...audio,
        '-vf', `setpts=PTS/${speedUp.toFixed(3)},fps=30`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart',
        `${OUT_DIR}/${record}.mp4`,
      ]);
      return errors;
    },
  };
  const video = record ? page.video() : null;
  await prepare?.(h);
  const contentBegins = Date.now();
  // The page's clock at the same moment (the sound log is on that clock).
  const pageOrigin = await page.evaluate(() => performance.now() / 1000);
  h.pageOrigin = pageOrigin;
  return h;
}

// In-page helpers (window.__h). Moves are frame-paced: one IWER command per
// rendered frame, so motion stays smooth however slowly the page renders.
function installHelpers() {
  const { world } = window.__cafe;
  const device = window.IWER_DEVICE;
  const V = world.camera.position.constructor;
  const Q = world.camera.quaternion.constructor;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => world.renderer.info.render.frame;
  const nextFrame = async () => {
    const f = frame();
    while (frame() === f) await sleep(8);
  };
  const send = (method, params) => device.remote.dispatch(method, params);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const toV = (p) => new V(p.x, p.y, p.z);
  const toQ = (q) => new Q(q.x, q.y, q.z, q.w);
  /** The grip pose of the right hand this frame (world). */
  const gripPose = () =>
    new Promise((resolve) => {
      const session = world.renderer.xr.getSession();
      session.requestAnimationFrame((t, xrFrame) => {
        const space = world.renderer.xr.getReferenceSpace();
        const source = [...session.inputSources].find((s) => s.handedness === 'right');
        const pose = xrFrame.getPose(source.gripSpace, space);
        const p = pose.transform.position;
        const o = pose.transform.orientation;
        resolve({
          position: new V(p.x, p.y, p.z).applyMatrix4(world.player.matrixWorld),
          orientation: new Q(o.x, o.y, o.z, o.w),
        });
      });
    });

  let headPos = new V(0, 1.6, 0);
  let headTarget = new V(0, 1, -1);
  const lookAt = async (position, target) => {
    await send('set_transform', { device: 'headset', position: { x: position.x, y: position.y, z: position.z } });
    await send('look_at', { device: 'headset', target: { x: target.x, y: target.y, z: target.z } });
  };

  window.__h = {
    speedUp: 1,
    async setup(fovDeg) {
      if (!world.renderer.xr.isPresenting) await send('accept_session', {});
      await sleep(1500);
      device.fovy = (fovDeg * Math.PI) / 180;
      await send('set_input_mode', { mode: 'hand' });
      // The emulator's own overlay (controls, the remote-control banner) is not part of the headset view.
      for (const el of document.querySelectorAll('*')) if (el.shadowRoot) el.style.display = 'none';
      // ...nor is its overlay canvas (it draws a ring at the view's centre), which sits above the
      // renderer's canvas. The canvas below it is the emulator's stand-in for passthrough (the
      // living room): that one stays, as the real room would.
      const above = Number(getComputedStyle(world.renderer.domElement).zIndex) || 0;
      for (const canvas of document.querySelectorAll('canvas'))
        if (canvas !== world.renderer.domElement && getComputedStyle(canvas).position === 'fixed' && (Number(getComputedStyle(canvas).zIndex) || 0) > above)
          canvas.style.visibility = 'hidden';
      await lookAt(headPos, headTarget);
      await send('set_transform', { device: 'hand-left', position: { x: -0.25, y: 0.8, z: 0.15 } });
      await send('set_transform', { device: 'hand-right', position: { x: 0.25, y: 0.85, z: 0.05 } });
      await sleep(800);
      // Where the grip sits relative to the hand's own pose (constant).
      const hand = await send('get_transform', { device: 'hand-right' });
      const grip = await gripPose();
      const inv = toQ(hand.orientation).invert();
      this.gripOffset = grip.position.clone().sub(toV(hand.position)).applyQuaternion(inv);
    },
    async measureFps() {
      const f0 = frame();
      const t0 = performance.now();
      await sleep(1500);
      return ((frame() - f0) * 1000) / (performance.now() - t0);
    },
    async head(position, target, ms) {
      const fromP = headPos.clone();
      const fromT = headTarget.clone();
      const toP = toV(position);
      const toT = toV(target);
      const t0 = performance.now();
      for (;;) {
        const t = ms > 0 ? Math.min(1, (performance.now() - t0) / ms) : 1;
        const e = ease(t);
        headPos = fromP.clone().lerp(toP, e);
        headTarget = fromT.clone().lerp(toT, e);
        await lookAt(headPos, headTarget);
        if (t >= 1) return;
        await nextFrame();
      }
    },
    async hand(grip, orientation, ms) {
      const now = await send('get_transform', { device: 'hand-right' });
      const fromQ = toQ(now.orientation);
      const toQuat = orientation ? toQ(orientation) : fromQ.clone();
      const fromGrip = toV(now.position).add(this.gripOffset.clone().applyQuaternion(fromQ));
      const toGrip = toV(grip);
      const t0 = performance.now();
      for (;;) {
        const t = ms > 0 ? Math.min(1, (performance.now() - t0) / ms) : 1;
        const e = ease(t);
        const q = fromQ.clone().slerp(toQuat, e);
        const g = fromGrip.clone().lerp(toGrip, e);
        const p = g.sub(this.gripOffset.clone().applyQuaternion(q));
        await send('set_transform', {
          device: 'hand-right',
          position: { x: p.x, y: p.y, z: p.z },
          orientation: { x: q.x, y: q.y, z: q.z, w: q.w },
        });
        if (t >= 1) return;
        await nextFrame();
      }
    },
    async pinch(value) {
      await send('set_select_value', { device: 'hand-right', value });
      for (let i = 0; i < 4; i++) await nextFrame();
    },
    async gripPoint() {
      const g = await gripPose();
      return { x: g.position.x, y: g.position.y, z: g.position.z };
    },
    noteHold(name) {
      const object = world.scene.getObjectByName(name);
      object.updateWorldMatrix(true, false);
      return send('get_transform', { device: 'hand-right' }).then((hand) => {
        const M = object.matrixWorld.constructor;
        const handM = new M().compose(toV(hand.position), toQ(hand.orientation), new V(1, 1, 1));
        // The object's pose in the hand's frame.
        this.held = { object, rel: handM.invert().multiply(object.matrixWorld.clone()) };
      });
    },
    /**
     * The held object does not follow the hand quite rigidly (its position
     * wanders by up to a centimetre as the hand turns), so the carry closes
     * the loop: each frame it measures where the object really is and
     * corrects the hand by the error, and at the end it settles until the
     * object is within 1.5 mm of the asked pose.
     */
    async carry(position, turn, ms) {
      const { object, rel } = this.held;
      const M = object.matrixWorld.constructor;
      const E = world.camera.rotation.constructor;
      const relInv = rel.clone().invert();
      const fromP = object.getWorldPosition(new V());
      const fromQ = object.getWorldQuaternion(new Q());
      const d = Math.PI / 180;
      const toQuat = new Q().setFromEuler(new E((turn.pitch ?? 0) * d, (turn.yaw ?? 0) * d, (turn.roll ?? 0) * d, 'YXZ'));
      const toP = toV(position);
      const t0 = performance.now();
      const scale = new V(1, 1, 1);
      this.carryError ??= new V();
      let expected = null;
      let settling = 0;
      for (;;) {
        if (expected) {
          // How far the object missed last frame's target: fold it into the correction.
          object.updateWorldMatrix(true, false);
          const miss = expected.clone().sub(object.getWorldPosition(new V()));
          this.carryError.addScaledVector(miss, 0.8);
          if (settling && miss.length() < 0.0015) return;
          if (settling > 8) return;
        }
        const t = ms > 0 ? Math.min(1, (performance.now() - t0) / ms) : 1;
        const e = ease(t);
        const targetP = fromP.clone().lerp(toP, e);
        const target = new M().compose(targetP, fromQ.clone().slerp(toQuat, e), scale);
        const hand = target.multiply(relInv);
        const p = new V();
        const q = new Q();
        hand.decompose(p, q, new V());
        p.add(this.carryError);
        await send('set_transform', {
          device: 'hand-right',
          position: { x: p.x, y: p.y, z: p.z },
          orientation: { x: q.x, y: q.y, z: q.z, w: q.w },
        });
        expected = targetP;
        if (t >= 1) settling++;
        await nextFrame();
      }
    },
    /** World position of a named scene object. */
    objectPosition(name) {
      const p = world.scene.getObjectByName(name).getWorldPosition(new V());
      return { x: p.x, y: p.y, z: p.z };
    },
  };
}
