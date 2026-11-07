/**
 * An easy level played as a person would, recorded as the headset shows
 * it (Quest 3 field of view, no captions), hands only, with the game's
 * own soundtrack:
 *
 * 1. At the counter: the cake, the knife, the box with its two cards, the
 *    pads. A touch on the Easy pad brings a fresh cake.
 * 2. Pinch the knife, lift it, carry it over the cake.
 * 3. Cut straight down through the cake along the card's line, with a
 *    little sawing; the two pieces part.
 * 4. Set the knife down; pick up each piece, turn it the way its card is
 *    turned, and let it go over its cell. The lights turn green.
 * 5. Three stars: a glance at the wrist panel, and a last look at the box.
 *
 * Usage: dev server running (`npm run dev`), then `npm run record`.
 * Output: artifacts/cake.mp4
 */

import { startHeadset } from './lib/headset.mjs';

const SEED = 7;
const turnAbout = (axis, deg) => {
  const r = (deg * Math.PI) / 360;
  return { x: axis[0] * Math.sin(r), y: axis[1] * Math.sin(r), z: axis[2] * Math.sin(r), w: Math.cos(r) };
};
const PALM_DOWN = turnAbout([1, 0, 0], -90);
const STAND = { x: -0.05, y: 1.6, z: 0.12 };
const BOARD_TOP = 0.9 + 0.02;
const CAKE_BASE = BOARD_TOP + 0.004;
const CAKE_TOP = CAKE_BASE + 0.1;
const EDGE_DEPTH = 0.034;
const EDGE_MIDDLE = 0.15;

const h = await startHeadset({
  record: 'cake',
  async prepare(h) {
    // A known easy level, so the cut below matches its cards.
    await h.page.evaluate((s) => window.__cake.game.start('easy', s), SEED);
    await h.head(STAND, { x: -0.05, y: 0.95, z: -0.62 });
    await h.hand({ x: 0.22, y: 0.92, z: -0.05 }, PALM_DOWN);
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-left', position: { x: -0.32, y: 0.85, z: 0.05 }, orientation: { x: -0.5, y: 0.2, z: 0.1, w: 0.83 } }));
    await h.pause(1500);
  },
});
const { pause, page } = h;
const send = (method, params) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [method, params]);
const level = await page.evaluate(() => {
  const l = window.__cake.game.level;
  return JSON.parse(JSON.stringify({ cuts: l.cuts, cards: l.cards }));
});

