/**
 * Records the home window from inside the emulated headset (IWER, Quest 3).
 * See lib/headset-recorder.mjs for how the session and hand are driven.
 *
 * Flow: create a note from the home window and write on it, drag
 * the recent-notes strip to scroll, tap a card to open another note,
 * open settings, then collapse to compact mode and expand again.
 *
 * Usage: start the dev server (`npm run dev`), then `npm run record:home`
 * Output: artifacts/home.mp4
 */

import { startHeadsetRecording } from './lib/headset-recorder.mjs';

const rec = await startHeadsetRecording();
const { page, fps, speedUp, pause, caption, lookAt } = rec;

/** Wait for a page predicate, scaled by the recording speed-up. */
const until = (predicate, arg) => page.waitForFunction(predicate, arg, { timeout: 8000 * speedUp });

// A few existing notes so the strip has something to scroll.
await page.evaluate(async () => {
  const { session } = window.__metaNotes;
  for (const title of ['Biology lab', 'Physics ch. 4', 'Groceries', 'History essay', 'Ideas']) {
    await session.createNote(title);
  }
});
const window_ = await rec.objectCenter('recent-section');
const tablet = await page.evaluate(() => window.__rec.tabletCenter());

// Sit a little closer than the default pose so the window reads on video.
await rec.moveHead({ x: 0, y: 1.24, z: -0.12 });
await caption('Headset view (IWER emulator, Quest 3). The grey room stands in for passthrough.');
await lookAt({ x: window_.x, y: window_.y - 0.04, z: window_.z }, 1400);
await pause(1600);
await caption('Home window: live clock, save status, recent notes, New note');
await pause(2600);

await caption('New note: tap it with a pinch');
await rec.tap('note-new-button');
await until(() => window.__metaNotes.session.summaries.length === 7);
await pause(1200);
await lookAt(tablet, 1200);
await caption('It opens on the tablet. Write with your hand.');
await rec.writeLine('Quiz Friday', { u: 0.1, v: 0.3, size: 0.0045, seed: 7 });
await pause(800);
await lookAt({ x: window_.x, y: window_.y - 0.04, z: window_.z }, 1200);

await caption('Pinch and drag the strip to scroll recent notes');
const a = await rec.objectCenter('recent-card-3');
const b = await rec.objectCenter('recent-card-0');
await rec.rayDrag(a, b, 1400);
await pause(1600);
const scrolled = await page.evaluate(() => {
  let node = window.__metaNotes.world.scene.getObjectByName('recent-card-0').parent;
  while (node && !node.scrollPosition) node = node.parent;
  return node?.scrollPosition.peek()[0] ?? 0;
});
await rec.rayDrag(b, a, 1400);
await pause(1200);

await caption('Tap a card to open that note');
const opened = await page.evaluate(() => window.__metaNotes.session.summaries[2].id);
await rec.tap('recent-card-2');
await until((id) => window.__metaNotes.session.active.id === id, opened);
await pause(1600);

await caption('Settings (placeholder for now)');
await rec.tap('settings-button');
await pause(2000);
await rec.tap('settings-button');
await pause(800);

await caption('Compact mode: the window shrinks to a pill');
await rec.tap('compact-toggle');
await until(() => window.__metaNotes.world.scene.getObjectByName('recent-section').isVisible.peek() === false);
await pause(2400);
await caption('Expand to get the full window back');
await rec.tap('expand-toggle');
await until(() => window.__metaNotes.world.scene.getObjectByName('recent-section').isVisible.peek() === true);
await pause(2200);

await caption('Recorded in the emulator; real headset tests still pending.');
await pause(2200);

const result = await page.evaluate(() => ({
  notes: window.__metaNotes.session.summaries.length,
  presenting: window.__metaNotes.world.renderer.xr.isPresenting,
}));
const errors = await rec.finish('home');
console.log(
  `xr ${result.presenting}; ${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; ` +
    `${result.notes} notes; strip scrolled ${Math.round(scrolled)}; errors ${errors.length}`,
);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
