/**
 * Records a short desktop demonstration video of the current build.
 *
 * Plays the 17-18 October flow at a watchable pace with on-screen captions:
 * type a note, write on the tablet, autosave, camera capture, reload,
 * simulated save failure and retry, new note, and delete with confirmation.
 *
 * Honesty rules from the roadmap: captions state that this is a desktop
 * browser with the IWER emulator and Chromium's fake camera, not a Quest.
 * Captions and camera moves come from this script only (via the dev hook);
 * the app itself has no caption layer and a fixed desktop camera.
 *
 * Usage: start the dev server (`npm run dev`), then `npm run record:demo`.
 * Output: artifacts/demo.webm, and artifacts/demo.mp4 when ffmpeg exists.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import {
  clickObject,
  drawPath,
  launchBrowser,
  openApp,
  screenPointOf,
  pressAt,
  setPressHoldMs,
  typeInto,
  waitForApp,
  waitForSaved,
} from './lib/app-driver.mjs';

// 960x540 keeps software rendering fast enough for reliable pointer input
// while recording; IWSDK only counts a press as a click if it is released
// quickly, so presses must stay short and frames must keep up.
const SIZE = { width: 960, height: 540 };
const OUT_DIR = 'artifacts';
mkdirSync(OUT_DIR, { recursive: true });

const browser = await launchBrowser([
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
]);
const startedAt = Date.now();
const context = await browser.newContext({
  viewport: SIZE,
  ignoreHTTPSErrors: true,
  permissions: ['camera'],
  recordVideo: { dir: OUT_DIR, size: SIZE },
});
// Short presses: long holds stop counting as clicks.
setPressHoldMs(180);
const { page, logs } = await openApp(context);
const video = page.video();
// Trim the loading screen from the start of the video.
const trimSeconds = Math.max(0, (Date.now() - startedAt) / 1000 - 0.3);

/** Camera shots: [position, look-at target] in meters, scene coordinates. */
const SHOTS = {
  classroom: [[1.1, 1.75, 1.7], [0, 1.0, -1.6]],
  overview: [[0, 1.34, 0.62], [0, 1.0, -0.45]],
  // Panel close-ups sit 0.55 m in front of each panel, along its facing
  // direction, so the whole panel fits even when the save alert grows it.
  notes: [[-0.1, 1.18, -0.12], [-0.44, 1.12, -0.55]],
  tablet: [[0, 1.2, -0.06], [0, 0.95, -0.42]],
  tools: [[0.1, 1.18, -0.12], [0.42, 1.12, -0.55]],
};

/**
 * Click a 3D UI control and wait for its effect. If the press was dropped by
 * the slow software renderer, click again (at most twice) and say so, so the
 * recording never silently skips a step. Smoke tests keep strict single clicks.
 */
let clickRetries = 0;
async function clickUntil(name, effect, timeoutMs = 4000) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await clickObject(page, name);
    try {
      await page.waitForFunction(effect, undefined, { timeout: timeoutMs });
      return;
    } catch {
      clickRetries++;
      const at = await screenPointOf(page, name);
      console.log(`click on ${name} at ${Math.round(at.x)},${Math.round(at.y)} had no effect (attempt ${attempt}); retrying`);
      if (attempt === 1) {
        // Evidence for diagnosis: mark the click point on a screenshot.
        await page.evaluate(([x, y]) => {
          const dot = document.createElement('div');
          dot.id = 'demo-click-marker';
          dot.style.cssText = `position:fixed;left:${x - 8}px;top:${y - 8}px;width:16px;height:16px;border:3px solid red;border-radius:50%;pointer-events:none;z-index:20`;
          document.body.appendChild(dot);
        }, [at.x, at.y]);
        await page.screenshot({ path: `${OUT_DIR}/click-fail-${name}.png` });
        await page.evaluate(() => document.getElementById('demo-click-marker')?.remove());
      }
    }
  }
  throw new Error(`Clicking ${name} had no effect.`);
}

/** Like clickUntil, but the effect is an app log line (camera has no hook). */
async function pressUntilLog(name, logText, timeoutMs = 6000) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = logs.filter((l) => l.includes(logText)).length;
    await pressAt(page, await screenPointOf(page, name));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (logs.filter((l) => l.includes(logText)).length > before) return;
      await page.waitForTimeout(200);
    }
    clickRetries++;
    console.log(`press on ${name} had no effect (attempt ${attempt}); retrying`);
  }
  throw new Error(`Pressing ${name} had no effect.`);
}

const savedAll = () => {
  const { session } = window.__metaNotes;
  return session.saveStatus === 'saved' && !session.hasUnsavedChanges;
};

/** Glide the desktop camera to a named shot over `ms` milliseconds. */
async function shot(name, ms = 900) {
  const [to, look] = SHOTS[name];
  await page.evaluate(
    ([target, lookAt, duration]) =>
      new Promise((resolve) => {
        const camera = window.__metaNotes.world.camera;
        const from = camera.position.clone();
        const end = from.clone().set(...target);
        const focus = from.clone().set(...lookAt);
        const startFocus = window.__demoFocus ?? focus.clone();
        const t0 = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - t0) / duration);
          const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
          camera.position.lerpVectors(from, end, e);
          camera.lookAt(startFocus.clone().lerp(focus, e));
          camera.updateMatrixWorld();
          if (t < 1) requestAnimationFrame(step);
          else {
            window.__demoFocus = focus;
            resolve();
          }
        };
        requestAnimationFrame(step);
      }),
    [to, look, ms],
  );
  // After the view changes, the pointer's hover target updates a frame late
  // and the next press is dropped. A harmless press on empty background in
  // the top-left corner refreshes it, as on page load.
  await page.mouse.move(12, 12);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

