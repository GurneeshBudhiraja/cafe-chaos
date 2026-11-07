/**
 * A quick look at the scene as the headset shows it: enter the session,
 * stand at the counter, and save screenshots from a couple of viewpoints.
 * Dev aid for checking a change without recording a video.
 *
 * Usage: dev server running, then `node scripts/look.mjs [name]`.
 * Output: artifacts/look-<name>-*.png
 */

import { startHeadset } from './lib/headset.mjs';

const name = process.argv[2] ?? 'scene';
const h = await startHeadset({
  async prepare(h) {
    await h.head({ x: 0, y: 1.6, z: 0.1 }, { x: 0, y: 0.95, z: -0.6 });
    await h.pause(600);
  },
});
await h.screenshot(`artifacts/look-${name}-stand.png`);
// Leaning over the board, where the cake is cut.
await h.head({ x: -0.25, y: 1.35, z: -0.2 }, { x: -0.34, y: 0.92, z: -0.62 });
await h.pause(400);
await h.screenshot(`artifacts/look-${name}-board.png`);
// Looking at the box on the right.
await h.head({ x: 0.2, y: 1.4, z: -0.15 }, { x: 0.36, y: 0.92, z: -0.64 });
await h.pause(400);
await h.screenshot(`artifacts/look-${name}-box.png`);
const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
