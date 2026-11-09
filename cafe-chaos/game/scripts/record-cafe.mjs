/**
 * The café at night, recorded as the headset shows it (Quest 3 field of
 * view, no captions): the viewer sits at the table, the session starts,
 * the café pops up on the table in front of them, the room dims to dusk
 * and the lamps come up, their glow spreading over the table. Then a look
 * around: a lean over the front row of tables, along to the gate and its
 * post lamps, the counter at the back under the lanterns, the pond and
 * the cherry tree, a low look along the table at the spill and the
 * shadows, and back to the seated view.
 *
 * The page renders slowly here and the video is sped up to match; the
 * game's clock is slowed by the same factor so the dusk and the lanterns'
 * breath play at their true pace.
 *
 * Usage: dev server running (`npm run dev`), then `npm run record`.
 * Output: artifacts/cafe.mp4
 */

import { startHeadset } from './lib/headset.mjs';

/** The emulated living room's table is to the viewer's left; sit facing it. */
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const TABLE = { x: -1.3, y: 0.79, z: 0.28 };

const h = await startHeadset({
  record: 'cafe',
  // The lit café with shadows renders at about one frame a second in software: stretch time a long
  // way so the video stays smooth (the recording takes about 30 times the video's length).
  maxSpeedUp: 30,
  async prepare(h) {
    await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z });
    // Hands in the lap, behind the eyes, so the emulator's hand outlines stay out of the shots.
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: { x: -0.7, y: 0.85, z: 0.2 }, orientation: { x: -0.5, y: 0.3, z: 0.1, w: 0.8 } }));
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-left', position: { x: -0.7, y: 0.85, z: 0.38 }, orientation: { x: -0.5, y: -0.2, z: -0.1, w: 0.83 } }));
    // The session began before the viewer was seated: start the placement again from here, as a real start would.
    await h.page.evaluate((timeScale) => {
      window.__cafe.system.timeScale = timeScale;
      window.__cafe.system.replace();
    }, 1 / h.speedUp);
  },
});
const { pause } = h;

// 1. Seated at the empty table; the café pops up (plane detection, then the arrival), the room dims and the lamps come up.
await pause(8000);

// 2. Lean in over the front row of tables.
await h.head({ x: -1.0, y: 1.08, z: 0.3 }, { x: -1.3, y: 0.8, z: 0.26 }, 1600);
await pause(1800);

// 3. Along the front to the gate, its post lamps and their pools on the table (the right side, toward -z here).
await h.head({ x: -1.0, y: 1.02, z: 0.0 }, { x: -1.36, y: 0.8, z: 0.02 }, 1500);
await pause(2000);

// 4. Over to the counter at the back, under the lanterns.
await h.head({ x: -1.05, y: 1.15, z: 0.3 }, { x: -1.55, y: 0.88, z: 0.28 }, 1600);
await pause(1800);

// 5. The pond and the cherry tree on the left side.
await h.head({ x: -1.0, y: 1.1, z: 0.45 }, { x: -1.32, y: 0.84, z: 0.5 }, 1500);
await pause(1600);

// 6. Low along the table from the front right: the glow on the table and the café's shadow in it.
await h.head({ x: -0.9, y: 0.95, z: -0.2 }, { x: -1.4, y: 0.8, z: 0.3 }, 1600);
await pause(2200);

// 7. Back to the seated view, taking it all in.
await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.1, z: TABLE.z }, 1600);
await pause(3000);

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; speed-up x${h.speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
