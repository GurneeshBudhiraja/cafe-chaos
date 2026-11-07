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
import { mkdirSync, renameSync } from 'node:fs';
import { chromium } from 'playwright';

export const APP_URL = process.env.APP_URL ?? 'https://localhost:8082/';
export const OUT_DIR = 'artifacts';

/**
 * Options: `size` (frame), `fovDeg` (vertical field of view: Quest 3 is
 * about 96 degrees per eye), `record` (a video name, or none), and
 * `prepare(h)`, run before the first kept frame.
 */
export async function startHeadset({ size = { width: 1032, height: 800 }, fovDeg = 96, record = null, prepare } = {}) {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--ignore-certificate-errors'] });
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
  await page.waitForFunction(() => window.__cake?.world && window.IWER_DEVICE, null, { timeout: 30000 });
  await page.evaluate(installHelpers);
  await page.evaluate((f) => window.__h.setup(f), fovDeg);
  const fps = await page.evaluate(() => window.__h.measureFps());
  const speedUp = Math.min(4, Math.max(1, 30 / fps));
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
    async finish() {
      await context.close();
      await browser.close();
      if (!record) return errors;
      const webm = `${OUT_DIR}/${record}.webm`;
      renameSync(await video.path(), webm);
      const trim = Math.max(0, (contentBegins - startedAt) / 1000 - 0.2);
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-ss', trim.toFixed(2), '-i', webm,
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
  return h;
}

// In-page helpers (window.__h). Moves are frame-paced: one IWER command per
// rendered frame, so motion stays smooth however slowly the page renders.
function installHelpers() {
  const { world } = window.__cake;
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
      // ...nor is its overlay canvas (it draws a ring at the view's centre).
      for (const canvas of document.querySelectorAll('canvas'))
        if (canvas !== world.renderer.domElement && getComputedStyle(canvas).position === 'fixed') canvas.style.visibility = 'hidden';
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
      for (;;) {
        const t = ms > 0 ? Math.min(1, (performance.now() - t0) / ms) : 1;
        const e = ease(t);
        const target = new M().compose(fromP.clone().lerp(toP, e), fromQ.clone().slerp(toQuat, e), scale);
        const hand = target.multiply(relInv);
        const p = new V();
        const q = new Q();
        hand.decompose(p, q, new V());
        await send('set_transform', {
          device: 'hand-right',
          position: { x: p.x, y: p.y, z: p.z },
          orientation: { x: q.x, y: q.y, z: q.z, w: q.w },
        });
        if (t >= 1) return;
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
