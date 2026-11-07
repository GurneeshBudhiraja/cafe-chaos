/**
 * Phase 2 check: a level can be played start to finish with the hands.
 *
 * Starts a level from a fixed seed, then for each Yapper: pinches it off
 * the pavement, carries it over the bus and lets go over the seat its
 * rules were read from. Expects everyone seated and happy and three
 * stars. Then takes one Yapper out and drops it onto a taken seat:
 * expects a bump (and the Yapper back on the table). Then seats it in a
 * seat that breaks one of its rules: expects a grumble, and finally puts
 * it back right: expects the level complete again with two stars.
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

/** Start the level; name the Yappers so the harness can hold them; read where each belongs and where the seats are. */
const level = await page.evaluate(
  ([d, s]) => {
    const { game, world } = window.__yap;
    const level = game.start(d, s);
    const V = world.camera.position.constructor;
    const bus = game.bus;
    bus.group.updateWorldMatrix(true, false);
    const seats = Array.from({ length: level.rows * 4 }, (_, seat) => bus.group.localToWorld(bus.seatLocal(seat)).toArray());
    return JSON.parse(
      JSON.stringify({
        rows: level.rows,
        seats,
        yappers: game.crowd.map((entity, i) => {
          entity.object3D.name = `yapper${i}`;
          const spec = level.yappers[i];
          return { name: `yapper${i}`, who: spec.name, rules: spec.rules, at: entity.object3D.position.toArray(), solution: spec.solution };
        }),
      }),
    );
  },
  [difficulty, seed],
);
const score = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__yap.game.score)));
console.log(`${difficulty} level, seed ${seed}: ${level.yappers.length} Yappers, ${level.rows} rows`);
await pause(600);
await h.screenshot(`artifacts/level-${difficulty}-0-start.png`);

/** Pinch a Yapper where it stands and put it down over a seat (its feet 2 cm above the cushion). */
const seatYapper = async (yapper, seat, from = yapper.at) => {
  const [x, y, z] = from;
  await h.head({ x: -0.15, y: 1.45, z: -0.15 }, { x, y, z }, 500);
  await h.hand({ x, y: y + 0.12, z: z + 0.02 }, PALM_DOWN, 700);
  await h.hand({ x, y: y + 0.045, z }, PALM_DOWN, 400);
  await pause(200);
  await h.pinch(1);
  await h.noteHold(yapper.name);
  await pause(250);
  const [sx, sy, sz] = level.seats[seat];
  await h.carry({ x, y: y + 0.15, z }, { yaw: 0, pitch: 0, roll: 0 }, 400);
  await Promise.all([
    h.head({ x: 0.15, y: 1.45, z: -0.12 }, { x: sx, y: sy, z: sz }, 1000),
    h.carry({ x: sx, y: sy + 0.12, z: sz }, { yaw: 0, pitch: 0, roll: 0 }, 1200),
  ]);
  await h.carry({ x: sx, y: sy + 0.025, z: sz }, { yaw: 0, pitch: 0, roll: 0 }, 500);
  await pause(100);
  await h.pinch(0);
  await pause(700);
};

for (const yapper of level.yappers) await seatYapper(yapper, yapper.solution);
await h.hand({ x: 0.5, y: 1.1, z: -0.2 }, PALM_DOWN, 500);
await pause(800);
await h.head({ x: 0.25, y: 1.3, z: -0.25 }, { x: 0.33, y: 0.9, z: -0.66 }, 600);
await pause(300);
await h.screenshot(`artifacts/level-${difficulty}-1-aboard.png`);

let s = await score();
check('everyone takes their seat', s.seated === s.total && s.total === level.yappers.length, `${s.seated}/${s.total} aboard`);
check('everyone is happy and the level scores 3 stars', s.complete && s.happy === s.total && s.stars === 3, `complete ${s.complete}, ${s.happy} happy, ${s.stars} stars, ${s.grumbles} grumbles`);

// --- A bump: lift the first Yapper out and drop it onto the second one's seat.
const first = level.yappers[0];
const second = level.yappers[1];
const firstAt = await h.objectPosition(first.name);
await seatYapper(first, second.solution, [firstAt.x, firstAt.y, firstAt.z]);
await pause(600);
await h.screenshot(`artifacts/level-${difficulty}-2-bump.png`);
s = await score();
const firstNow = await h.objectPosition(first.name);
const busNose = Math.min(...level.seats.map((p) => p[0])) - 0.1;
check('a Yapper dropped on a taken seat bounces off', s.seated === level.yappers.length - 1 && s.grumbles === 0, `${s.seated}/${s.total} aboard, ${s.grumbles} grumbles`);
check('the bounced Yapper lands on the table past the nose', firstNow.y < 0.9 && firstNow.x < busNose, `at y ${firstNow.y.toFixed(3)}, x ${firstNow.x.toFixed(2)} (nose x ${busNose.toFixed(2)})`);

// --- A grumble: seat it where one of its rules breaks (a free seat the page says is bad for it).
const badSeat = await page.evaluate(() => {
  const { game, checkYapper } = window.__yap;
  const level = game.level;
  const takenSeats = new Set(game.crowd.map((e) => e.getValue(window.__yap.Yapper, 'seat')).filter((s) => s >= 0));
  for (let seat = 0; seat < level.rows * 4; seat++) {
    if (takenSeats.has(seat)) continue;
    const seating = new Map();
    game.crowd.forEach((e, i) => {
      const s = e.getValue(window.__yap.Yapper, 'seat');
      if (s >= 0) seating.set(i, s);
    });
    seating.set(0, seat);
    if (checkYapper(level.yappers[0], 0, seating, level.rows).some((state) => state === 'bad')) return seat;
  }
  return -1;
});
check('a free seat that breaks a rule exists for the test', badSeat >= 0, `seat ${badSeat}`);
if (badSeat >= 0) {
  const at = await h.objectPosition(first.name);
  await seatYapper(first, badSeat, [at.x, at.y, at.z]);
  await pause(400);
  await h.screenshot(`artifacts/level-${difficulty}-3-grumble.png`);
  s = await score();
  check('a Yapper in a seat that breaks its rule grumbles', s.seated === level.yappers.length && s.grumbles >= 1 && !s.complete, `${s.grumbles} grumbles, ${s.happy}/${s.total} happy, complete ${s.complete}`);
  // --- Back to its proper seat: complete again, with two stars for the grumble.
  const again = await h.objectPosition(first.name);
  await seatYapper(first, first.solution, [again.x, again.y, again.z]);
  await pause(400);
  s = await score();
  check('put right again, the level completes with 2 stars', s.complete && s.stars === 2, `complete ${s.complete}, ${s.stars} stars, ${s.grumbles} grumbles`);
}

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; errors ${errors.length}; ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
process.exit(results.every((r) => r.ok) && errors.length === 0 ? 0 : 1);
