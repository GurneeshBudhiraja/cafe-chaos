/**
 * The pictures for How to play and the first run's coach card, taken from
 * the game itself: a hand over a guest at the gate (it glows); a guest
 * carried over a glowing seat; the scoreboard over a busy café; a hand
 * pointed at the bar, its ray on Pause.
 * The hands are the game's default, Meta's outline hand (the look of hands
 * on Quest), since the player's real hands cannot be in a picture. The emulator's grey room is
 * hidden, so the café stands on a plain dark ground (in the headset, the
 * player's own room is there).
 *
 * Usage: dev server running, then `node scripts/shoot-howto.mjs`.
 * Output: public/ui/howto-pinch.jpg, howto-seat.jpg, howto-happy.jpg, howto-pause.jpg.
 */

import { mkdirSync } from 'node:fs';

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
mkdirSync('public/ui', { recursive: true });

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title' && window.__cafe.mood.lampsUp > 0.99, null, { timeout: 60000 });
  },
});
const { page } = h;
// The emulator's room is drawn on its own canvas, under the app's: hide it, leaving the page's dark ground.
await page.evaluate(() => {
  for (const c of document.querySelectorAll('canvas')) if (getComputedStyle(c).zIndex === '1') c.style.visibility = 'hidden';
  document.body.style.background = '#241d19';
  // The name cards of held guests are left out (they would cover the moves).
  for (const c of window.__cafe.guests.cards.cards) c.mesh.layers.set(7);
});
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const Q = { x: 0, y: 0, z: 0, w: 1 };
const handRaw = (p) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const pinch = (value) => send('set_select_value', { device: 'hand-right', value });
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const add = (a, b) => a.map((v, i) => v + b[i]);
const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
const size = page.viewportSize();
/** A 4:3 picture cut from the middle of the view. */
const shot = (name) => {
  const w = Math.round(size.height * 0.8 * (4 / 3));
  const hgt = Math.round(size.height * 0.8);
  return page.screenshot({ path: `public/ui/${name}.jpg`, type: 'jpeg', quality: 86, clip: { x: Math.round((size.width - w) / 2), y: Math.round((size.height - hgt) / 2), width: w, height: hgt } });
};

// Pinch offsets of the emulated hand, closed and open, and its index fingertip.
const AWAY = [-0.9, 1.05, 0.7];
await handRaw(AWAY);
await pinch(1);
await frames(3);
const closed = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
await pinch(0);
await frames(3);
const open = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
const tip = (await page.evaluate(() => window.__cafe.hold.tip.right.point.toArray())).map((v, i) => v - AWAY[i]);
const pinchAt = (p, isOpen) => handRaw(p.map((v, i) => v - (isOpen ? open : closed)[i]));

// A quiet run: a few guests in the line, nobody impatient, the cards away.
await page.evaluate(() => {
  const { game, guests } = window.__cafe;
  game.click('open');
  guests.spawnSeconds = [0.5, 1];
  guests.spawnPace = 1;
  guests.patienceFrozen = true;
});
await page.waitForFunction(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving, null, { timeout: 60000 });
await page.evaluate(() => window.__cafe.game.click('skip'));
await page.waitForFunction(() => window.__cafe.game.phase === 'run', null, { timeout: 60000 });
// The scoreboard is put away for the first two pictures.
const board = (on) => page.evaluate((on) => window.__cafe.strip.panel.show(on), on);
await board(false);
await page.waitForFunction(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 3, null, { timeout: 180000 });
await page.evaluate(() => (window.__cafe.guests.arrivals = false));

// 1. The pinch: the hand open over the guest at the head of the line, which lights up.
const guest = await page.evaluate(() => { const { guests, system } = window.__cafe; const g = guests.line[0]; return { id: g.id, grip: g.actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray() }; });
await h.head(P(add(guest.grip, [0.26, 0.2, 0.12])), P(add(guest.grip, [0, 0.01, 0])), 300);
await pinchAt(add(guest.grip, [0.012, 0.03, 0]), true);
await frames(4);
await shot('howto-pinch');

// 2. The seat: the guest carried over a free seat, which glows.
await pinchAt(guest.grip, true);
await frames(2);
await pinch(1);
await pinchAt(guest.grip, false);
await frames(3);
const seat = await page.evaluate(() => {
  const { guests, system } = window.__cafe;
  const free = guests.seats.filter((s) => s.occupant === 0);
  const s = free.reduce((best, s) => (Math.hypot(s.position.x - 0.12, s.position.z - 0.03) < Math.hypot(best.position.x - 0.12, best.position.z - 0.03) ? s : best));
  return system.cafe.localToWorld(s.position.clone()).toArray();
});
const over = add(seat, [0, 0.085, 0]);
await pinchAt(over, false);
await h.head(P(add(seat, [0.3, 0.24, 0.06])), P(add(seat, [0, 0.03, 0])), 300);
await frames(5);
await shot('howto-seat');
await pinch(0);
await frames(3);

// 3. Keep guests happy: a few guests seated, the scoreboard over the café, seen from the seat.
await handRaw(AWAY);
await page.evaluate(() => {
  const { guests, score } = window.__cafe;
  guests.arrivals = true;
  score.happiness = 72;
  score.bank = 45;
});
await board(true);
await page.waitForFunction(() => window.__cafe.guests.seats.filter((s) => s.occupant !== 0).length >= 1 || true, null, { timeout: 5000 });
const strip = await page.evaluate(() => window.__cafe.strip.panel.mesh.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
const cafeAt = await page.evaluate(() => window.__cafe.system.cafe.position.toArray());
await h.head(P(add(cafeAt, [0.42, 0.42, 0.06])), P([(strip[0] + cafeAt[0]) / 2, (strip[1] + cafeAt[1]) / 2 - 0.02, (strip[2] + cafeAt[2]) / 2]), 300);
await frames(8);
await shot('howto-happy');

// 4. The bar: the hand pointed at it, the ray on Pause (lit). Shop is at the other end.
await page.evaluate(() => window.__cafe.strip.panel.show(true));
const SEAT_VIEW = { x: -0.85, y: 1.22, z: 0.28 };
const barMid = await page.evaluate(() => window.__cafe.strip.panel.mesh.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
await h.head(SEAT_VIEW, { x: barMid[0] * 0.75 + SEAT_VIEW.x * 0.25, y: barMid[1] - 0.12, z: barMid[2] * 0.75 + SEAT_VIEW.z * 0.25 }, 300);
await frames(6);
const pauseAt = await page.evaluate(() => {
  const p = window.__cafe.strip.panel;
  const b = p.buttons.find((x) => x.id === 'bar-pause');
  const g = p.mesh.geometry.parameters;
  const V = p.mesh.position.constructor;
  return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, 0)).toArray();
});
const from = [-1.1, 1.02, 0.12];
const d = pauseAt.map((v, i) => v - from[i]);
const len = Math.hypot(...d);
const n = d.map((v) => v / len);
// Turn the hand's -Z (its ray) to the button.
const c = [n[1], -n[0], 0];
const w = 1 - n[2];
const ql = Math.hypot(c[0], c[1], c[2], w);
await send('set_transform', { device: 'hand-right', position: { x: from[0], y: from[1], z: from[2] }, orientation: { x: c[0] / ql, y: c[1] / ql, z: c[2] / ql, w: w / ql } });
await frames(10);
await shot('howto-pause');

const errors = await h.finish();
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no console errors');
console.log('public/ui/howto-pinch.jpg, howto-seat.jpg, howto-happy.jpg, howto-pause.jpg');
process.exit(0);
