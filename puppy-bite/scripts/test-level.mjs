/**
 * Phase 2 check: a level can be played start to finish with the hands.
 *
 * Starts a level from a fixed seed, then for each puppy: pinches it off
 * the blanket, carries it over the bed, turns it as its solution says,
 * and lets go over its solution cells. Expects every puppy to settle and
 * the level to score 3 stars. Then takes one puppy out and drops it on
 * another: expects a nip (and the puppy back on the table).
 *
 * Usage: dev server running, then `node scripts/test-level.mjs [easy|medium|hard] [seed]`.
 * Output: artifacts/level-*.png, and a pass/fail line.
 */

import { startHeadset } from './lib/headset.mjs';

const difficulty = process.argv[2] ?? 'easy';
const seed = Number(process.argv[3] ?? 5);
const turnAbout = (axis, deg) => {
  const r = (deg * Math.PI) / 360;
  return { x: axis[0] * Math.sin(r), y: axis[1] * Math.sin(r), z: axis[2] * Math.sin(r), w: Math.cos(r) };
};
const PALM_DOWN = turnAbout([1, 0, 0], -90);
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({
  async prepare(h) {
    await h.head({ x: -0.05, y: 1.6, z: 0.1 }, { x: -0.05, y: 0.9, z: -0.62 });
    await h.hand({ x: 0.1, y: 0.95, z: -0.1 }, PALM_DOWN);
    await h.pause(500);
  },
});
const { pause, page } = h;

// Start the level; name the puppies so the harness can hold them; read where each belongs.
const level = await page.evaluate(
  ([d, s]) => {
    const { game, world } = window.__pup;
    const level = game.start(d, s);
    const puppies = [...game.puppies.entities];
    puppies.forEach((p, i) => (p.object3D.name = `puppy${i}`));
    const V = world.camera.position.constructor;
    const bed = game.bed;
    bed.group.updateWorldMatrix(true, false);
    return JSON.parse(
      JSON.stringify({
        columns: level.columns,
        rows: level.rows,
        puppies: puppies.map((p, i) => {
          const data = p.object3D.userData.puppy;
          const spec = level.puppies.find((q) => q.pose === data.pose && q.seed === data.seed);
          return { name: `puppy${i}`, pose: data.pose, at: p.object3D.position.toArray(), solution: spec.solution };
        }),
        bedCorner: bed.group.localToWorld(new V().copy(bed.corner)).toArray(),
      }),
    );
  },
  [difficulty, seed],
);
console.log(`${difficulty} level, seed ${seed}: ${level.puppies.length} puppies, bed ${level.columns}x${level.rows}`);
await pause(600);
await h.screenshot(`artifacts/level-${difficulty}-0-start.png`);

// Where a puppy's origin goes for its solution: the footprint's bounding box centre, turned, over the corner cell.
const CELL = 0.07;
const cellsOf = { tiny: [[0, 0]], loaf: [[0, 0], [0, 1]], sprawl: [[0, 0], [0, 1], [1, 0]], stretch: [[0, 0], [1, 0], [2, 0]], curl: [[0, 0], [1, 0], [0, 1], [1, 1]] };
const turnPoint = ([x, z], turns) => {
  const t = ((turns % 4) + 4) % 4;
  return t === 0 ? [x, z] : t === 1 ? [-z, x] : t === 2 ? [-x, -z] : [z, -x];
};
const originFor = (pose, solution) => {
  const cells = cellsOf[pose];
  const cols = Math.max(...cells.map((c) => c[0])) + 1;
  const rows = Math.max(...cells.map((c) => c[1])) + 1;
  // The turned footprint's cells relative to the origin, in metres; their bounding box corner must land on the solution corner.
  const centres = cells.map(([c, r]) => turnPoint([(c + 0.5 - cols / 2) * CELL, (r + 0.5 - rows / 2) * CELL], solution.turns));
  const minX = Math.min(...centres.map((c) => c[0]));
  const minZ = Math.min(...centres.map((c) => c[1]));
  // The corner cell's centre in the world.
  const cornerCentreX = level.bedCorner[0] + (solution.column + 0.5) * CELL;
  const cornerCentreZ = level.bedCorner[2] + (solution.row + 0.5) * CELL;
  return { x: cornerCentreX - minX, y: level.bedCorner[1], z: cornerCentreZ - minZ };
};

