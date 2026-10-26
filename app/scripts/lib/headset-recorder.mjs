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
    rayDrag: (from, to, ms) => page.evaluate(([f, t, d]) => window.__rec.rayDrag(f, t, d), [from, to, ms * speedUp]),
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
      objectCenter(name) {
        const o = world.scene.getObjectByName(name);
        const w = o.getWorldPosition(new V());
        return { x: w.x, y: w.y, z: w.z };
      },
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
