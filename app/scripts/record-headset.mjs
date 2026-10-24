/**
 * Records the app from inside the emulated headset (IWER, Quest 3 profile).
 *
 * Unlike record-demo / record-writing-flow (desktop camera), this enters the
 * immersive session: the classroom backdrop hides, IWER's simulated room
 * stands in for passthrough, and all input is the emulated right hand
 * (ray + pinch) driven through IWER's remote-control interface, the same
 * commands the `iwsdk xr` CLI uses.
 *
 * Flow: write notes with the hand, look at each glass panel, move the tablet
 * by its handle. Software rendering is slow here, so the run is slower than
 * real time and the video is sped up by the measured factor.
 *
 * Usage: start the dev server (`npm run dev`), then `npm run record:headset`
 * Output: artifacts/headset.mp4
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';
import { densify, layoutLine } from './lib/handwriting.mjs';
import { launchBrowser, openApp } from './lib/app-driver.mjs';

const SIZE = { width: 960, height: 540 };
const OUT_DIR = 'artifacts';
const PEN_SPEED = 0.2; // page widths per second at playback
mkdirSync(OUT_DIR, { recursive: true });

const browser = await launchBrowser();
const startedAt = Date.now();
const context = await browser.newContext({
  viewport: SIZE,
  ignoreHTTPSErrors: true,
  recordVideo: { dir: OUT_DIR, size: SIZE },
});
const { page, logs } = await openApp(context);
const video = page.video();

// In-page helpers. `call` sends one IWER remote command; frame-paced loops
// wait for a newly rendered frame between commands so input stays smooth.
await page.evaluate(() => {
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
      await call('look_at', { device: 'hand-right', target: toWorld(0.5, 0.5) });
      await sleep(600);
      hidePanels();
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

// --- run ---------------------------------------------------------------------
await page.evaluate(() => window.__rec.setup());
const fps = await page.evaluate(() => window.__rec.measureFps());
const speedUp = Math.min(4, Math.max(1, 30 / fps));
const STEP = 0.004;
const msPerPoint = (STEP / PEN_SPEED) * 1000 * speedUp;
const pause = (ms) => page.waitForTimeout(ms * speedUp);
const caption = (t) => page.evaluate((x) => window.__rec.caption(x), t);
const lookAt = (target, ms) => page.evaluate(([t, d]) => window.__rec.lookAt(t, d), [target, ms * speedUp]);
const writeStroke = (pts) => page.evaluate(([p, ms]) => window.__rec.writeStroke(p, ms), [densify(pts, STEP), msPerPoint]);

async function writeLine(text, options) {
  const line = layoutLine(text, options);
  for (const stroke of line.strokes) {
    await writeStroke(stroke);
    await pause(60);
  }
  return line;
}

function loop(cu, cv, ru, rv) {
  const points = [];
  for (let i = 0; i <= 44; i++) {
    const a = -Math.PI * 0.6 + (i / 40) * Math.PI * 2;
    points.push([cu + ru * Math.cos(a), cv + rv * Math.sin(a)]);
  }
  return points;
}

const writingBegins = Date.now();
await caption('Headset view (IWER emulator, Quest 3). The grey room stands in for passthrough.');
await pause(2600);

await caption('Write on the tablet with your hand: point and pinch');
const title = await writeLine('Lab notes', { u: 0.08, v: 0.24, size: 0.0045, seed: 11 });
await writeStroke([[0.07, 0.282], [0.3, 0.276], [title.right + 0.02, 0.28]]);
const line2 = { u: 0.08, v: 0.5, size: 0.0034, seed: 23 };
await writeLine('pH 7.2 at 3 pm', line2);
const before = layoutLine('pH ', line2).right;
const after = layoutLine('pH 7.2', line2).right;
await writeStroke(loop((before + after) / 2, 0.455, (after - before) / 2 + 0.035, 0.085));
await pause(600);

await caption('Glass panels: tint and rim light, no blur (passthrough cannot be blurred)');
const notes = await page.evaluate(() => window.__rec.objectCenter('note-new-button'));
const tools = await page.evaluate(() => window.__rec.objectCenter('camera-start-button'));
await lookAt({ x: notes.x + 0.05, y: notes.y - 0.12, z: notes.z }, 1400);
await pause(1800);
await lookAt({ x: tools.x - 0.05, y: tools.y - 0.12, z: tools.z }, 1600);
await pause(1800);
const tablet = await page.evaluate(() => window.__rec.tabletCenter());
await lookAt(tablet, 1400);
await pause(500);

await caption('Move the tablet: pinch its handle and drag');
await page.evaluate(([ms]) => window.__rec.dragHandle(-0.12, 0.1, 0.02, ms), [1800 * speedUp]);
const moved = await page.evaluate(() => window.__rec.tabletCenter());
await lookAt(moved, 1000);
await pause(1200);

await caption('Saved automatically. Recorded in the emulator; real headset tests still pending.');
await pause(2600);

const result = await page.evaluate(() => ({
  strokes: window.__metaNotes.session.active.pages[0].strokes.length,
  presenting: window.__metaNotes.world.renderer.xr.isPresenting,
}));
await context.close();
await browser.close();

const trimSeconds = Math.max(0, (writingBegins - startedAt) / 1000 - 0.2);
const webm = `${OUT_DIR}/headset.webm`;
renameSync(await video.path(), webm);
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-ss', trimSeconds.toFixed(2), '-i', webm,
  '-vf', `setpts=PTS/${speedUp.toFixed(3)},fps=30`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart',
  `${OUT_DIR}/headset.mp4`,
]);
const errors = logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror'));
console.log(
  `xr ${result.presenting}; ${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; ` +
    `${result.strokes} strokes; tablet moved to ${JSON.stringify(moved)}; errors ${errors.length}`,
);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
