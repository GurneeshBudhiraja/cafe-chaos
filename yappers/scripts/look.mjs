/**
 * A quick look at the scene as the headset shows it: enter the session,
 * stand at the table, and save screenshots from a few viewpoints (the
 * whole table, the queue up close, the bus up close). Dev aid for checking
 * a change without recording a video.
 *
 * Usage: dev server running, then `node scripts/look.mjs [name] [easy|medium|hard] [seed]`.
 * Output: artifacts/look-<name>-*.png
 */

import { startHeadset } from './lib/headset.mjs';

const name = process.argv[2] ?? 'scene';
const difficulty = process.argv[3] ?? 'easy';
const seed = Number(process.argv[4] ?? 5);
const h = await startHeadset({
  async prepare(h) {
    await h.page.evaluate(([d, s]) => window.__yap.game.start(d, s), [difficulty, seed]);
    await h.head({ x: 0, y: 1.6, z: 0.1 }, { x: 0, y: 0.92, z: -0.62 });
    await h.pause(800);
  },
});
await h.screenshot(`artifacts/look-${name}-stand.png`);
// Leaning over the queue on the left.
await h.head({ x: -0.3, y: 1.25, z: -0.25 }, { x: -0.37, y: 0.9, z: -0.58 });
await h.pause(500);
await h.screenshot(`artifacts/look-${name}-queue.png`);
// Looking at the bus on the right.
await h.head({ x: 0.3, y: 1.25, z: -0.3 }, { x: 0.33, y: 0.9, z: -0.66 });
await h.pause(500);
await h.screenshot(`artifacts/look-${name}-bus.png`);
const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
