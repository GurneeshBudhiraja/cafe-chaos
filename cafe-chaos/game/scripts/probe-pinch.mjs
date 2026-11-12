/**
 * How well the hands pick guests up, hold them and put them down, with
 * the faults of real hand tracking played into the emulator: the hand
 * shakes a few millimetres every frame, and the pinch flickers open for a
 * frame now and then. It runs the same set of reaches each time, so two
 * versions of the hand code can be compared by number.
 *
 * Picking up (the guest at the head of the line is the one meant):
 *   at it, a little off it to each side and above, and held over it as
 *   the player sees it (on the line from the eyes, nearer the player),
 *   exactly and a little off.
 * Holding: the pinch flickers open for one frame while the guest is carried.
 * Putting down (a chosen free seat is the one meant):
 *   right over it, a little off it, high over it, and over it as the
 *   player sees it.
 *
 * Usage: dev server running, then `node scripts/probe-pinch.mjs`
 *   SIGHT=0 turns off pinch-what-you-see (to compare).
 * Output: one line per reach, and the totals.
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const JITTER_M = Number(process.env.JITTER ?? 0.004);
const SIGHT = process.env.SIGHT !== '0';

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate((sight) => {
      const { guests, baristas, system } = window.__cafe;
      guests.spawnSeconds = [0.4, 0.8];
      guests.patienceSeconds = 100000;
      guests.seatedSeconds = 100000;
      if ('sight' in guests) guests.sight = sight;
      baristas.serving = false;
      system.replace();
    }, SIGHT);
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 60000 });
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const Q = { x: 0, y: 0, z: 0, w: 1 };
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const pinch = (value) => send('set_select_value', { device: 'hand-right', value });
const handRaw = (p) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });

// A fixed stream of noise, so every run shakes the same way.
let seed = 12345;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random());
const shaken = (p) => p.map((v) => v + gauss() * JITTER_M);

// The pinch point sits at a fixed offset from the emulated hand, different open and closed: measure both.
const AWAY = [-0.9, 1.05, 0.7];
await handRaw(AWAY);
await pinch(1);
await frames(3);
const closedOffset = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
await pinch(0);
await frames(3);
const openOffset = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
/** Hold the pinch point at `p` for `n` frames, shaking. */
async function holdAt(p, n, open) {
  const offset = open ? openOffset : closedOffset;
  for (let i = 0; i < n; i++) {
    await handRaw(shaken(p.map((v, k) => v - offset[k])));
    await frames(1);
  }
}
const eye = () => page.evaluate(() => window.__cafe.world.player.head.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
/** The point `back` metres from `target` toward the eyes. */
const toward = (target, eyeAt, back) => { const d = eyeAt.map((v, i) => v - target[i]); const len = Math.hypot(...d); return target.map((v, i) => v + (d[i] / len) * back); };
const add = (a, b) => a.map((v, i) => v + b[i]);

/** Wait for a line of at least three standing still; returns the head's id and grip, and its neighbour's id. */
async function line() {
  await page.waitForFunction(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 3 && window.__cafe.guests.guests.every((g) => g.state !== 'hop' && g.state !== 'held'), null, { timeout: 180000, polling: 200 });
  return page.evaluate(() => {
    const { guests, system } = window.__cafe;
    const V = system.cafe.position.constructor;
    const [head, next] = guests.line;
    return { id: head.id, next: next.id, grip: head.actor.grip.getWorldPosition(new V()).toArray() };
  });
}
const held = () => page.evaluate(() => window.__cafe.guests.carriedBy('right')?.id ?? 0);
async function reset() {
  await pinch(0);
  await handRaw(AWAY);
  await frames(2);
  await page.evaluate(() => window.__cafe.guests.clear());
}

const results = [];
const note = (group, name, pass, detail) => { results.push({ group, pass }); console.log(`${pass ? 'ok  ' : 'MISS'} ${group}: ${name}${detail ? ` (${detail})` : ''}`); };

// ---- Picking up.
const eyeAt = await eye();
const picks = [
  ['right at it', (g) => g, true],
  ['3 cm to the left', (g) => add(g, [0, 0, 0.03]), true],
  ['3 cm to the right', (g) => add(g, [0, 0, -0.03]), true],
  ['3 cm nearer the player', (g) => add(g, [0.03, 0, 0]), true],
  ['4 cm above its head', (g) => add(g, [0, 0.06, 0]), true],
  ['held over it as seen, 12 cm nearer the eyes', (g) => toward(g, eyeAt, 0.12), SIGHT],
  ['held over it as seen, 25 cm nearer the eyes', (g) => toward(g, eyeAt, 0.25), SIGHT],
  ['as seen, 25 cm nearer, 1.5 cm off', (g) => add(toward(g, eyeAt, 0.25), [0, 0.015, 0]), SIGHT],
];
for (const [name, where, expected] of picks) {
  const target = await line();
  const p = where(target.grip);
  // Come in open (the guest should light), close with a one-frame flicker, hold.
  await holdAt(add(p, [0.02, 0.05, 0.02]), 2, true);
  await holdAt(p, 3, true);
  const lit = await page.evaluate(() => window.__cafe.guests.hovered.find(Boolean)?.id ?? 0);
  await pinch(1);
  await holdAt(p, 2, false);
  const got = await held();
  const verdict = got === target.id ? 'took it' : got ? 'took the wrong guest' : 'took nothing';
  note('pick up', name, expected ? got === target.id : got === 0, `${lit === target.id ? 'lit it' : lit ? 'lit another' : 'lit nothing'}, ${verdict}${expected ? '' : '; not expected to with pinch-what-you-see off'}`);
  await reset();
}

// ---- Holding through a flicker, and putting down.
const drops = [
  ['right over the seat', (s) => add(s, [0, 0.07, 0]), true],
  ['5 cm off the seat', (s) => add(s, [0.035, 0.07, 0.035]), true],
  ['25 cm above the seat', (s) => add(s, [0, 0.25, 0]), true],
  ['over the seat as seen, 20 cm nearer the eyes', (s) => toward(add(s, [0, 0.03, 0]), eyeAt, 0.2), SIGHT],
];
for (const [name, where, expected] of drops) {
  const target = await line();
  await holdAt(target.grip, 3, true);
  await pinch(1);
  await holdAt(target.grip, 2, false);
  if ((await held()) !== target.id) { note('put down', name, false, 'could not pick the guest up'); await reset(); continue; }
  // The seat meant: a free one in the middle of the room.
  const seat = await page.evaluate(() => {
    const { guests, system } = window.__cafe;
    const free = guests.seats.filter((s) => s.occupant === 0);
    const s = free.reduce((best, s) => (Math.hypot(s.position.x - 0.05, s.position.z - 0.02) < Math.hypot(best.position.x - 0.05, best.position.z - 0.02) ? s : best));
    return { index: s.index, at: system.cafe.localToWorld(s.position.clone()).toArray() };
  });
  const p = where(seat.at);
  await holdAt(add(p, [0, 0.05, 0]), 3, false);
  // The pinch flickers open for one frame.
  await pinch(0);
  await holdAt(p, 1, false);
  await pinch(1);
  await holdAt(p, 3, false);
  const stillHeld = (await held()) === target.id;
  note('hold', `through a one-frame flicker (${name})`, stillHeld, stillHeld ? '' : 'dropped');
  const aimed = await page.evaluate(() => window.__cafe.guests.carriedBy('right')?.target?.index ?? -1);
  await pinch(0);
  await holdAt(p, 4, true);
  await page.waitForFunction((id) => { const g = window.__cafe.guests.guests.find((x) => x.id === id); return !g || (g.state !== 'hop' && g.state !== 'held'); }, target.id, { timeout: 60000, polling: 200 });
  const landed = await page.evaluate((id) => { const g = window.__cafe.guests.guests.find((x) => x.id === id); return g ? { state: g.state, seat: g.seat?.index ?? -1 } : { state: 'gone', seat: -1 }; }, target.id);
  const onIt = landed.state === 'seated' && landed.seat === seat.index;
  note('put down', name, expected ? onIt : landed.state !== 'seated', `aimed at seat ${aimed}, meant ${seat.index}; ${landed.state === 'seated' ? `sat on ${landed.seat}` : 'went back to the line'}${expected ? '' : '; not expected to with pinch-what-you-see off'}`);
  await reset();
}

for (const group of ['pick up', 'hold', 'put down']) {
  const of = results.filter((r) => r.group === group);
  console.log(`${group}: ${of.filter((r) => r.pass).length} of ${of.length}`);
}
const errors = await h.finish();
console.log(errors.length ? `console errors:\n${errors.slice(0, 5).join('\n')}` : 'no console errors');
process.exit(0);
