/**
 * Records the writing flow with the app's current mechanisms:
 *   1. write notes on the tablet (cursive, like a person),
 *   2. zoom out to the classroom,
 *   3. move the tablet by its handle (real mouse drag; IWSDK distance grab),
 *   4. zoom back in and keep writing on the moved tablet.
 *
 * "Zoom" is the desktop camera moving (there is no in-app zoom yet; in the
 * headset you simply look closer). Captions say so.
 *
 * Handwriting strokes are replayed as timed pointer events inside the page:
 * they take the same DOM -> IWSDK pointer path as the mouse, without one
 * automation round trip per point. Software rendering here runs at about
 * 9 fps, so the flow is performed slower than real time and the video is
 * sped up by the measured factor to play at a natural pace.
 *
 * Usage: start the dev server (`npm run dev`), then `npm run record:writing`
 * Output: artifacts/writing-flow.mp4
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';
import { densify, layoutLine, seededRandom } from './lib/handwriting.mjs';
import { launchBrowser, openApp, screenPointOf } from './lib/app-driver.mjs';

const SIZE = { width: 960, height: 540 };
const OUT_DIR = 'artifacts';
const PEN_SPEED = 0.16; // page widths per second at playback (~5.8 cm/s)
const STEP = 0.004; // page units between pointer samples
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
const rand = seededRandom(7);

// Playback speed-up: 30 fps video from the measured render rate.
const renderFps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 0;
      const t0 = performance.now();
      const tick = () => {
        frames++;
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
        else resolve(frames / ((performance.now() - t0) / 1000));
      };
      requestAnimationFrame(tick);
    }),
);
const speedUp = Math.min(4, Math.max(1, 30 / renderFps));
/** Wait for `ms` of playback time. */
const pause = (ms) => page.waitForTimeout(ms * speedUp);

