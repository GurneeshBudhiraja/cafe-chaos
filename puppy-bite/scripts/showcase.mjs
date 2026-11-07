/**
 * Dev aid: every pose, in a row on the blanket, seen up close from a few
 * angles, to judge the puppies' look.
 *
 * Usage: dev server running, then `node scripts/showcase.mjs`.
 * Output: artifacts/showcase-*.png
 */

import { startHeadset } from './lib/headset.mjs';

const h = await startHeadset({
  async prepare(h) {
    await h.page.evaluate(() => {
      const { world, game, spawnPuppy, POSES, COATS } = window.__pup;
      game.clear();
      const V = world.camera.position.constructor;
      POSES.forEach((pose, i) => spawnPuppy(world, pose, COATS[i % COATS.length], i * 3 + 1, new V(-0.3 + i * 0.15, 0.872, -0.62), 0));
    });
    await h.head({ x: 0, y: 1.5, z: -0.2 }, { x: 0, y: 0.9, z: -0.62 });
    await h.pause(600);
  },
});
await h.screenshot('artifacts/showcase-row.png');
await h.head({ x: 0, y: 1.1, z: -0.3 }, { x: 0, y: 0.9, z: -0.62 }, 500);
await h.pause(400);
await h.screenshot('artifacts/showcase-front.png');
await h.head({ x: -0.5, y: 1.05, z: -0.4 }, { x: -0.15, y: 0.89, z: -0.62 }, 500);
await h.pause(400);
await h.screenshot('artifacts/showcase-left.png');
await h.head({ x: 0.45, y: 1.05, z: -0.4 }, { x: 0.15, y: 0.89, z: -0.62 }, 500);
await h.pause(400);
await h.screenshot('artifacts/showcase-right.png');
const errors = await h.finish();
console.log(`errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
