/**
 * An easy level played as a person would, recorded as the headset shows
 * it (Quest 3 field of view, no captions), hands only, with the game's
 * own soundtrack:
 *
 * 1. At the table: three sleepy puppies on the blanket, the empty bed,
 *    the pads. A touch on the Easy pad brings a fresh litter.
 * 2. Pinch the first puppy, lift it (its tail wags), carry it over the
 *    bed, turn it, let it go: it settles in with a sigh.
 * 3. Drop the second puppy carelessly onto the first: a nip, and it hops
 *    back out onto the table. Pick it up again and tuck it in properly.
 * 4. The third puppy in: all asleep, three stars... well, two, after
 *    that nip. A glance at the wrist panel, and a last look at the bed.
 *
 * Usage: dev server running (`npm run dev`), then `npm run record`.
 * Output: artifacts/puppies.mp4
 */

import { startHeadset } from './lib/headset.mjs';

const SEED = 5;
const turnAbout = (axis, deg) => {
  const r = (deg * Math.PI) / 360;
  return { x: axis[0] * Math.sin(r), y: axis[1] * Math.sin(r), z: axis[2] * Math.sin(r), w: Math.cos(r) };
};
const PALM_DOWN = turnAbout([1, 0, 0], -90);
const STAND = { x: -0.05, y: 1.6, z: 0.12 };
const CELL = 0.07;

const h = await startHeadset({
  record: 'puppies',
  async prepare(h) {
    await h.page.evaluate((s) => window.__pup.game.start('easy', s), SEED);
    await h.head(STAND, { x: -0.05, y: 0.9, z: -0.62 });
    await h.hand({ x: 0.22, y: 0.92, z: -0.05 }, PALM_DOWN);
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-left', position: { x: -0.32, y: 0.85, z: 0.05 }, orientation: { x: -0.5, y: 0.2, z: 0.1, w: 0.83 } }));
    await h.pause(1500);
  },
});
const { pause, page } = h;
const send = (method, params) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [method, params]);

/** The level as the page sees it: the puppies' names, poses, places and solutions, and the bed's corner. */
const readLevel = () =>
  page.evaluate(() => {
    const { game, world } = window.__pup;
    const level = game.level;
    const puppies = [...game.puppies.entities];
    puppies.forEach((p, i) => (p.object3D.name = `puppy${i}`));
    const V = world.camera.position.constructor;
    const bed = game.bed;
    bed.group.updateWorldMatrix(true, false);
    return JSON.parse(
      JSON.stringify({
        puppies: puppies.map((p, i) => {
          const data = p.object3D.userData.puppy;
          const spec = level.puppies.find((q) => q.pose === data.pose && q.seed === data.seed);
          return { name: `puppy${i}`, pose: data.pose, at: p.object3D.position.toArray(), solution: spec.solution };
        }),
        bedCorner: bed.group.localToWorld(new V().copy(bed.corner)).toArray(),
      }),
    );
  });
const cellsOf = { tiny: [[0, 0]], loaf: [[0, 0], [0, 1]], sprawl: [[0, 0], [0, 1], [1, 0]], stretch: [[0, 0], [1, 0], [2, 0]], curl: [[0, 0], [1, 0], [0, 1], [1, 1]] };
const turnPoint = ([x, z], turns) => {
  const t = ((turns % 4) + 4) % 4;
  return t === 0 ? [x, z] : t === 1 ? [-z, x] : t === 2 ? [-x, -z] : [z, -x];
};
const originFor = (level, pose, solution) => {
  const cells = cellsOf[pose];
  const cols = Math.max(...cells.map((c) => c[0])) + 1;
  const rows = Math.max(...cells.map((c) => c[1])) + 1;
  const centres = cells.map(([c, r]) => turnPoint([(c + 0.5 - cols / 2) * CELL, (r + 0.5 - rows / 2) * CELL], solution.turns));
  const minX = Math.min(...centres.map((c) => c[0]));
  const minZ = Math.min(...centres.map((c) => c[1]));
  return { x: level.bedCorner[0] + (solution.column + 0.5) * CELL - minX, y: level.bedCorner[1], z: level.bedCorner[2] + (solution.row + 0.5) * CELL - minZ };
};