// In-page helpers: projection, stroke playback, camera glide, pen marker,
// caption. Installed once so each action is a single round trip.
await page.evaluate(() => {
  const { world } = window.__metaNotes;
  const camera = world.camera;
  const canvas = document.querySelector('canvas');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let focus = null;

  const pen = document.createElement('div');
  pen.style.cssText =
    'position:fixed;left:0;top:0;width:56px;height:56px;pointer-events:none;z-index:30;transform:translate(-100px,-100px)';
  pen.innerHTML = `<svg viewBox="0 0 56 56" width="56" height="56"><g transform="rotate(-45 0 56)">
    <polygon points="0,56 6,50 6,62" fill="#1f2937"/><rect x="6" y="50" width="10" height="12" fill="#d4a373"/>
    <rect x="16" y="50" width="50" height="12" rx="2" fill="#2563eb"/><rect x="62" y="50" width="8" height="12" rx="2" fill="#1e3a8a"/>
    </g></svg>`;
  document.body.appendChild(pen);
  // Real mouse moves and replayed strokes both produce pointermove events.
  window.addEventListener('pointermove', (e) => {
    pen.style.transform = `translate(${e.clientX}px, ${e.clientY - 56}px)`;
  });

  const caption = document.createElement('div');
  caption.style.cssText =
    'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:90%;padding:8px 16px;border-radius:10px;' +
    'background:rgba(15,17,21,0.8);color:#fff;font:600 16px/1.35 system-ui,sans-serif;text-align:center;z-index:31';
  document.body.appendChild(caption);

  const surface = () => world.scene.getObjectByName('WritingSurface');
  window.__flow = {
    caption: (text) => (caption.textContent = text),
    toScreen(points) {
      const s = surface();
      const { width, height } = s.geometry.parameters;
      const v = s.position.clone();
      return points.map(([pu, pv]) => {
        v.set((pu - 0.5) * width, (0.5 - pv) * height, 0);
        s.localToWorld(v).project(camera);
        return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
      });
    },
    /** Replay one stroke as pointer events (same path as a mouse drag). */
    async playStroke(pixels, msPerPoint) {
      const fire = (type, [x, y], buttons) =>
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
          pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons,
        }));
      fire('pointermove', pixels[0], 0);
      await sleep(msPerPoint * 3);
      fire('pointerdown', pixels[0], 1);
      for (const p of pixels.slice(1)) {
        fire('pointermove', p, 1);
        await sleep(msPerPoint);
      }
      fire('pointerup', pixels[pixels.length - 1], 0);
    },
    /** Camera pose that looks straight at the tablet from `distance` m. */
    tabletShot(distance, sideOffset = 0.03) {
      const s = surface();
      const center = s.getWorldPosition(s.position.clone());
      const normal = s.position.clone().set(0, 0, 1).transformDirection(s.matrixWorld);
      const pos = center.clone().addScaledVector(normal, distance);
      pos.x += sideOffset;
      return [pos.toArray(), center.toArray()];
    },
    /** Smoothly move the camera to a pose over `ms` milliseconds. */
    glide(to, look, ms) {
      const from = camera.position.clone();
      const end = from.clone().set(...to);
      const target = from.clone().set(...look);
      const start = focus ?? target.clone();
      const t0 = performance.now();
      return new Promise((resolve) => {
        const step = (now) => {
          const t = Math.min(1, (now - t0) / ms);
          const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          camera.position.lerpVectors(from, end, e);
          camera.lookAt(start.clone().lerp(target, e));
          camera.updateMatrixWorld();
          if (t < 1) requestAnimationFrame(step);
          else {
            focus = target;
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    },
  };
});

// --- node-side actions ------------------------------------------------------
const msPerPoint = (STEP / PEN_SPEED) * 1000 * speedUp;
const caption = (text) => page.evaluate((t) => window.__flow.caption(t), text);

async function writeStroke(stroke) {
  const pixels = await page.evaluate((pts) => window.__flow.toScreen(pts), densify(stroke, STEP));
  await page.evaluate(([px, ms]) => window.__flow.playStroke(px, ms), [pixels, msPerPoint]);
}

async function writeLine(text, options, endPause = 350) {
  const line = layoutLine(text, options);
  for (const stroke of line.strokes) {
    await writeStroke(stroke);
    await pause(60 + rand() * 120); // pen lift between strokes
  }
  await pause(endPause);
  return line;
}

async function glideToTablet(ms) {
  const [pos, look] = await page.evaluate(() => window.__flow.tabletShot(0.5));
  await page.evaluate(([p, l, d]) => window.__flow.glide(p, l, d), [pos, look, ms * speedUp]);
}

async function glideTo(pos, look, ms) {
  await page.evaluate(([p, l, d]) => window.__flow.glide(p, l, d), [pos, look, ms * speedUp]);
}

/** Loose hand-drawn loop around a region. */
function loop(cu, cv, ru, rv) {
  const points = [];
  for (let i = 0; i <= 44; i++) {
    const a = -Math.PI * 0.6 + (i / 40) * Math.PI * 2;
    const r = 1 + (rand() - 0.5) * 0.06;
    points.push([cu + ru * r * Math.cos(a), cv + rv * r * Math.sin(a)]);
  }
  return points;
}

const tabletCenter = () =>
  page.evaluate(() => {
    const s = window.__metaNotes.world.scene.getObjectByName('WritingSurface');
    return s.getWorldPosition(s.position.clone()).toArray();
  });

/** Drag the tablet handle with the real mouse; returns how far it moved. */
async function dragHandle(dx, dy, moves = 30) {
  // Refresh the pointer after the camera move (first press can drop).
  await page.mouse.move(12, 12);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  const before = await tabletCenter();
  const h = await screenPointOf(page, 'TabletHandleGrip');
  await page.mouse.move(h.x, h.y);
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(200);
  for (let i = 1; i <= moves; i++) {
    const t = i / moves;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(h.x + dx * e, h.y + dy * e);
  }
  await pause(300);
  await page.mouse.up();
  const after = await tabletCenter();
  return Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
}

// --- the flow -----------------------------------------------------------------
const OVERVIEW = [[0, 1.36, 0.66], [0, 1.0, -0.45]];
await glideToTablet(10);
await caption('Write a note on the tablet');
const writingBegins = Date.now(); // everything before this is trimmed
await pause(700);

const title = await writeLine('Lab notes', { u: 0.08, v: 0.22, size: 0.0045, seed: 11 }, 250);
await writeStroke([[0.07, 0.262], [0.3, 0.255], [title.right + 0.02, 0.26]]);
await pause(500);
const line2 = { u: 0.08, v: 0.46, size: 0.0033, seed: 23 };
await writeLine('pH 7.2 at 3 pm', line2);
await writeLine('check again Friday', { u: 0.08, v: 0.67, size: 0.0031, seed: 37 });
const before = layoutLine('pH ', line2).right;
const after = layoutLine('pH 7.2', line2).right;
await writeStroke(loop((before + after) / 2, 0.415, (after - before) / 2 + 0.035, 0.085));
await pause(400);

await caption('Zoom out (desktop camera; in the headset you just look)');
await glideTo(...OVERVIEW, 2200);
await pause(900);

await caption('Move the tablet by its blue handle (mouse drag, IWSDK grab)');
let moved = await dragHandle(-150, -60);
if (moved < 0.02) moved = await dragHandle(-150, -60); // dropped press: try once more
await caption(`The ink moves with the tablet; moving adds no ink (moved ${(moved * 100).toFixed(0)} cm)`);
await pause(2200);

await caption('Zoom back in and keep writing');
await glideToTablet(1800);
await writeLine('bring samples', { u: 0.08, v: 0.86, size: 0.0031, seed: 41 });
await writeStroke([[0.86, 0.64], [0.885, 0.68], [0.94, 0.57]]); // tick the reminder
await pause(700);

await caption('Saved automatically. Desktop browser + IWER emulator; headset tests pending.');
await glideTo(...OVERVIEW, 2000);
await pause(2500);

const strokeCount = await page.evaluate(() => window.__metaNotes.session.active.pages[0].strokes.length);
await context.close(); // finalises the video
await browser.close();

// --- encode -------------------------------------------------------------------
const trimSeconds = Math.max(0, (writingBegins - startedAt) / 1000 - 0.3);
const webm = `${OUT_DIR}/writing-flow.webm`;
renameSync(await video.path(), webm);
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-ss', trimSeconds.toFixed(2), '-i', webm,
  '-vf', `setpts=PTS/${speedUp.toFixed(3)},fps=30`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart',
  `${OUT_DIR}/writing-flow.mp4`,
]);
console.log(
  `render ${renderFps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; tablet moved ${(moved * 100).toFixed(1)} cm; ` +
    `${strokeCount} strokes saved; errors: ${logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror')).length}`,
);