for (const puppy of level.puppies) {
  const [x, y, z] = puppy.at;
  await h.head({ x: -0.15, y: 1.45, z: -0.15 }, { x, y, z }, 600);
  await h.hand({ x, y: y + 0.12, z: z + 0.02 }, PALM_DOWN, 800);
  await h.hand({ x, y: y + 0.06, z }, PALM_DOWN, 400);
  await pause(200);
  await h.pinch(1);
  await h.noteHold(puppy.name);
  await pause(250);
  const target = originFor(puppy.pose, puppy.solution);
  const yawDeg = puppy.solution.turns * 90;
  await h.carry({ x, y: y + 0.15, z }, { yaw: 0, pitch: 0, roll: 0 }, 500);
  await Promise.all([
    h.head({ x: 0.15, y: 1.45, z: -0.12 }, { x: target.x, y: target.y, z: target.z }, 1100),
    h.carry({ x: target.x, y: target.y + 0.12, z: target.z }, { yaw: yawDeg, pitch: 0, roll: 0 }, 1300),
  ]);
  await h.carry({ x: target.x, y: target.y + 0.03, z: target.z }, { yaw: yawDeg, pitch: 0, roll: 0 }, 500);
  await pause(100);
  await h.pinch(0);
  await pause(600);
}
await h.hand({ x: 0.5, y: 1.1, z: -0.2 }, PALM_DOWN, 500);
await pause(400);
await h.head({ x: 0.25, y: 1.3, z: -0.25 }, { x: 0.36, y: 0.88, z: -0.65 }, 600);
await pause(300);
await h.screenshot(`artifacts/level-${difficulty}-1-bedded.png`);

let score = await page.evaluate(() => JSON.parse(JSON.stringify(window.__pup.game.score)));
check('every puppy settles into the bed', score.placed === score.total && score.total === level.puppies.length, `${score.placed}/${score.total} on the bed`);
check('the level scores 3 stars', score.complete && score.stars === 3, `complete ${score.complete}, ${score.stars} stars, ${score.nips} nips`);

// --- A nip: lift the first puppy out and drop it on the second one.
const first = level.puppies[0];
const second = level.puppies[1];
const firstAt = await h.objectPosition(first.name);
const secondAt = await h.objectPosition(second.name);
await h.hand({ x: firstAt.x, y: firstAt.y + 0.12, z: firstAt.z }, PALM_DOWN, 700);
await h.hand({ x: firstAt.x, y: firstAt.y + 0.06, z: firstAt.z }, PALM_DOWN, 400);
await h.pinch(1);
await h.noteHold(first.name);
await pause(250);
await h.carry({ x: firstAt.x, y: firstAt.y + 0.15, z: firstAt.z }, { yaw: first.solution.turns * 90, pitch: 0, roll: 0 }, 500);
await h.carry({ x: secondAt.x, y: secondAt.y + 0.06, z: secondAt.z }, { yaw: first.solution.turns * 90, pitch: 0, roll: 0 }, 900);
await h.pinch(0);
await pause(1200);
await h.screenshot(`artifacts/level-${difficulty}-2-nip.png`);
score = await page.evaluate(() => JSON.parse(JSON.stringify(window.__pup.game.score)));
const firstNow = await h.objectPosition(first.name);
check('a puppy dropped on another nips and hops off', score.nips === 1 && score.placed === level.puppies.length - 1, `${score.nips} nips, ${score.placed}/${score.total} on the bed`);
check('the nipped puppy lands back on the table', firstNow.y < 0.9 && firstNow.z > secondAt.z + 0.08, `at y ${firstNow.y.toFixed(3)}, z ${firstNow.z.toFixed(2)} (bed z ${secondAt.z.toFixed(2)})`);

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; errors ${errors.length}; ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
process.exit(results.every((r) => r.ok) && errors.length === 0 ? 0 : 1);
