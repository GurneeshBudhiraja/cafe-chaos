/**
 * An easy level played as a person would, recorded as the headset shows
 * it (Quest 3 field of view, no captions), hands only, with the game's
 * own soundtrack:
 *
 * 1. At the table: the crowd at the stop with their cards, the empty bus.
 *    A touch on the Easy pad brings a fresh crowd; a lean in to read the
 *    cards.
 * 2. Pinch the first Yapper, lift it (its feet kick), carry it to the bus,
 *    let it go over its seat: it sits, and chirps.
 * 3. The second: dropped onto the first one's seat. A squawk, a boing, and
 *    it bounces off the bus. Picked up again and put in a seat that breaks
 *    its rule: yap yap yap. Once more, into the right seat: happy.
 * 4. The rest in: the bell rings, the driver honks, everyone is content.
 *    A glance at the wrist panel, and a last look at the bus.
 *
 * Usage: dev server running (`npm run dev`), then `npm run record`.
 * Output: artifacts/yappers.mp4
 */

import { startHeadset } from './lib/headset.mjs';

const SEED = Number(process.argv[2] ?? 5);
const turnAbout = (axis, deg) => {
  const r = (deg * Math.PI) / 360;
  return { x: axis[0] * Math.sin(r), y: axis[1] * Math.sin(r), z: axis[2] * Math.sin(r), w: Math.cos(r) };
};
const PALM_DOWN = turnAbout([1, 0, 0], -90);
const STAND = { x: -0.05, y: 1.6, z: 0.12 };
const LEFT_REST = { position: { x: -0.32, y: 0.85, z: 0.05 }, orientation: { x: -0.5, y: 0.2, z: 0.1, w: 0.83 } };

const h = await startHeadset({
  record: 'yappers',
  async prepare(h) {
    await h.page.evaluate((s) => window.__yap.game.start('easy', s), SEED);
    await h.head(STAND, { x: -0.05, y: 0.9, z: -0.62 });
    await h.hand({ x: 0.22, y: 0.92, z: -0.05 }, PALM_DOWN);
    await h.page.evaluate((rest) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-left', ...rest }), LEFT_REST);
    await h.pause(1500);
  },
});
const { pause, page } = h;
const send = (method, params) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [method, params]);

/** The level as the page sees it: the Yappers' names, places and solutions, and the seats' world positions. */
const readLevel = () =>
  page.evaluate(() => {
    const { game } = window.__yap;
    const level = game.level;
    const bus = game.bus;
    bus.group.updateWorldMatrix(true, false);
    return JSON.parse(
      JSON.stringify({
        seats: Array.from({ length: level.rows * 4 }, (_, seat) => bus.group.localToWorld(bus.seatLocal(seat)).toArray()),
        yappers: game.crowd.map((entity, i) => {
          entity.object3D.name = `yapper${i}`;
          return { name: `yapper${i}`, at: entity.object3D.position.toArray(), solution: level.yappers[i].solution };
        }),
      }),
    );
  });
/** A free seat that breaks a rule of Yapper `index`, given who sits where now; -1 if none. */
const badSeatFor = (index) =>
  page.evaluate((index) => {
    const { game, checkYapper, Yapper } = window.__yap;
    const level = game.level;
    const seating = new Map();
    game.crowd.forEach((e, i) => {
      const s = e.getValue(Yapper, 'seat');
      if (s >= 0) seating.set(i, s);
    });
    const taken = new Set(seating.values());
    for (let seat = 0; seat < level.rows * 4; seat++) {
      if (taken.has(seat)) continue;
      const trial = new Map(seating);
      trial.set(index, seat);
      if (checkYapper(level.yappers[index], index, trial, level.rows).some((state) => state === 'bad')) return seat;
    }
    return -1;
  }, index);

