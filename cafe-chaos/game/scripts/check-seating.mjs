/**
 * Guests check, part 2: picking up, the seat glow, sitting, and leaving
 * after the meal. With the viewer seated at the emulated table and
 * guests in the line (timers shortened), checks that:
 * 1. a pinch closing on a guest picks it up: it leaves the line, plays the
 *    Lifted clip, and the café itself does not move;
 * 2. carried, it hangs from the pinch and faces the player, and the seat
 *    under it glows (the other free seats show dots);
 * 3. let go over the glowing seat, it sits there, pleased, and the glow
 *    goes out;
 * 4. a guest let go away from any seat hops back to its place in the line;
 * 5. when its time is up a seated guest hops off its chair, walks out of
 *    the door, down the side and along the front path, fading at its end
 *    without leaving the plate; its seat is free;
 * 6. there are never more than ten on stage, and no console errors.
 * Saves headset-view screenshots along the way.
 *
 * Usage: dev server running, then `node scripts/check-seating.mjs`.
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const fmt = (a) => `[${a.map((v) => v.toFixed(3)).join(', ')}]`;
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => {
      const { guests, system } = window.__cafe;
      guests.spawnSeconds = [1.5, 2.5];
      guests.patienceSeconds = 100000;
      guests.seatedSeconds = 30;
      system.replace();
    });
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 20000 });
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => {
  const info = window.__cafe.world.renderer.info.render;
  const target = info.frame + n;
  const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8);
}), n);

const state = () => page.evaluate(() => {
  const { guests, system, hold, world } = window.__cafe;
  const V = world.camera.position.constructor;
  const cafe = system.cafe;
  const g = (x) => ({
    id: x.id, state: x.state, clip: x.actor.clip, pose: x.actor.pose, spot: x.spot, hand: x.hand, yaw: x.yaw,
    at: x.actor.root.position.toArray(), grip: x.actor.grip.getWorldPosition(new V()).toArray(),
    target: x.target ? x.target.index : null, seat: x.seat ? x.seat.index : null, seatedFor: x.seatedFor,
  });
  return {
    all: guests.guests.map(g), line: guests.line.map((x) => x.id), peak: guests.peak, left: guests.left, seated: guests.seated,
    seats: guests.seats.map((s) => ({ index: s.index, at: s.position.toArray(), world: cafe.localToWorld(s.position.clone()).toArray(), yaw: s.yaw, occupant: s.occupant })),
    glow: guests.glow.landing.map((m, i) => ({ visible: m.group.visible, at: m.group.position.toArray(), seat: guests.glow.target[i] ? guests.glow.target[i].index : null })),
    dots: guests.glow.dots.count,
    cafe: { pos: cafe.position.toArray(), scale: cafe.scale.x, yaw: cafe.rotation.y },
    holding: [...hold.holding], pinch: hold.pinch.right.point.toArray(), closed: hold.pinch.right.closed,
    head: cafe.worldToLocal(world.camera.getWorldPosition(new V())).toArray(),
  };
});
const guestById = (s, id) => s.all.find((g) => g.id === id);

const Q = { x: 0, y: 0, z: 0, w: 1 };
const AWAY = { left: [-0.3, 0.9, 0.6], right: [-0.3, 0.9, -0.1] };
const handTo = (hand, p) => send('set_transform', { device: `hand-${hand}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const pinch = (value) => send('set_select_value', { device: 'hand-right', value });
// Where the pinch point sits relative to the hand's pose.
await handTo('right', AWAY.right);
await handTo('left', AWAY.left);
await pinch(1);
await frames(3);
const pinchOffset = add((await state()).pinch, AWAY.right, -1);
await pinch(0);
await frames(2);
const pinchTo = (p) => handTo('right', add(p, pinchOffset, -1));
async function drag(from, to, steps = 6) {
  for (let i = 1; i <= steps; i++) {
    await pinchTo(add(from, add(to, from, -1), i / steps));
    await frames(1);
  }
}

// Guests in the line.
await page.waitForFunction(() => window.__cafe.guests.line.length >= 3 && window.__cafe.guests.line.slice(0, 3).every((g) => g.state === 'queued' && !g.walk), null, { timeout: 180000 });
await page.evaluate(() => (window.__cafe.guests.arrivals = false));
await frames(2);

// 1. Pick up the guest at the head of the line.
const before = await state();
const first = guestById(before, before.line[0]);
await pinchTo(add(first.grip, [0, 0.05, 0]));
await frames(2);
await pinchTo(first.grip);
await frames(2);
await pinch(1);
await frames(3);
const picked = await state();
{
  const g = guestById(picked, first.id);
  check('a pinch on a guest picks it up, and the café stays put', g.state === 'held' && g.hand === 'right' && g.clip === 'Lifted' && !picked.line.includes(first.id) && picked.holding.length === 0 && dist(picked.cafe.pos, before.cafe.pos) < 1e-6,
    `guest ${first.id} is ${g.state} in the ${g.hand} hand, clip ${g.clip}, line ${picked.line.join(',')}, café held by ${picked.holding.length} hands`);
}

// 2. Carry it over a seat in the front row: it follows, faces the player, and the seat glows.
const seat = before.seats.reduce((best, s) => (Math.hypot(s.at[0] - 0.223, s.at[2] - 0.025) < Math.hypot(best.at[0] - 0.223, best.at[2] - 0.025) ? s : best));
const over = add(seat.world, [0, 0.042 * before.cafe.scale + 0.035, 0]);
await drag(first.grip, add(first.grip, [0, 0.1, 0]));
await drag(add(first.grip, [0, 0.1, 0]), add(over, [0, 0.05, 0]), 8);
await drag(add(over, [0, 0.05, 0]), over, 4);
await frames(4);
const carried = await state();
{
  const g = guestById(carried, first.id);
  const hang = dist(g.grip, carried.pinch);
  const toHead = Math.atan2(carried.head[0] - g.at[0], carried.head[2] - g.at[2]);
  const facing = Math.abs(Math.atan2(Math.sin(g.yaw - toHead), Math.cos(g.yaw - toHead)));
  check('carried, it hangs from the pinch and faces the player', g.state === 'held' && hang < 0.012 && facing < 0.2, `grip ${(hang * 100).toFixed(1)} cm from the pinch, turned ${(facing * 57.3).toFixed(0)} degrees off the player`);
  const glow = carried.glow.find((m) => m.visible) ?? carried.glow[0];
  const free = carried.seats.filter((s) => s.occupant === 0).length;
  check('the seat under it glows, and the other free seats show dots', g.target === seat.index && glow.visible && glow.seat === seat.index && Math.hypot(glow.at[0] - seat.at[0], glow.at[2] - seat.at[2]) < 1e-4 && carried.dots === free - 1,
    `landing seat ${g.target} (wanted ${seat.index}), glow ${glow.visible ? 'on' : 'off'} at seat ${glow.seat}, ${carried.dots} dots for ${free} free seats`);
}
// A look at the carried guest and the glow, from the seat and from close.
await h.screenshot('artifacts/seating-1-carry.png');
{
  const eye = await page.evaluate((l) => { const { system, world } = window.__cafe; const V = world.camera.position.constructor; const p = system.cafe.localToWorld(new V(...l)); return { x: p.x, y: p.y, z: p.z }; }, [seat.at[0] + 0.1, 0.22, seat.at[2] + 0.26]);
  await h.head(eye, { x: seat.world[0], y: seat.world[1] + 0.02, z: seat.world[2] }, 400);
  await frames(4);
  await h.screenshot('artifacts/seating-2-glow.png');
}

// 3. Let go: it sits on the glowing seat.
await pinch(0);
await page.waitForFunction((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', first.id, { timeout: 60000 });
await frames(2);
const sat = await state();
{
  const g = guestById(sat, first.id);
  const s = sat.seats[seat.index];
  check('let go over the glowing seat, it sits there, pleased', g.state === 'seated' && g.pose === 'seated' && (g.clip === 'SitHappy' || g.clip === 'SitEating') && dist(g.at, s.at) < 1e-4 && s.occupant === first.id && Math.abs(g.yaw - s.yaw) < 1e-3 && sat.glow.every((m) => !m.visible) && sat.dots === 0,
    `guest ${first.id} is ${g.state} on seat ${g.seat}, clip ${g.clip}, ${(dist(g.at, s.at) * 1000).toFixed(1)} mm from the seat, glow ${sat.glow.some((m) => m.visible) ? 'on' : 'off'}`);
}
// From now on, note where this guest goes (sampled in the page), for step 5.
await page.evaluate((id) => {
  const { guests } = window.__cafe;
  const trail = (window.__trail = { points: [], gone: false });
  const t = setInterval(() => {
    const g = guests.guests.find((x) => x.id === id);
    if (!g) { trail.gone = true; clearInterval(t); return; }
    trail.points.push({ state: g.state, clip: g.actor.clip, x: g.actor.root.position.x, y: g.actor.root.position.y, z: g.actor.root.position.z, opacity: g.actor.opacity, lane: g.lane });
  }, 200);
}, first.id);
await frames(3);
await h.screenshot('artifacts/seating-3-seated.png');
await h.head(SEAT, LOOK, 400);

// 4. Pick up the next guest and let go away from any seat: back to its place in the line.
await handTo('right', AWAY.right);
await page.waitForFunction(() => window.__cafe.guests.line.length >= 2 && window.__cafe.guests.line.every((g) => g.state === 'queued' && !g.walk), null, { timeout: 120000 });
await frames(2);
{
  const s0 = await state();
  const next = guestById(s0, s0.line[0]);
  await pinchTo(add(next.grip, [0, 0.05, 0]));
  await frames(2);
  await pinchTo(next.grip);
  await frames(2);
  await pinch(1);
  await frames(3);
  // Up and out over the open table, away from every seat.
  const away = await page.evaluate((l) => { const { system, world } = window.__cafe; const V = world.camera.position.constructor; return system.cafe.localToWorld(new V(...l)).toArray(); }, [0.62, 0.2, 0.3]);
  await drag(next.grip, away, 6);
  await frames(3);
  const held = await state();
  const noTarget = guestById(held, next.id).target === null && held.glow.every((m) => !m.visible);
  await pinch(0);
  await page.waitForFunction((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'queued', next.id, { timeout: 60000 });
  await frames(2);
  const back = await state();
  const g = guestById(back, next.id);
  check('let go away from any seat, it hops back to its place in the line', noTarget && back.line[0] === next.id && g.spot === 0 && g.clip !== 'Lifted' && Math.hypot(g.at[0] - next.at[0], g.at[2] - next.at[2]) < 0.003,
    `no seat aimed at ${noTarget}; guest ${next.id} is ${g.state} at spot ${g.spot}, line ${back.line.join(',')}, ${(Math.hypot(g.at[0] - next.at[0], g.at[2] - next.at[2]) * 1000).toFixed(1)} mm from where it stood`);
}
await handTo('right', AWAY.right);

// 5. The seated guest's time runs out: off the chair, out of the door, and away along the front.
await h.head(SEAT, LOOK, 300);
await page.waitForFunction(() => window.__trail.points.some((q) => q.state === 'leaving' && q.z > 0.2 && q.x < 0.3), null, { timeout: 420000 });
await h.screenshot('artifacts/seating-4-leaving.png');
await page.waitForFunction(() => window.__trail.gone, null, { timeout: 420000 });
const trail = await page.evaluate(() => window.__trail);
{
  const p = trail.points;
  // The hop is under half a second: in the emulator's slow frames it can pass between two samples, so the system's own count is read.
  const hopped = (await page.evaluate(() => window.__cafe.guests.hoppedOff)) >= 1;
  const walkedOut = p.filter((q) => q.state === 'leaving');
  const throughDoor = walkedOut.some((q) => q.x > 0.33 && q.x < 0.46 && q.z > -0.005 && q.z < 0.115);
  // Along the garden path at the front of the plate, never off it.
  const onPath = walkedOut.filter((q) => q.z > 0.2 && q.y > 0.015);
  const offPlate = walkedOut.some((q) => q.y < 0.015 || Math.abs(q.x) > 0.46 || q.z > 0.31);
  const faded = walkedOut.length > 0 && walkedOut[walkedOut.length - 1].opacity < 0.5;
  const endX = onPath.length ? onPath[onPath.length - 1].x : NaN;
  check('its time up, it hops off the chair, goes out of the door and away along the front path', hopped && throughDoor && onPath.length > 2 && !offPlate && faded && trail.gone && endX < -0.1,
    `hopped ${hopped}, through the door ${throughDoor}, along the front path to x ${endX.toFixed(2)} (${onPath.length} samples), off the plate ${offPlate}, faded ${faded}, gone ${trail.gone}`);
}
const end = await state();
check('its seat is free again, and there were never more than ten on stage', end.seats[seat.index].occupant === 0 && end.peak <= 10 && end.left >= 1, `seat ${seat.index} occupant ${end.seats[seat.index].occupant}, peak ${end.peak}, left ${end.left}`);

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
