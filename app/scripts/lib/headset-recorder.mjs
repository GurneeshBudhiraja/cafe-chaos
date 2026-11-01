/**
 * Shared setup for headset-view recordings (IWER, Quest 3 profile).
 *
 * The recording enters the immersive session: the classroom backdrop hides,
 * IWER's simulated room stands in for passthrough, and all input is the
 * emulated right hand (ray + pinch) driven through IWER's remote-control
 * interface, the same commands the `iwsdk xr` CLI uses.
 *
 * Software rendering is slow here, so recordings run slower than real time;
 * `finish` speeds the video up by the measured factor.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';
import { launchBrowser, openApp } from './app-driver.mjs';
import { densify, layoutLine } from './handwriting.mjs';

const SIZE = { width: 960, height: 540 };
export const OUT_DIR = 'artifacts';
const PEN_SPEED = 0.2; // page widths per second at playback
const STEP = 0.004; // page-width spacing of replayed pen points

/**
 * Open the app, enter XR and install the in-page helpers (`window.__rec`).
 * Returns the page, paced helpers, and `finish(name)` to encode the video.
 *
 * Options: `size` (video frame), `fovDeg` (the emulated headset's vertical
 * field of view; Quest 3 is about 96 degrees per eye), and `captions`
 * (false leaves the frame exactly as the headset shows it). `prepare(rec)`
 * runs after XR entry and before the video's first kept frame, to stage the
 * scene and pose without showing it.
 */
export async function startHeadsetRecording({ size = SIZE, fovDeg, captions = true, prepare } = {}) {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await launchBrowser();
  const startedAt = Date.now();
  const context = await browser.newContext({
    viewport: size,
    ignoreHTTPSErrors: true,
    recordVideo: { dir: OUT_DIR, size },
  });
  const { page, logs } = await openApp(context);
  const video = page.video();
  await installHelpers(page);
  if (fovDeg) await page.evaluate((f) => (window.IWER_DEVICE.fovy = (f * Math.PI) / 180), fovDeg);
  if (!captions) await page.evaluate(() => window.__rec.hideCaptions());
  await page.evaluate(() => window.__rec.setup());
  const fps = await page.evaluate(() => window.__rec.measureFps());
  const speedUp = Math.min(4, Math.max(1, 30 / fps));
  // The video is sped up by `speedUp`, so slow the app's UI animation clock
  // by the same factor: transitions and follow keep their true speed.
  await page.evaluate((s) => window.__metaNotes.demo?.setAnimationSpeed(s), 1 / speedUp);
  // In-page helpers that wait on the app's (slowed) clock need the factor too.
  await page.evaluate((s) => (window.__rec.speedUp = s), speedUp);

  const msPerPoint = (STEP / PEN_SPEED) * 1000 * speedUp;
  const writeStroke = (points) =>
    page.evaluate(([p, ms]) => window.__rec.writeStroke(p, ms), [densify(points, STEP), msPerPoint]);

  const rec = {
    page,
    logs,
    fps,
    speedUp,
    pause: (ms) => page.waitForTimeout(ms * speedUp),
    caption: (t) => page.evaluate((x) => window.__rec.caption(x), t),
    lookAt: (target, ms) => page.evaluate(([t, d]) => window.__rec.lookAt(t, d), [target, ms * speedUp]),
    /** Turn the head to an absolute yaw/pitch (degrees; yaw 0 faces -Z, positive turns left). */
    turnHead: (yawDeg, pitchDeg, ms) =>
      page.evaluate(([y, p, d]) => window.__rec.turnHead(y, p, d), [yawDeg, pitchDeg, ms * speedUp]),
    /** Place the hand (world metres) and keep it aimed where it pointed. */
    moveHand: (position) => page.evaluate((p) => window.__rec.moveHand(p), position),
    moveHead: (position) => page.evaluate((p) => window.__rec.moveHead(p), position),
    objectCenter: (name) => page.evaluate((n) => window.__rec.objectCenter(n), name),
    tap: (name) => page.evaluate((n) => window.__rec.tap(n), name),
    /** Aim the hand ray at a named UI element without pinching (hover). */
    point: (name) => page.evaluate((n) => window.__rec.point(n), name),
    rayDrag: (from, to, ms) => page.evaluate(([f, t, d]) => window.__rec.rayDrag(f, t, d), [from, to, ms * speedUp]),
    /** Reach for the pen beside the tablet and pinch it up (a held writing grip). */
    pickUpPen: (ms) => page.evaluate((d) => window.__rec.pickUpPen(d), ms * speedUp),
    /**
     * Write strokes (page [u, v] points) with the held pen's nib, the way a
     * hand writes: the nib moves at `speed` (metres a second, on screen)
     * along each stroke, hops a centimetre between strokes, and the
     * hand never jumps, however slowly the page renders.
     */
    penWrite: (strokes, speed = 0.09) => page.evaluate(([s, v]) => window.__rec.penWrite(s, v), [strokes, speed / speedUp]),
    /** Carry the pen back to its place beside the tablet and let go of it there. */
    putDownPen: (ms = 900) => page.evaluate((d) => window.__rec.putDownPen(d), ms * speedUp),
    /** Tap the held pen `count` times: a quick open-and-close of the holding fingers (2 = double-tap). */
    penTap: (count = 1) => page.evaluate((n) => window.__rec.penTap(n), count),
    /** Move the held pen so its nib travels to a world point over `ms`. */
    moveNibTo: (point, ms) => page.evaluate(([p, d]) => window.__rec.moveNibTo(p, d), [point, ms * speedUp]),
    /** Close (1) or open (0) the free left hand's pinch. */
    leftPinch: (value) => page.evaluate((v) => window.__rec.leftPinch(v), value),
    /** Move the free left hand to a world position (it then rests in view). */
    moveLeftHand: (position) => page.evaluate((p) => window.__rec.moveLeftHand(p), position),
    writeStroke,
    /** Handwrite `text` on the tablet (see handwriting.mjs for options). */
    async writeLine(text, options) {
      const line = layoutLine(text, options);
      for (const stroke of line.strokes) {
        await writeStroke(stroke);
        await rec.pause(60);
      }
      return line;
    },
    /** Close the browser and encode `artifacts/<name>.mp4`. */
    async finish(name) {
      await context.close(); // Finalises the video file.
      await browser.close();
      const trimSeconds = Math.max(0, (contentBegins - startedAt) / 1000 - 0.2);
      const webm = `${OUT_DIR}/${name}.webm`;
      renameSync(await video.path(), webm);
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-ss', trimSeconds.toFixed(2), '-i', webm,
        '-vf', `setpts=PTS/${speedUp.toFixed(3)},fps=30`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart',
        `${OUT_DIR}/${name}.mp4`,
      ]);
      return logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror'));
    },
  };
  await prepare?.(rec);
  // Content before this moment (page load, XR entry, staging) is trimmed off.
  const contentBegins = Date.now();
  return rec;
}

