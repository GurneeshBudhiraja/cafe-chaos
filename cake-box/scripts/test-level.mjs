/**
 * Phase 2 check: a level can be played start to finish with the hands.
 *
 * Starts a level from a fixed seed, replays the level's own cuts with the
 * knife (so the pieces match the cards), then picks each piece up, turns it
 * the way its card is turned, and lets go over the card's cell. Expects
 * every piece to fit well and the level to score 3 stars.
 *
 * Usage: dev server running, then `node scripts/test-level.mjs [easy|medium|hard] [seed]`.
 * Output: artifacts/level-*.png, and a pass/fail line.
 */

import { startHeadset } from './lib/headset.mjs';

const difficulty = process.argv[2] ?? 'easy';
const seed = Number(process.argv[3] ?? 7);
const turnAbout = (axis, deg) => {
  const r = (deg * Math.PI) / 360;
  return { x: axis[0] * Math.sin(r), y: axis[1] * Math.sin(r), z: axis[2] * Math.sin(r), w: Math.cos(r) };
};
const PALM_DOWN = turnAbout([1, 0, 0], -90);
const BOARD_TOP = 0.9 + 0.02;
const CAKE_BASE = BOARD_TOP + 0.004;
const CAKE_TOP = CAKE_BASE + 0.1;
const EDGE_DEPTH = 0.034;
const EDGE_MIDDLE = 0.15;

const h = await startHeadset({
  async prepare(h) {
    await h.head({ x: -0.1, y: 1.6, z: 0.1 }, { x: -0.1, y: 0.95, z: -0.62 });
    await h.hand({ x: 0.1, y: 0.95, z: -0.1 }, PALM_DOWN);
    await h.pause(500);
  },
});
const { pause } = h;
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

// Start the level and read it back.
const level = await h.page.evaluate(
  ([d, s]) => {
    const level = window.__cake.game.start(d, s);
    return JSON.parse(JSON.stringify({ cuts: level.cuts, cards: level.cards, cells: level.cells, inner: level.inner }));
  },
  [difficulty, seed],
);
console.log(`${difficulty} level, seed ${seed}: ${level.cards.length} cards, ${level.cuts.length} cuts, box inside ${level.inner.width.toFixed(2)} x ${level.inner.depth.toFixed(2)} m`);
await pause(600);
await h.screenshot(`artifacts/level-${difficulty}-0-start.png`);

const knife = await h.objectPosition('Knife');
const cake = await h.objectPosition('CakePiece');
await h.hand({ x: knife.x, y: knife.y + 0.03, z: knife.z }, PALM_DOWN, 800);
await h.pinch(1);
await h.noteHold('Knife');
await pause(200);
await h.hand({ x: knife.x, y: knife.y + 0.3, z: knife.z }, null, 600);

/** Knife pose with the edge's middle over world (x, z) at height y, blade heading `yaw` (degrees). */
const bladeAt = ({ x, z }, y, yaw) => {
  const r = (yaw * Math.PI) / 180;
  return { position: { x: x - Math.cos(r) * EDGE_MIDDLE, y, z: z + Math.sin(r) * EDGE_MIDDLE }, turn: { yaw, pitch: 0, roll: 0 } };
};

// --- Replay the level's cuts: each is a point and direction in the cake's frame (the cake stands unturned).
await h.head({ x: -0.28, y: 1.38, z: -0.22 }, { x: cake.x, y: cake.y + 0.04, z: cake.z }, 800);
for (const cut of level.cuts) {
  const at = { x: cake.x + cut.p[0], z: cake.z + cut.p[1] };
  const yaw = (Math.atan2(-cut.d[1], cut.d[0]) * 180) / Math.PI;
  let pose = bladeAt(at, CAKE_TOP + 0.07 + EDGE_DEPTH, yaw);
  await h.carry(pose.position, pose.turn, 900);
  await pause(150);
  if (cut === level.cuts[0]) await h.screenshot(`artifacts/level-${difficulty}-1-hold.png`);
  pose = bladeAt(at, CAKE_BASE + EDGE_DEPTH + 0.003, yaw);
  await h.carry(pose.position, pose.turn, 700);
  await pause(200);
  // Saw a little: back and forth along the blade, on the board, so the whole chord is covered.
  const r = (yaw * Math.PI) / 180;
  const along = (m) => ({ x: pose.position.x + Math.cos(r) * m, y: pose.position.y, z: pose.position.z - Math.sin(r) * m });
  await h.carry(along(-0.035), pose.turn, 450);
  await h.carry(along(0.035), pose.turn, 600);
  await h.carry(along(0), pose.turn, 400);
  await pause(300);
  pose = bladeAt(at, CAKE_TOP + 0.09 + EDGE_DEPTH, yaw);
  await h.carry(pose.position, pose.turn, 600);
  await pause(200);
}
const pieceCount = () => h.page.evaluate(() => window.__cake.world.scene.getObjectsByProperty('name', 'CakePiece').length);
check('the cuts make one piece per card', (await pieceCount()) === level.cards.length, `${await pieceCount()} pieces for ${level.cards.length} cards`);
await h.screenshot(`artifacts/level-${difficulty}-1-cut.png`);