// --- 1. Take in the counter: the cake on the left, the box on the right, the pads in front.
await pause(1200);
await h.head(STAND, { x: 0.36, y: 0.95, z: -0.64 }, 1200);
await pause(700);
await h.head(STAND, { x: 0.1, y: 0.9, z: -0.38 }, 900);
// Touch the Easy pad with the index finger: a fresh easy cake.
const pad = await h.objectPosition('Pad:easy');
await h.hand({ x: pad.x, y: pad.y + 0.14, z: pad.z + 0.06 }, PALM_DOWN, 900);
const tipOffset = await page.evaluate(async () => {
  const w = window.__cake.world;
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
// The pad started a new level: read it, so the cut matches its cards.
const fresh = await page.evaluate(() => JSON.parse(JSON.stringify({ cuts: window.__cake.game.level.cuts, cards: window.__cake.game.level.cards })));
Object.assign(level, fresh);
await h.head(STAND, { x: -0.34, y: 0.95, z: -0.62 }, 900);
await pause(600);

// --- 2. Pinch the knife and lift it clear.
const knife = await h.objectPosition('Knife');
const cake = await h.objectPosition('CakePiece');
await h.hand({ x: knife.x + 0.01, y: knife.y + 0.09, z: knife.z + 0.03 }, PALM_DOWN, 900);
await h.hand({ x: knife.x, y: knife.y + 0.03, z: knife.z }, PALM_DOWN, 600);
await pause(250);
await h.pinch(1);
await h.noteHold('Knife');
await pause(400);
await h.hand({ x: knife.x, y: knife.y + 0.28, z: knife.z }, null, 800);

/** Knife pose with the edge's middle over world (x, z) at height y, blade heading `yaw` (degrees). */
const bladeAt = ({ x, z }, y, yaw) => {
  const r = (yaw * Math.PI) / 180;
  return { position: { x: x - Math.cos(r) * EDGE_MIDDLE, y, z: z + Math.sin(r) * EDGE_MIDDLE }, turn: { yaw, pitch: 0, roll: 0 } };
};

// --- 3. Over the cake, then down through it along the card's cut, sawing a little.
await h.head({ x: -0.22, y: 1.4, z: -0.2 }, { x: cake.x, y: cake.y + 0.04, z: cake.z }, 1100);
const cut = level.cuts[0];
const at = { x: cake.x + cut.p[0], z: cake.z + cut.p[1] };
const yaw = (Math.atan2(-cut.d[1], cut.d[0]) * 180) / Math.PI;
let pose = bladeAt(at, CAKE_TOP + 0.08 + EDGE_DEPTH, yaw);
await h.carry(pose.position, { ...pose.turn, pitch: 10 }, 1400);
await pause(500);
pose = bladeAt(at, CAKE_TOP + 0.01 + EDGE_DEPTH, yaw);
await h.carry(pose.position, pose.turn, 500);
pose = bladeAt(at, CAKE_BASE + EDGE_DEPTH + 0.003, yaw);
await h.carry(pose.position, pose.turn, 1100);
const r = (yaw * Math.PI) / 180;
const along = (m) => ({ x: pose.position.x + Math.cos(r) * m, y: pose.position.y, z: pose.position.z - Math.sin(r) * m });
await h.carry(along(-0.035), pose.turn, 550);
await h.carry(along(0.035), pose.turn, 700);
await h.carry(along(0), pose.turn, 450);
await pause(700);
pose = bladeAt(at, CAKE_TOP + 0.1 + EDGE_DEPTH, yaw);
await h.carry(pose.position, { ...pose.turn, pitch: 8 }, 800);
await pause(900);

// --- 4. Set the knife down at the front of the board (carried high, clear of the cake), then box the pieces.
await h.carry({ x: cake.x + 0.08, y: CAKE_TOP + 0.16, z: cake.z + 0.27 }, { yaw: 160, pitch: 6, roll: -30 }, 900);
await h.carry({ x: cake.x + 0.08, y: BOARD_TOP + 0.05, z: cake.z + 0.27 }, { yaw: 180, pitch: 0, roll: -70 }, 800);
await pause(150);
await h.pinch(0);
await pause(500);

await page.evaluate(() => window.__cake.world.scene.getObjectsByProperty('name', 'CakePiece').forEach((p, i) => (p.name = `piece${i}`)));
const plan = await page.evaluate(() => {
  const w = window.__cake.world;
  const level = window.__cake.game.level;
  const pieces = [0, 1, 2, 3].map((i) => w.scene.getObjectByName(`piece${i}`)).filter(Boolean);
  const used = new Set();
  return level.cards.map((card, cell) => {
    let best = null;
    pieces.forEach((p, i) => {
      if (used.has(i)) return;
      const fit = window.__cake.fitAtCardTurn(p.userData.piece.polygon, card, window.__cake.iou);
      if (!best || fit > best.fit) best = { i, fit };
    });
    used.add(best.i);
    const p = pieces[best.i];
    return { cell, name: p.name, at: [p.position.x, p.position.y, p.position.z], turn: card.turn };
  });
});
const box = await page.evaluate(() => {
  const b = window.__cake.game.box;
  b.group.updateWorldMatrix(true, false);
  const V = b.group.position.constructor;
  return b.cells.map((c) => b.group.localToWorld(new V().copy(c.centre)).toArray());
});
for (const step of plan) {
  const [x, y, z] = step.at;
  await h.head({ x: -0.1, y: 1.45, z: -0.15 }, { x, y, z }, 700);
  await h.hand({ x, y: y + 0.14, z: z + 0.02 }, PALM_DOWN, 900);
  await h.hand({ x, y: y + 0.07, z }, PALM_DOWN, 500);
  await pause(250);
  await h.pinch(1);
  await h.noteHold(step.name);
  await pause(300);
  const [cx, cy, cz] = box[step.cell];
  const yawDeg = (step.turn * 180) / Math.PI;
  await h.carry({ x, y: y + 0.15, z }, { yaw: 0, pitch: 0, roll: 0 }, 600);
  await Promise.all([
    h.head({ x: 0.1, y: 1.45, z: -0.12 }, { x: cx, y: cy, z: cz }, 1300),
    h.carry({ x: cx, y: cy + 0.13, z: cz }, { yaw: yawDeg, pitch: 0, roll: 0 }, 1500),
  ]);
  await pause(300);
  await h.carry({ x: cx, y: cy + 0.035, z: cz }, { yaw: yawDeg, pitch: 0, roll: 0 }, 650);
  await pause(150);
  await h.pinch(0);
  await pause(900);
}
await h.hand({ x: 0.5, y: 1.05, z: -0.3 }, PALM_DOWN, 600);

// --- 5. Done: raise the left hand like checking a watch (fingers up and away, the back of the
// hand toward the face) to read the wrist panel, then a last look at the box.
await pause(700);
const glanceHead = { x: 0.08, y: 1.58, z: -0.02 };
const glanceHand = { x: -0.12, y: 1.25, z: -0.3 };
const orientation = await page.evaluate(
  ([f, b]) => {
    // The emulated hand's own axes, measured: fingers along local (0, 0.48, -0.88), the back of the hand along (0.1, -0.89, -0.45).
    const w = window.__cake.world;
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
const panel = await page.evaluate(() => window.__cake.world.scene.getObjectByName('WristHud').position.toArray());
await h.head(glanceHead, { x: panel[0], y: panel[1], z: panel[2] }, 900);
await pause(2200);
await send('set_transform', { device: 'hand-left', position: { x: -0.32, y: 0.85, z: 0.05 }, orientation: { x: -0.5, y: 0.2, z: 0.1, w: 0.83 } });
await h.head({ x: 0.2, y: 1.35, z: -0.2 }, { x: 0.36, y: 0.92, z: -0.64 }, 1100);
await pause(2200);

const score = await page.evaluate(() => JSON.parse(JSON.stringify(window.__cake.game.score)));
const sounds = await page.evaluate(() => window.__cake.game.sound.log.filter((e) => e.kind !== 'cutting').map((e) => [e.kind, e.t]));
const errors = await h.finish();
console.log('sounds on the video clock:', sounds.map(([k, t]) => `${k}@${((t - h.pageOrigin + 0.2) / h.speedUp).toFixed(1)}s`).join(' '));
console.log(`${h.fps.toFixed(1)} fps; speed-up x${h.speedUp.toFixed(2)}; score ${JSON.stringify(score)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
