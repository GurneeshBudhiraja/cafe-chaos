/**
 * Phase 1 check: cutting tracks where the blade goes.
 *
 * 1. Pinch the knife off the counter.
 * 2. Cut across a corner of the cake: only the corner comes off.
 * 3. Push the blade down into the cake's middle, stopping short of the far
 *    side: the cake is scored (a groove), not cut.
 * 4. Finish that cut with a second stroke along the same line: the cake
 *    splits.
 *
 * Usage: dev server running, then `node scripts/test-cut.mjs`.
 * Output: artifacts/cut-*.png, and a pass/fail line.
 */

import { startHeadset } from './lib/headset.mjs';

const turnAbout = (axis, deg) => {
  const r = (deg * Math.PI) / 360;
  return { x: axis[0] * Math.sin(r), y: axis[1] * Math.sin(r), z: axis[2] * Math.sin(r), w: Math.cos(r) };
};
const PALM_DOWN = turnAbout([1, 0, 0], -90);
const BOARD_TOP = 0.9 + 0.02;
/** The lowest point of the knife's edge, below the knife's origin (metres). */
const EDGE_DEPTH = 0.034;
/** From the knife's origin to the heel and the tip of the edge, along the blade (metres). */
const EDGE_HEEL = 0.058;
const EDGE_TIP = 0.256;
const EDGE_MIDDLE = 0.15;
const CAKE_TOP = BOARD_TOP + 0.092;

const h = await startHeadset({
  async prepare(h) {
    await h.head({ x: -0.2, y: 1.6, z: 0.05 }, { x: -0.34, y: 0.95, z: -0.62 });
    await h.hand({ x: 0.1, y: 0.95, z: -0.1 }, PALM_DOWN);
    await h.pause(800);
  },
});
const { pause } = h;

const pieces = () => h.page.evaluate(() => window.__cake.world.scene.getObjectsByProperty('name', 'CakePiece').length);
const grooves = () => h.page.evaluate(() => window.__cake.world.scene.getObjectsByProperty('name', 'Groove').length);
const cuts = () => h.page.evaluate(() => window.__cake.cut.cuts);
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

await h.screenshot('artifacts/cut-0-cake.png');
// A close look at the cake, as you would lean in.
await h.head({ x: -0.3, y: 1.22, z: -0.3 }, { x: -0.34, y: 0.96, z: -0.62 }, 600);
await pause(300);
await h.screenshot('artifacts/cut-0-close.png');
await h.head({ x: -0.2, y: 1.6, z: 0.05 }, { x: -0.34, y: 0.95, z: -0.62 }, 500);
const knife = await h.objectPosition('Knife');
const cake = await h.objectPosition('CakePiece');

// --- 1. Pinch the knife.
await h.hand({ x: knife.x, y: knife.y + 0.03, z: knife.z }, PALM_DOWN, 900);
await h.pinch(1);
await h.noteHold('Knife');
await pause(300);
// Lift it straight up, well clear of the counter, before turning it toward the cake.
await h.hand({ x: knife.x, y: knife.y + 0.3, z: knife.z }, null, 700);
await h.carry({ x: knife.x, y: knife.y + 0.3, z: knife.z }, { yaw: 45, pitch: 0, roll: 0 }, 700);

/** Knife pose that puts the edge point `along` metres from the heel over world (x, z), at height y, blade heading `yaw`. */
const bladeAt = ({ x, z }, along, y, yaw) => {
  const r = (yaw * Math.PI) / 180;
  const bx = Math.cos(r);
  const bz = -Math.sin(r);
  return { position: { x: x - bx * along, y, z: z - bz * along }, turn: { yaw, pitch: 0, roll: 0 } };
};
const leanOver = () => h.head({ x: -0.28, y: 1.38, z: -0.22 }, { x: cake.x, y: cake.y + 0.04, z: cake.z }, 900);