// In-page helpers. `call` sends one IWER remote command; frame-paced loops
// wait for a newly rendered frame between commands so input stays smooth.
function installHelpers(page) {
  return page.evaluate(() => {
    const { world } = window.__metaNotes;
    const device = window.IWER_DEVICE;
    const V = world.camera.position.constructor;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const frame = () => world.renderer.info.render.frame;
    const nextFrame = async () => {
      const f = frame();
      while (frame() === f) await sleep(8);
    };
    const call = (method, params) => device.remote.dispatch(method, params);
    const surface = () => world.scene.getObjectByName('WritingSurface');
    const toWorld = (u, v) => {
      const s = surface();
      const { width, height } = s.geometry.parameters;
      const w = s.localToWorld(new V((u - 0.5) * width, (0.5 - v) * height, 0));
      return { x: w.x, y: w.y, z: w.z };
    };
    const hidePanels = () => {
      for (const el of document.querySelectorAll('*')) if (el.shadowRoot) el.style.display = 'none';
    };
    let headTarget = { x: 0, y: 0.95, z: -0.42 };

    const caption = document.createElement('div');
    caption.style.cssText =
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:90%;padding:8px 16px;border-radius:10px;' +
      'background:rgba(15,17,21,0.8);color:#fff;font:600 16px/1.35 system-ui,sans-serif;text-align:center;z-index:2147483647';
    document.body.appendChild(caption);

    window.__rec = {
      caption: (t) => (caption.textContent = t),
      hideCaptions: () => (caption.style.display = 'none'),
      hidePanels,
      async measureFps() {
        const f0 = frame();
        const t0 = performance.now();
        await sleep(1500);
        return ((frame() - f0) * 1000) / (performance.now() - t0);
      },
      async setup() {
        if (!world.renderer.xr.isPresenting) await call('accept_session', {});
        await sleep(1200);
        hidePanels();
        await call('set_input_mode', { mode: 'hand' });
        await call('set_transform', { device: 'headset', position: { x: 0, y: 1.22, z: 0.1 } });
        await call('look_at', { device: 'headset', target: headTarget });
        await call('set_transform', { device: 'hand-right', position: { x: 0.16, y: 1.0, z: -0.1 } });
        // The idle left hand rests at the user's side, out of view.
        await call('set_transform', { device: 'hand-left', position: { x: -0.3, y: 0.75, z: 0.15 } });
        // Aim the hand at the tablet when there is one, else where the head looks.
        const handTarget = surface() ? toWorld(0.5, 0.5) : headTarget;
        await call('look_at', { device: 'hand-right', target: handTarget });
        await sleep(600);
        hidePanels();
      },
      /** Move the head to a world position, keeping its current gaze target. */
      async moveHead(position) {
        await call('set_transform', { device: 'headset', position });
        await call('look_at', { device: 'headset', target: headTarget });
      },
      /** Turn the head smoothly to an absolute yaw/pitch (degrees) over `ms`. */
      async turnHead(yawDeg, pitchDeg, ms) {
        const head = world.camera.getWorldPosition(new V());
        const dir = new V(headTarget.x, headTarget.y, headTarget.z).sub(head).normalize();
        const fromYaw = Math.atan2(-dir.x, -dir.z);
        const fromPitch = Math.asin(dir.y);
        const toYaw = (yawDeg * Math.PI) / 180;
        const toPitch = (pitchDeg * Math.PI) / 180;
        const t0 = performance.now();
        for (;;) {
          const t = Math.min(1, (performance.now() - t0) / ms);
          const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          const yaw = fromYaw + (toYaw - fromYaw) * e;
          const pitch = fromPitch + (toPitch - fromPitch) * e;
          headTarget = {
            x: head.x - 2 * Math.sin(yaw) * Math.cos(pitch),
            y: head.y + 2 * Math.sin(pitch),
            z: head.z - 2 * Math.cos(yaw) * Math.cos(pitch),
          };
          await call('look_at', { device: 'headset', target: headTarget });
          if (t >= 1) return;
          await nextFrame();
        }
      },
      async moveHand(position) {
        await call('set_transform', { device: 'hand-right', position });
      },
      /** Turn the head smoothly toward a world point over `ms`. */
      async lookAt(target, ms) {
        const from = { ...headTarget };
        const t0 = performance.now();
        for (;;) {
          const t = Math.min(1, (performance.now() - t0) / ms);
          const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          headTarget = {
            x: from.x + (target.x - from.x) * e,
            y: from.y + (target.y - from.y) * e,
            z: from.z + (target.z - from.z) * e,
          };
          await call('look_at', { device: 'headset', target: headTarget });
          if (t >= 1) return;
          await nextFrame();
        }
      },
      async point(name) {
        await call('look_at', { device: 'hand-right', target: this.objectCenter(name) });
      },
      /** Aim the hand ray at a named UI element and pinch once (a tap). */
      async tap(name) {
        await call('look_at', { device: 'hand-right', target: this.objectCenter(name) });
        await sleep(350);
        await call('set_select_value', { device: 'hand-right', value: 1 });
        await sleep(220);
        await call('set_select_value', { device: 'hand-right', value: 0 });
        await sleep(250);
      },
      /** Pinch on world point `from`, sweep the ray to `to` over `ms`, release. */
      async rayDrag(from, to, ms) {
        await call('look_at', { device: 'hand-right', target: from });
        await sleep(350);
        await call('set_select_value', { device: 'hand-right', value: 1 });
        await nextFrame();
        const t0 = performance.now();
        for (;;) {
          const t = Math.min(1, (performance.now() - t0) / ms);
          const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          await call('look_at', {
            device: 'hand-right',
            target: {
              x: from.x + (to.x - from.x) * e,
              y: from.y + (to.y - from.y) * e,
              z: from.z + (to.z - from.z) * e,
            },
          });
          if (t >= 1) break;
          await nextFrame();
        }
        await nextFrame();
        await call('set_select_value', { device: 'hand-right', value: 0 });
        await nextFrame();
      },
      tabletCenter: () => toWorld(0.5, 0.5),
      // The app's own helper knows where nested UIKit elements really are.
      objectCenter: (name) => window.__metaNotes.demo.objectCenter(name),
      /** Write one stroke: aim the hand ray along page points, pinch held. */
      async writeStroke(points, msPerPoint) {
        await call('look_at', { device: 'hand-right', target: toWorld(...points[0]) });
        await nextFrame();
        await nextFrame();
        await call('set_select_value', { device: 'hand-right', value: 1 });
        await nextFrame();
        const t0 = performance.now();
        let sent = 0;
        while (sent < points.length - 1) {
          const due = Math.min(points.length - 1, Math.floor((performance.now() - t0) / msPerPoint));
          if (due > sent) {
            sent = due;
            await call('look_at', { device: 'hand-right', target: toWorld(...points[sent]) });
          }
          await nextFrame();
        }
        await nextFrame();
        await call('set_select_value', { device: 'hand-right', value: 0 });
        await nextFrame();
      },
      /** World position of the right hand's pinch (thumb and index tips' midpoint). */
      pinchPoint() {
        return new Promise((resolve) => {
          const session = world.renderer.xr.getSession();
          session.requestAnimationFrame((t, xrFrame) => {
            const space = world.renderer.xr.getReferenceSpace();
            const hand = [...session.inputSources].find((s) => s.handedness === 'right' && s.hand)?.hand;
            const at = (name) => xrFrame.getJointPose(hand.get(name), space).transform.position;
            const a = at('thumb-tip');
            const b = at('index-finger-tip');
            resolve(new V((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2).applyMatrix4(world.player.matrixWorld));
          });
        });
      },
      handPosition: () => call('get_transform', { device: 'hand-right' }).then((t) => new V(t.position.x, t.position.y, t.position.z)),
      /** Move the right hand to `to` over `ms`, keeping its orientation. */
      async moveHandTo(to, ms, orientation) {
        const from = await this.handPosition();
        const t0 = performance.now();
        for (;;) {
          const t = Math.min(1, (performance.now() - t0) / ms);
          const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          const p = from.clone().lerp(to, e);
          await call('set_transform', { device: 'hand-right', position: { x: p.x, y: p.y, z: p.z }, orientation });
          if (t >= 1) return;
          await nextFrame();
        }
      },
      async pickUpPen(ms) {
        const pen = world.scene.getObjectByName('Stylus').getWorldPosition(new V());
        // A right-handed writing grip: the hand comes from above and to the
        // right, so the pen leans left across the view, as one is held.
        const forward = world.camera.getWorldDirection(new V()).setY(0).normalize();
        const right = forward.clone().cross(new V(0, 1, 0));
        const hover = pen.clone().addScaledVector(right, 0.09).add(new V(0, 0.13, 0)).addScaledVector(forward, -0.03);
        await this.moveHandTo(hover, ms * 0.5);
        await call('look_at', { device: 'hand-right', target: { x: pen.x, y: pen.y, z: pen.z } });
        this.grip = (await call('get_transform', { device: 'hand-right' })).orientation;
        // Where the pinch closes, relative to the hand, in this grip.
        // Each pinch change is held for a few rendered frames, so the app
        // sees the hand open before it closes again (slow recordings).
        const settle = async (ms) => {
          await sleep(ms);
          for (let i = 0; i < 3; i++) await nextFrame();
        };
        await call('set_select_value', { device: 'hand-right', value: 1 });
        await settle(400);
        const offset = (await this.pinchPoint()).sub(await this.handPosition());
        await call('set_select_value', { device: 'hand-right', value: 0 });
        await settle(300);
        await this.moveHandTo(pen.clone().sub(offset), ms * 0.5, this.grip);
        await settle(150);
        await call('set_select_value', { device: 'hand-right', value: 1 });
        await settle(400);
        if (!world.globals['metaNotes.pen']?.held) {
          const p = await this.pinchPoint();
          const at = world.scene.getObjectByName('Stylus').getWorldPosition(new V());
          throw new Error(`pickUpPen: the pinch closed ${p.distanceTo(at).toFixed(3)} m from the pen, which stayed put.`);
        }
      },
      async penWrite(strokes, speed) {
        const held = world.globals['metaNotes.pen'];
        if (!held?.held) throw new Error('penWrite: the pen is not in hand.');
        const s = surface();
        const up = new V(0, 0, 1).transformDirection(s.matrixWorld);
        // The nib's offset from the hand (fixed while the grip holds).
        const nibOffset = held.nib.clone().sub(await this.handPosition());
        const nibAt = (u, v, lift) => {
          const p = toWorld(u, v);
          return new V(p.x, p.y, p.z).addScaledVector(up, lift);
        };
        // The nib's whole path: from where it is, hop to each stroke, trace
        // it pressed a hair into the page (it rests on it), lift, and so on.
        // Lifted clear of the page between strokes (the app lifts the pen off above 6 mm).
        const HOP_M = 0.01;
        // First up and clear of the page: picked up from beside the tablet,
        // the nib starts a few centimetres below the page's surface.
        const path = [held.nib.clone(), held.nib.clone().addScaledVector(up, 0.06)];
        for (const points of strokes) {
          path.push(nibAt(points[0][0], points[0][1], HOP_M));
          for (const [u, v] of points) path.push(nibAt(u, v, -0.001));
          const last = points[points.length - 1];
          path.push(nibAt(last[0], last[1], HOP_M));
        }
        const along = [0];
        for (let i = 1; i < path.length; i++) along.push(along[i - 1] + path[i].distanceTo(path[i - 1]));
        const total = along[along.length - 1];
        const t0 = performance.now();
        const hand = new V();
        let i = 1;
        for (;;) {
          const travelled = Math.min(total, ((performance.now() - t0) / 1000) * speed);
          while (i < path.length - 1 && along[i] < travelled) i++;
          const span = along[i] - along[i - 1];
          const t = span > 0 ? (travelled - along[i - 1]) / span : 1;
          hand.lerpVectors(path[i - 1], path[i], t).sub(nibOffset);
          await call('set_transform', { device: 'hand-right', position: { x: hand.x, y: hand.y, z: hand.z }, orientation: this.grip });
          if (travelled >= total) return;
          await nextFrame();
        }
      },
      async putDownPen(ms) {
        // Back to its place beside the tablet (PenSystem's resting pose), then let go.
        const pens = world.getSystems().find((system) => system.constructor.name === 'PenSystem');
        const tablet = world.scene.getObjectByName('Tablet');
        const stylus = world.scene.getObjectByName('Stylus');
        if (pens && tablet && stylus) {
          const rest = tablet.localToWorld(pens.restPosition.clone());
          const pinchToCentre = stylus.getWorldPosition(new V()).sub(await this.pinchPoint());
          const pinchOffset = (await this.pinchPoint()).sub(await this.handPosition());
          // Lift off the page first, so the nib never drags across it, then
          // let go just above its place: it settles there, lying flat.
          await this.moveHandTo((await this.handPosition()).add(new V(0, 0.05, 0)), ms * 0.3, this.grip);
          const above = rest.add(new V(0, 0.02, 0));
          await this.moveHandTo(above.sub(pinchToCentre).sub(pinchOffset), ms * 0.7, this.grip);
        }
        await call('set_select_value', { device: 'hand-right', value: 0 });
        // Fingers must stay open a moment (on the app's clock) for the pen to be let go: a quick open is a tap.
        await sleep(650 * (this.speedUp ?? 1));
        for (let i = 0; i < 3; i++) await nextFrame();
      },
      async penTap(count) {
        // One rendered frame open, one closed: quick enough to be a tap even when frames are slow.
        for (let i = 0; i < count; i++) {
          await call('set_select_value', { device: 'hand-right', value: 0 });
          await nextFrame();
          await call('set_select_value', { device: 'hand-right', value: 1 });
          await nextFrame();
        }
        // The emulator applies input a frame late: let the app see the last close.
        await nextFrame();
        await nextFrame();
      },
      async moveNibTo(point, ms) {
        const held = world.globals['metaNotes.pen'];
        const hand = await this.handPosition();
        const target = new V(point.x, point.y, point.z).sub(held.nib.clone().sub(hand));
        await this.moveHandTo(target, ms, this.grip);
      },
      async leftPinch(value) {
        await call('set_select_value', { device: 'hand-left', value });
        await nextFrame();
        await nextFrame();
        await nextFrame();
      },
      async moveLeftHand(position) {
        await call('set_transform', { device: 'hand-left', position });
        await nextFrame();
      },
      /** Pinch the tablet handle and drag it by moving the hand. */
      async dragHandle(dx, dy, dz, ms) {
        const grip = this.objectCenter('TabletHandleGrip');
        const start = { x: 0.16, y: 1.0, z: -0.1 };
        await call('look_at', { device: 'hand-right', target: grip });
        await sleep(500);
        await call('set_select_value', { device: 'hand-right', value: 1 });
        await sleep(400);
        const t0 = performance.now();
        for (;;) {
          const t = Math.min(1, (performance.now() - t0) / ms);
          const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          await call('set_transform', {
            device: 'hand-right',
            position: { x: start.x + dx * e, y: start.y + dy * e, z: start.z + dz * e },
          });
          if (t >= 1) break;
          await nextFrame();
        }
        await sleep(400);
        await call('set_select_value', { device: 'hand-right', value: 0 });
        await call('set_transform', { device: 'hand-right', position: start });
      },
    };
  });
}