// --- 1. Take in the table, lean toward the queue to read the cards, then touch the Easy pad.
await pause(1000);
await h.head({ x: -0.3, y: 1.3, z: -0.2 }, { x: -0.37, y: 0.92, z: -0.58 }, 1300);
await pause(1800);
await h.head(STAND, { x: 0.33, y: 0.9, z: -0.66 }, 1100);
await pause(600);
await h.head(STAND, { x: 0.45, y: 0.88, z: -0.32 }, 800);
const pad = await h.objectPosition('Pad:easy');
await h.hand({ x: pad.x, y: pad.y + 0.14, z: pad.z + 0.06 }, PALM_DOWN, 900);
const tipOffset = await page.evaluate(async () => {
  const w = window.__yap.world;
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
await pause(600);

/** Pinch a Yapper where it stands, look at it, carry it to the bus and let it go over `seat`. */
const board = async (yapper, seat, { from = yapper.at, look = true, admire = true, dwell = 1000 } = {}) => {
  const [x, y, z] = from;
  if (look) await h.head({ x: -0.15, y: 1.45, z: -0.15 }, { x, y, z }, 700);
  await h.hand({ x, y: y + 0.12, z: z + 0.02 }, PALM_DOWN, 900);
  await h.hand({ x, y: y + 0.045, z }, PALM_DOWN, 450);
  await pause(250);
  await h.pinch(1);
  await h.noteHold(yapper.name);
  await pause(400);
  const [sx, sy, sz] = level.seats[seat];
  if (admire) {
    // Up close for a look (the feet kick), then over to the bus.
    await h.carry({ x: x + 0.05, y: y + 0.22, z: z + 0.1 }, { yaw: 0, pitch: 0, roll: 0 }, 700);
    await pause(600);
  } else await h.carry({ x, y: y + 0.15, z }, { yaw: 0, pitch: 0, roll: 0 }, 400);
  await Promise.all([
    h.head({ x: 0.15, y: 1.45, z: -0.12 }, { x: sx, y: sy, z: sz }, 1300),
    h.carry({ x: sx, y: sy + 0.13, z: sz }, { yaw: 0, pitch: 0, roll: 0 }, 1500),
  ]);
  await pause(250);
  await h.carry({ x: sx, y: sy + 0.025, z: sz }, { yaw: 0, pitch: 0, roll: 0 }, 600);
  await pause(100);
  await h.pinch(0);
  await pause(dwell);
};

// --- 2. The first Yapper, into its seat.
await board(level.yappers[0], level.yappers[0].solution);

// --- 3. The second: onto the first one's seat (a bump), then a wrong seat (a grumble), then right.
const second = level.yappers[1];
await board(second, level.yappers[0].solution, { admire: false, dwell: 1700 });
let at = await h.objectPosition(second.name);
await h.head({ x: 0.1, y: 1.4, z: -0.05 }, at, 600);
await pause(300);
const wrong = await badSeatFor(1);
if (wrong >= 0) {
  await board(second, wrong, { from: [at.x, at.y, at.z], look: false, admire: false, dwell: 1800 });
  at = await h.objectPosition(second.name);
}
await board(second, second.solution, { from: [at.x, at.y, at.z], look: false, admire: false, dwell: 1200 });

// --- 4. The rest, in: everyone aboard and content.
for (const yapper of level.yappers.slice(2)) await board(yapper, yapper.solution, { admire: false });
await h.hand({ x: 0.5, y: 1.1, z: -0.3 }, PALM_DOWN, 600);
await pause(1200);

// A glance at the wrist panel: the left hand raised like checking a watch, then a last look at the bus.
const glanceHead = { x: 0.08, y: 1.58, z: -0.02 };
const glanceHand = { x: -0.12, y: 1.25, z: -0.3 };
const orientation = await page.evaluate(
  ([f, b]) => {
    const w = window.__yap.world;
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
const panel = await page.evaluate(() => window.__yap.world.scene.getObjectByName('WristHud').position.toArray());
await h.head(glanceHead, { x: panel[0], y: panel[1], z: panel[2] }, 900);
await pause(2200);
await send('set_transform', { device: 'hand-left', ...LEFT_REST });
await h.head({ x: 0.2, y: 1.25, z: -0.3 }, { x: 0.3, y: 0.9, z: -0.66 }, 1100);
await pause(2600);

const score = await page.evaluate(() => JSON.parse(JSON.stringify(window.__yap.game.score)));
const sounds = await page.evaluate(() => window.__yap.game.sound.log.map((e) => [e.kind, e.t]));
const errors = await h.finish();
console.log('sounds on the video clock:', sounds.map(([k, t]) => `${k}@${((t - h.pageOrigin + 0.2) / h.speedUp).toFixed(1)}s`).join(' '));
console.log(`${h.fps.toFixed(1)} fps; speed-up x${h.speedUp.toFixed(2)}; score ${JSON.stringify(score)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