// Put the knife down at the front of the counter.
await h.carry({ x: cake.x + 0.1, y: BOARD_TOP + 0.05, z: cake.z + 0.26 }, { yaw: 180, pitch: 0, roll: -70 }, 800);
await h.pinch(0);
await pause(500);

// --- Match pieces to cards: the piece whose footprint overlaps a card's shape best, at the card's turn.
const plan = await h.page.evaluate(() => {
  const w = window.__cake.world;
  const level = window.__cake.game.level;
  const pieces = w.scene.getObjectsByProperty('name', 'CakePiece');
  // Each card takes the free piece that overlaps its shape best (turned as the card is).
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
    return { cell, pieceIndex: best.i, at: [p.position.x, p.position.y, p.position.z], turn: card.turn, name: `piece${best.i}` };
  });
});
// Name the pieces so the harness can hold them.
await h.page.evaluate(() => window.__cake.world.scene.getObjectsByProperty('name', 'CakePiece').forEach((p, i) => (p.name = `piece${i}`)));

const box = await h.page.evaluate(() => {
  const b = window.__cake.game.box;
  b.group.updateWorldMatrix(true, false);
  const V = b.group.position.constructor;
  return b.cells.map((c) => {
    const p = b.group.localToWorld(new V().copy(c.centre));
    return [p.x, p.y, p.z];
  });
});

await h.head({ x: 0.05, y: 1.45, z: -0.1 }, { x: 0.2, y: 0.92, z: -0.62 }, 800);
for (const step of plan) {
  const [x, y, z] = step.at;
  // Pinch the piece from above (the grab sphere reaches 7 cm).
  await h.hand({ x, y: y + 0.07, z }, PALM_DOWN, 800);
  await h.pinch(1);
  await h.noteHold(step.name);
  await pause(150);
  const [cx, cy, cz] = box[step.cell];
  // Up, over to the cell, turned as the card asks (the cake was unturned, so the card's turn is the piece's yaw).
  const yawDeg = (step.turn * 180) / Math.PI;
  await h.carry({ x, y: y + 0.15, z }, { yaw: 0, pitch: 0, roll: 0 }, 500);
  await h.carry({ x: cx, y: cy + 0.12, z: cz }, { yaw: yawDeg, pitch: 0, roll: 0 }, 1100);
  await h.carry({ x: cx, y: cy + 0.03, z: cz }, { yaw: yawDeg, pitch: 0, roll: 0 }, 500);
  await h.pinch(0);
  await pause(500);
}
await h.hand({ x: 0.3, y: 1.1, z: -0.2 }, PALM_DOWN, 500);
await pause(400);
await h.screenshot(`artifacts/level-${difficulty}-2-boxed.png`);
await h.head({ x: 0.25, y: 1.25, z: -0.3 }, { x: 0.36, y: 0.9, z: -0.64 }, 700);
await pause(300);
await h.screenshot(`artifacts/level-${difficulty}-3-close.png`);

const score = await h.page.evaluate(() => JSON.parse(JSON.stringify(window.__cake.game.score)));
check('every piece fits its card well', score.fits.every((f) => f !== null && f >= 0.85), `fits ${score.fits.map((f) => (f === null ? '-' : Math.round(f * 100))).join(' ')}`);
check('the level scores 3 stars', score.complete && score.stars === 3, `complete ${score.complete}, ${score.stars} stars`);

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; errors ${errors.length}; ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
process.exit(results.every((r) => r.ok) && errors.length === 0 ? 0 : 1);
