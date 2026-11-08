/**
 * The guests, recorded as the headset shows it (Quest 3 field of view, no
 * captions): seated at the table, the café appears; guests come up the
 * path one after another and line up at the door, the first in the gate
 * opening, each with a patience timer over its head. A lean in to watch
 * them. The first timer runs out: that guest steps out of the line, walks
 * away and fades, and the others step up. More arrive. A last look over
 * the café.
 *
 * Patience is shortened for the recording (the game waits 90 seconds);
 * pass a number of seconds to change it: `npm run record -- 20`.
 *
 * Usage: dev server running (`npm run dev`), then `node scripts/record-guests.mjs [patience]`.
 * Output: artifacts/guests.mp4
 */

import { startHeadset } from './lib/headset.mjs';

const PATIENCE = Number(process.argv[2] ?? 18);
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const TABLE = { x: -1.3, y: 0.79, z: 0.28 };
/** The gate is at the café's right, which from this seat is toward -z; the line runs on from it. */
const GATE_LOOK = { x: -1.32, y: 0.82, z: 0.02 };

const h = await startHeadset({
  record: 'guests',
  maxSpeedUp: 10,
  async prepare(h) {
    await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z });
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: { x: -1.0, y: 0.98, z: 0.43 }, orientation: { x: -0.5, y: 0.3, z: 0.1, w: 0.8 } }));
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-left', position: { x: -0.7, y: 0.95, z: 0.5 }, orientation: { x: -0.5, y: -0.2, z: -0.1, w: 0.83 } }));
    // The page renders slowly and the video is sped up to match: slow the game's clock by the
    // same factor, so arrivals and timers run at their true pace on the video.
    await h.page.evaluate(
      ([patience, timeScale]) => {
        const { system, guests } = window.__cafe;
        system.timeScale = timeScale;
        guests.patienceSeconds = patience;
        guests.spawnRange = [3, 5];
        system.replace();
      },
      [PATIENCE, 1 / h.speedUp],
    );
  },
});
const { pause } = h;

// 1. The café arrives; the first guests come through the gate.
await pause(3000);
await h.head({ x: -0.95, y: 1.12, z: 0.18 }, GATE_LOOK, 1500);
await pause(5000);

// 2. Lean in over the door to watch the line, timers ticking.
await h.head({ x: -1.05, y: 1.02, z: -0.08 }, { x: -1.33, y: 0.83, z: 0.0 }, 1500);
await pause(PATIENCE * 1000 - 6000);

// 3. The first guest's timer runs out: it steps out, walks away and fades; the rest step up.
await h.head({ x: -1.0, y: 1.08, z: 0.0 }, { x: -1.3, y: 0.82, z: -0.04 }, 1200);
await pause(9000);

// 4. A last look over the whole café, more guests arriving.
await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.1, z: TABLE.z }, 1600);
await pause(5000);

const state = await h.page.evaluate(() => ({ arrived: window.__cafe.guests.arrived, gaveUp: window.__cafe.guests.gaveUp, present: window.__cafe.guests.guests.length }));
const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; speed-up x${h.speedUp.toFixed(2)}; ${JSON.stringify(state)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