// --- 2. Corner cut: a 45° line across the near-right corner.
await leanOver();
const corner = { x: cake.x + 0.055, z: cake.z + 0.055 };
let pose = bladeAt(corner, EDGE_MIDDLE, CAKE_TOP + 0.06 + EDGE_DEPTH, 45);
await h.carry(pose.position, pose.turn, 900);
await pause(200);
pose = bladeAt(corner, EDGE_MIDDLE, BOARD_TOP + EDGE_DEPTH + 0.003, 45);
await h.carry(pose.position, pose.turn, 600);
await pause(500);
check('corner cut splits off the corner only', (await pieces()) === 2 && (await cuts()) === 1, `${await pieces()} pieces, ${await cuts()} cuts`);
await h.head({ x: -0.22, y: 1.18, z: -0.38 }, { x: cake.x, y: cake.y + 0.03, z: cake.z }, 500);
await pause(200);
await h.screenshot('artifacts/cut-1-crumbs.png');
await leanOver();
pose = bladeAt(corner, EDGE_MIDDLE, CAKE_TOP + 0.08 + EDGE_DEPTH, 45);
await h.carry(pose.position, pose.turn, 600);
await pause(400);
await h.screenshot('artifacts/cut-1-corner.png');

// --- 3. A partial cut: the edge tip reaches only to 2 cm short of the middle, along world X.
// The edge from the heel at cake x - 0.218 to the tip at cake x - 0.02: inside the cake only on its left part.
let tipAt = { x: cake.x - 0.02, z: cake.z };
pose = bladeAt(tipAt, EDGE_TIP, CAKE_TOP + 0.06 + EDGE_DEPTH, 0);
await h.carry(pose.position, pose.turn, 900);
pose = bladeAt(tipAt, EDGE_TIP, BOARD_TOP + EDGE_DEPTH + 0.003, 0);
await h.carry(pose.position, pose.turn, 600);
await pause(300);
check('partial cut does not split', (await pieces()) === 2, `${await pieces()} pieces`);
pose = bladeAt(tipAt, EDGE_TIP, CAKE_TOP + 0.08 + EDGE_DEPTH, 0);
await h.carry(pose.position, pose.turn, 600);
await pause(400);
check('partial cut leaves a groove', (await grooves()) === 1, `${await grooves()} grooves`);
await h.screenshot('artifacts/cut-2-groove.png');

// --- 4. Finish it: a second stroke along the same line, from 3 cm left of the middle out past the right side.
const heelAt = { x: cake.x - 0.03, z: cake.z };
pose = bladeAt(heelAt, EDGE_HEEL, CAKE_TOP + 0.06 + EDGE_DEPTH, 0);
await h.carry(pose.position, pose.turn, 900);
pose = bladeAt(heelAt, EDGE_HEEL, BOARD_TOP + EDGE_DEPTH + 0.003, 0);
await h.carry(pose.position, pose.turn, 600);
await pause(500);
check('second stroke finishes the cut', (await pieces()) === 3 && (await cuts()) === 2, `${await pieces()} pieces, ${await cuts()} cuts`);
pose = bladeAt(heelAt, EDGE_HEEL, CAKE_TOP + 0.1 + EDGE_DEPTH, 0);
await h.carry(pose.position, pose.turn, 700);
await pause(500);
await h.screenshot('artifacts/cut-3-split.png');
await h.head({ x: -0.3, y: 1.2, z: -0.3 }, { x: -0.34, y: 0.95, z: -0.62 }, 600);
await pause(300);
await h.screenshot('artifacts/cut-3-close.png');

// --- 5. Pick up a piece and look at its cut face.
await h.pinch(0);
await pause(300);
await h.hand({ x: cake.x + 0.1, y: BOARD_TOP + 0.2, z: cake.z + 0.1 }, PALM_DOWN, 600);
const names = await h.page.evaluate(() => {
  const w = window.__cake.world;
  return w.scene.getObjectsByProperty('name', 'CakePiece').map((o) => [o.position.x, o.position.y, o.position.z]);
});
console.log('pieces at', JSON.stringify(names.map((p) => p.map((v) => v.toFixed(3)))));

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; errors ${errors.length}; ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
process.exit(results.every((r) => r.ok) && errors.length === 0 ? 0 : 1);
