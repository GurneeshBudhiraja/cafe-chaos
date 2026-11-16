/**
 * A short video of the guests' new screens, from the seat, late in an
 * evening: the dots over the line (seconds, timer ring, a pip a wish);
 * a hand over a guest with three wishes brings up its request card; the
 * guest picked up and carried across the café, the card marking which
 * wishes each seat meets; let go, the result pops up; then a pinch on the
 * seated guest picks nothing up (its seat is final).
 * Usage: dev server running, then `node scripts/record-cards.mjs`.
 * Output: artifacts/cards.mp4.
 */

process.env.APP_URL = `${process.env.APP_URL_GAME ?? 'https://localhost:8082/'}?hands=cream`;
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const REST = [-0.62, 0.62, 0.62];
const h = await startHeadset({
  record: 'cards',
  maxSpeedUp: 6,
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.game.phase === 'title', null, { timeout: 60000 });
    await h.page.evaluate((r) => {
      for (const c of document.querySelectorAll('canvas')) if (getComputedStyle(c).zIndex === '1') c.style.visibility = 'hidden';
      document.body.style.background = '#241d19';
      for (const k of ['left', 'right']) window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: k === 'left' ? { x: -1.4, y: 0.4, z: 0.9 } : { x: r[0], y: r[1], z: r[2] }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
      window.__cafe.game.click('open');
    }, REST);
    await h.page.waitForFunction(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving, null, { timeout: 60000 });
    await h.page.evaluate(() => window.__cafe.game.click('skip'));
    await h.page.waitForFunction(() => window.__cafe.game.phase === 'run', null, { timeout: 60000 });
    await h.page.evaluate(() => {
      const { game, guests } = window.__cafe;
      game.clock = 300;
      guests.clear();
      guests.spawnSeconds = [0.4, 0.8];
      guests.patienceFrozen = true;
    });
    await h.page.waitForFunction(() => window.__cafe.guests.line.length >= 4 && window.__cafe.guests.line.slice(0, 4).every((g) => g.state === 'queued' && !g.walk), null, { timeout: 180000 });
    await h.page.evaluate(() => {
      const { guests } = window.__cafe;
      guests.arrivals = false;
      guests.line[0].wishes = ['window', 'quiet', 'alone'];
      // Patience runs again, slowly, so the timer can be seen going down.
      guests.patienceFrozen = false;
      for (const g of guests.line) g.patience = g.patienceFull = 90;
    });
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const Q = { x: 0, y: 0, z: 0, w: 1 };
const handTo = (p) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const pinch = (v) => send('set_select_value', { device: 'hand-right', value: v });
const add = (a, b) => a.map((v, i) => v + b[i]);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
await handTo(REST);
await h.pause(200);
const open = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - REST[i]);
await pinch(1);
await h.pause(200);
const closed = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - REST[i]);
await pinch(0);
async function glide(a, b, ms, isOpen) {
  const off = isOpen ? open : closed;
  const n = Math.max(6, Math.round(ms / 70));
  for (let i = 1; i <= n; i++) {
    await handTo(lerp(a, b, ease(i / n)).map((v, k) => v - off[k]));
    await h.pause(ms / n);
  }
}

// 1. The line from the seat, then closer: the dots.
await h.pause(1500);
const guest = await page.evaluate(() => { const { guests, system } = window.__cafe; const g = guests.line[0]; return { id: g.id, grip: g.actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray() }; });
await h.head(P(add(guest.grip, [0.32, 0.22, 0.12])), P(add(guest.grip, [-0.05, 0.03, 0])), 1200);
await h.pause(1500);
// 2. A hand over the guest: its card.
const startAt = add(guest.grip, [0.12, 0.1, 0.06]);
await handTo(startAt.map((v, k) => v - open[k]));
await glide(startAt, add(guest.grip, [0.012, 0.03, 0]), 1200, true);
await h.pause(2200);
// 3. Picked up and carried over the café: the card marks each wish per seat.
await glide(add(guest.grip, [0.012, 0.03, 0]), guest.grip, 300, true);
await pinch(1);
await h.pause(400);
const seats = await page.evaluate(() => {
  const { guests, system } = window.__cafe;
  const free = guests.seats.filter((s) => s.occupant === 0);
  const near = (x, z) => free.reduce((b, s) => (Math.hypot(s.position.x - x, s.position.z - z) < Math.hypot(b.position.x - x, b.position.z - z) ? s : b));
  return [near(0.12, 0.04), near(-0.08, 0.04), near(-0.28, 0.04)].map((s) => system.cafe.localToWorld(s.position.clone()).toArray());
});
const lifted = add(guest.grip, [0, 0.07, 0]);
await glide(guest.grip, lifted, 600, false);
const over = seats.map((s) => add(s, [0, 0.085, 0]));
await h.head(P(add(seats[1], [0.38, 0.3, 0.08])), P(add(seats[1], [0, 0.05, 0])), 1100);
let from = lifted;
for (const to of over) {
  await glide(from, to, 1500, false);
  await h.pause(1500);
  from = to;
}
// 4. Let go over the last seat: the result.
await pinch(0);
await h.pause(2800);
// 5. A pinch on the seated guest picks nothing up.
const sitter = await page.evaluate((id) => { const { guests, system } = window.__cafe; return guests.guests.find((g) => g.id === id).actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray(); }, guest.id);
await glide(from, add(sitter, [0.01, 0.03, 0]), 900, true);
await pinch(1);
await h.pause(700);
await pinch(0);
await h.pause(1200);
const errors = await h.finish();
console.log(errors.length ? `errors: ${errors.slice(0, 3).join(' | ')}` : 'clean');