// --- 1. Take in the table, then touch the Easy pad for a fresh litter.
await pause(1200);
await h.head(STAND, { x: 0.36, y: 0.9, z: -0.65 }, 1100);
await pause(600);
await h.head(STAND, { x: 0.45, y: 0.88, z: -0.32 }, 800);
const pad = await h.objectPosition('Pad:easy');
await h.hand({ x: pad.x, y: pad.y + 0.14, z: pad.z + 0.06 }, PALM_DOWN, 900);
const tipOffset = await page.evaluate(async () => {
  const w = window.__pup.world;
  const hand = await window.IWER_DEVICE.remote.dispatch('get_transform', { device: 'hand-right' });
  const V = w.camera.position.constructor;
  const p = w.input.xr.visualAdapters.hand.right.visual.joints[9].getWorldPosition(new V());
  return { x: p.x - hand.position.x, y: p.y - hand.position.y, z: p.z - hand.position.z };
});
const handForTip = (tip) => ({ x: tip.x - tipOffset.x, y: tip.y - tipOffset.y, z: tip.z - tipOffset.z });
for (const dy of [0.05, 0.03, 0.015, 0.004, -0.006]) {
  await send('set_transform', { device: 'hand-right', position: handForTip({ x: pad.x, y: pad.y + 0.012 + dy, z: pad.z }), orientation: PALM_DOWN });
  await pause(90);
}
await pause(250);
await send('set_transform', { device: 'hand-right', position: handForTip({ x: pad.x, y: pad.y + 0.08, z: pad.z }), orientation: PALM_DOWN });
await pause(900);
const level = await readLevel();
await h.head(STAND, { x: -0.37, y: 0.9, z: -0.62 }, 900);
await pause(800);

/** Pinch a puppy off the blanket and carry it to where it belongs; `careless` drops it short, onto another. */
const tuck = async (puppy, { careless = false, lookFirst = true } = {}) => {
  const [x, y, z] = puppy.at;
  if (lookFirst) await h.head({ x: -0.15, y: 1.45, z: -0.15 }, { x, y, z }, 700);
  await h.hand({ x, y: y + 0.12, z: z + 0.02 }, PALM_DOWN, 900);
  await h.hand({ x, y: y + 0.06, z }, PALM_DOWN, 450);
  await pause(250);
  await h.pinch(1);
  await h.noteHold(puppy.name);
  await pause(400);
  const target = originFor(level, puppy.pose, puppy.solution);
  const yawDeg = puppy.solution.turns * 90;
  // Up close for a look (the tail wags), then over to the bed.
  await h.carry({ x: x + 0.05, y: y + 0.22, z: z + 0.1 }, { yaw: 0, pitch: 0, roll: 0 }, 700);
  await pause(500);
  const drop = careless ? { x: target.x, y: target.y + 0.08, z: target.z } : { x: target.x, y: target.y + 0.03, z: target.z };
  await Promise.all([
    h.head({ x: 0.15, y: 1.45, z: -0.12 }, { x: target.x, y: target.y, z: target.z }, 1300),
    h.carry({ x: target.x, y: target.y + 0.14, z: target.z }, { yaw: yawDeg, pitch: 0, roll: 0 }, 1500),
  ]);
  await pause(250);
  await h.carry(drop, { yaw: yawDeg, pitch: 0, roll: 0 }, careless ? 300 : 600);
  await pause(100);
  await h.pinch(0);
  await pause(careless ? 1400 : 1000);
};

// --- 2. The first puppy, tucked in properly.
await tuck(level.puppies[0]);

