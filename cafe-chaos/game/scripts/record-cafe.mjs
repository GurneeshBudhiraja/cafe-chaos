/**
 * The café's arrival, recorded as the headset shows it (Quest 3 field of
 * view, no captions): the viewer sits at the table, the session starts,
 * and the café pops up on the table in front of them. Then a look around:
 * a lean over the front row of tables, a look along to the gate and the
 * waiting bench, the counter at the back under the lanterns, and back to
 * the seated view.
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
  // The textured café renders slowly in software: stretch time further so the video stays smooth.
  maxSpeedUp: 10,
  async prepare(h) {
    await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z });
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: { x: -1.0, y: 0.98, z: 0.43 }, orientation: { x: -0.5, y: 0.3, z: 0.1, w: 0.8 } }));
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-left', position: { x: -0.7, y: 0.95, z: 0.5 }, orientation: { x: -0.5, y: -0.2, z: -0.1, w: 0.83 } }));
    // The session began before the viewer was seated: start the placement again from here, as a real start would.
    await h.page.evaluate(() => window.__cafe.system.replace());
  },
});
const { pause } = h;

// 1. Seated at the empty table; the café pops up (plane detection, then the arrival).
await pause(3500);

// 2. Lean in over the front row of tables.
await h.head({ x: -1.0, y: 1.08, z: 0.3 }, { x: -1.3, y: 0.8, z: 0.26 }, 1600);
await pause(1800);

// 3. Along the front to the gate and the waiting bench (the right side, toward -z here).
await h.head({ x: -1.0, y: 1.05, z: 0.12 }, { x: -1.32, y: 0.81, z: 0.08 }, 1500);
await pause(1800);

// 4. Over to the counter at the back, under the lanterns.
await h.head({ x: -1.05, y: 1.15, z: 0.3 }, { x: -1.55, y: 0.88, z: 0.28 }, 1600);
await pause(1800);

// 5. The pond and the cherry tree on the left side.
await h.head({ x: -1.0, y: 1.1, z: 0.45 }, { x: -1.32, y: 0.84, z: 0.5 }, 1500);
await pause(1600);

// 6. Back to the seated view, taking it all in.
await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.1, z: TABLE.z }, 1600);
await pause(2600);

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; speed-up x${h.speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
