/**
 * Records the app from inside the emulated headset (IWER, Quest 3 profile).
 * See lib/headset-recorder.mjs for how the session and hand are driven.
 *
 * Flow: write notes with the hand, look at each glass panel, move the tablet
 * by its handle.
 *
 * Usage: start the dev server (`npm run dev`), then `npm run record:headset`
 * Output: artifacts/headset.mp4
 */

import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

const rec = await startHeadsetRecording();
const { page, fps, speedUp, pause, caption, lookAt, writeStroke, writeLine } = rec;

function loop(cu, cv, ru, rv) {
  const points = [];
  for (let i = 0; i <= 44; i++) {
    const a = -Math.PI * 0.6 + (i / 40) * Math.PI * 2;
    points.push([cu + ru * Math.cos(a), cv + rv * Math.sin(a)]);
  }
  return points;
}

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
const notes = await rec.objectCenter('note-new-button');
const tools = await rec.objectCenter('camera-start-button');
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
const errors = await rec.finish('headset');
console.log(
  `xr ${result.presenting}; ${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; ` +
    `${result.strokes} strokes; tablet moved to ${JSON.stringify(moved)}; errors ${errors.length}`,
);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