// --- 3. The second, dropped carelessly onto the first: a nip and a hop. Then picked up again and tucked in.
const second = level.puppies[1];
const first = level.puppies[0];
{
  const [x, y, z] = second.at;
  await h.head({ x: -0.15, y: 1.45, z: -0.15 }, { x, y, z }, 700);
  await h.hand({ x, y: y + 0.12, z: z + 0.02 }, PALM_DOWN, 900);
  await h.hand({ x, y: y + 0.06, z }, PALM_DOWN, 450);
  await pause(250);
  await h.pinch(1);
  await h.noteHold(second.name);
  await pause(300);
  const onFirst = originFor(level, first.pose, first.solution);
  await h.carry({ x, y: y + 0.18, z }, { yaw: 0, pitch: 0, roll: 0 }, 500);
  await Promise.all([
    h.head({ x: 0.15, y: 1.45, z: -0.12 }, { x: onFirst.x, y: onFirst.y, z: onFirst.z }, 1200),
    h.carry({ x: onFirst.x, y: onFirst.y + 0.1, z: onFirst.z }, { yaw: second.solution.turns * 90, pitch: 0, roll: 0 }, 1300),
  ]);
  await pause(150);
  await h.pinch(0);
  await pause(1600);
  // Where it hopped to; pick it up from there and do it right.
  const hopped = await h.objectPosition(second.name);
  await h.head({ x: 0.1, y: 1.4, z: -0.05 }, hopped, 600);
  await tuck({ ...second, at: [hopped.x, hopped.y, hopped.z] }, { lookFirst: false });
}

// --- 4. The third puppy in: everyone asleep.
await tuck(level.puppies[2]);
await h.hand({ x: 0.5, y: 1.1, z: -0.3 }, PALM_DOWN, 600);
await pause(900);

// A glance at the wrist panel: the left hand raised like checking a watch, then a last look at the bed.
const glanceHead = { x: 0.08, y: 1.58, z: -0.02 };
const glanceHand = { x: -0.12, y: 1.25, z: -0.3 };
const orientation = await page.evaluate(
  ([f, b]) => {
    const w = window.__pup.world;
    const V = w.camera.position.constructor;
    const M = w.camera.matrixWorld.constructor;
    const Q = w.camera.quaternion.constructor;
    const fl = new V(0, 0.476, -0.879).normalize();
    const bl = new V(0.1, -0.89, -0.45);
    bl.sub(fl.clone().multiplyScalar(bl.dot(fl))).normalize();
    const fw = new V(...f).normalize();
    const bw = new V(...b);
    bw.sub(fw.clone().multiplyScalar(bw.dot(fw))).normalize();
    const L = new M().makeBasis(fl, bl, new V().crossVectors(fl, bl));
    const W = new M().makeBasis(fw, bw, new V().crossVectors(fw, bw));
    const q = new Q().setFromRotationMatrix(W.multiply(L.invert()));
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  },
  [[0, 0.75, -0.66], [glanceHead.x - glanceHand.x, glanceHead.y - glanceHand.y, glanceHead.z - glanceHand.z]],
);
await send('set_transform', { device: 'hand-left', position: glanceHand, orientation });
await pause(400);
const panel = await page.evaluate(() => window.__pup.world.scene.getObjectByName('WristHud').position.toArray());
await h.head(glanceHead, { x: panel[0], y: panel[1], z: panel[2] }, 900);
await pause(2200);
await send('set_transform', { device: 'hand-left', position: { x: -0.32, y: 0.85, z: 0.05 }, orientation: { x: -0.5, y: 0.2, z: 0.1, w: 0.83 } });
await h.head({ x: 0.2, y: 1.3, z: -0.25 }, { x: 0.36, y: 0.9, z: -0.65 }, 1100);
await pause(2400);

const score = await page.evaluate(() => JSON.parse(JSON.stringify(window.__pup.game.score)));
const sounds = await page.evaluate(() => window.__pup.game.sound.log.map((e) => [e.kind, e.t]));
const errors = await h.finish();
console.log('sounds on the video clock:', sounds.map(([k, t]) => `${k}@${((t - h.pageOrigin + 0.2) / h.speedUp).toFixed(1)}s`).join(' '));
console.log(`${h.fps.toFixed(1)} fps; speed-up x${h.speedUp.toFixed(2)}; score ${JSON.stringify(score)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