/** Show a caption bar at the bottom of the frame (re-added after reloads). */
async function caption(text, holdMs = 0) {
  await page.evaluate((message) => {
    let bar = document.getElementById('demo-caption');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'demo-caption';
      bar.style.cssText =
        'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);' +
        'max-width:88%;padding:12px 22px;border-radius:12px;' +
        'background:rgba(15,17,21,0.82);color:#fff;font:600 17px/1.35 system-ui,sans-serif;' +
        'text-align:center;pointer-events:none;z-index:10';
      document.body.appendChild(bar);
    }
    bar.textContent = message;
  }, text);
  if (holdMs) await page.waitForTimeout(holdMs);
}

/** Page coordinates for a circle; v is scaled so it looks round on a 4:3 page. */
function circle(cu, cv, r, segments = 20) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push([cu + r * Math.cos(a), cv + r * Math.sin(a) * (4 / 3)]);
  }
  return points;
}

try {
  await shot('classroom', 10);
  await caption('Meta Notes: build for 17-18 Oct. Desktop browser + IWER emulator, not a Quest.', 3000);
  await caption('The classroom is a desktop backdrop. In the headset it hides and you see your real room.', 1500);
  await shot('overview', 2200);
  await page.waitForTimeout(800);

  await shot('notes');
  await caption('Type a title and a short note');
  await typeInto(page, 'note-title-input', 'Lab notes', 70);
  await typeInto(page, 'note-text-input', 'Check pH at 3 pm', 55);
  await page.waitForTimeout(800);

  await shot('tablet');
  await caption('Write on the tablet (mouse here; hand pinch in XR)');
  await drawPath(page, [[0.12, 0.22], [0.5, 0.24]], 0, 6);
  await drawPath(page, circle(0.72, 0.32, 0.1, 14), 0, 2);
  await drawPath(page, [[0.15, 0.62], [0.55, 0.62], [0.47, 0.55]], 0, 6);
  await drawPath(page, [[0.55, 0.62], [0.47, 0.69]], 0, 3);
  await drawPath(page, [[0.15, 0.82], [0.3, 0.76], [0.45, 0.84], [0.6, 0.77], [0.8, 0.83]], 0, 3);
  await waitForSaved(page);
  await shot('notes');
  await caption('Autosave: the status shows Saved', 2200);

  await shot('tools');
  await caption('Camera trial: start, then capture one still (Chromium fake camera)');
  await pressUntilLog('camera-start-button', '[MetaNotes:camera] source state: active');
  await page.waitForTimeout(2000);
  await pressUntilLog('camera-capture-button', '[MetaNotes:camera] captured');
  await caption('Still captured. The camera turns off after capture.', 2500);

  await shot('overview');
  await caption('Reload the page: the note comes back from local storage', 1200);
  await page.reload({ waitUntil: 'load' });
  await waitForApp(page);
  await caption('After reload: title, text, and every stroke restored', 2500);

  await shot('tablet', 700);
  await caption('Simulated save failure: new ink is kept on screen');
  await page.evaluate(() => (window.__metaNotes.store.failWrites = true));
  await drawPath(page, [[0.2, 0.42], [0.6, 0.44]], 0, 6);
  await page.waitForFunction(() => window.__metaNotes.session.saveStatus === 'failed');
  await shot('notes');
  await page.waitForTimeout(2500);
  await caption('Try saving again: the kept stroke is saved');
  await page.evaluate(() => (window.__metaNotes.store.failWrites = false));
  await clickUntil('save-retry-button', savedAll);
  await page.waitForTimeout(2000);

  await caption('New note, then delete it: delete always asks first');
  await page.evaluate(() => (window.__demoNotes = window.__metaNotes.session.summaries.length));
  await clickUntil('note-new-button', () => window.__metaNotes.session.summaries.length > window.__demoNotes);
  await waitForSaved(page);
  await typeInto(page, 'note-title-input', 'Shopping', 70);
  await page.waitForTimeout(1200);
  await clickObject(page, 'note-delete-button');
  await page.waitForTimeout(2000);
  await clickObject(page, 'delete-cancel-button');
  await caption('Keep note: nothing is deleted', 2000);
  await clickObject(page, 'note-delete-button');
  await page.waitForTimeout(1500);
  await clickUntil('delete-confirm-button', () => window.__metaNotes.session.summaries.length === 1);
  await caption('Delete note: only the confirmed note is removed', 2500);

  await shot('classroom', 1800);
  await caption('Next: pen tools. Headset checks are still pending.', 3000);
} finally {
  await context.close(); // Finalises the video file.
  await browser.close();
}

const webm = `${OUT_DIR}/demo.webm`;
renameSync(await video.path(), webm);
console.log(`Saved ${webm}`);
console.log(logs.filter((l) => l.includes('MetaNotes:camera') || l.startsWith('error')).join('\n'));
console.log(`click retries during recording: ${clickRetries}`);
try {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', trimSeconds.toFixed(2), '-i', webm, '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', `${OUT_DIR}/demo.mp4`]);
  if (existsSync(`${OUT_DIR}/demo.mp4`)) console.log(`Saved ${OUT_DIR}/demo.mp4`);
} catch {
  console.log('ffmpeg not available; kept the WebM file only.');
}
