/**
 * The pictures for How to play and the first run's coach card, taken from
 * the game itself: a hand pinching a guest at the gate; a guest carried
 * over a glowing seat; a fingertip on the side board's Hire button.
 * The cream model hands are drawn for these (`?hands=cream`), since the
 * player's real hands cannot be in a picture.
 *
 * Usage: dev server running, then `node scripts/shoot-howto.mjs`.
 * Output: public/ui/howto-pinch.jpg, howto-seat.jpg, howto-hire.jpg.
 */

import { mkdirSync } from 'node:fs';

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/?hands=cream';
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
  game.click('skip');
  guests.spawnSeconds = [0.5, 1];
  guests.spawnPace = 1;
  guests.patienceFrozen = true;
});
// The side board is put away for the first two pictures (it stands by the line).
const board = (on) => page.evaluate((on) => window.__cafe.board.panel.show(on), on);
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

// 3. The side board: enough in the bank, the fingertip coming to Hire.
await board(true);
await handRaw(AWAY);
await frames(4);
await page.evaluate(() => (window.__cafe.score.bank = 75));
await frames(2);
const hire = await page.evaluate(() => {
  const p = window.__cafe.board.panel;
  const b = p.buttons.find((x) => x.id === 'hire');
  const g = p.mesh.geometry.parameters;
  const V = p.mesh.position.constructor;
  const s = p.mesh.getWorldScale(new V()).z;
  return { button: p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h * 0.8) / p.height) * g.height, 0.035 / s)).toArray(), centre: p.mesh.getWorldPosition(new V()).toArray() };
});
// Look first (the board turns to the eyes), then bring the finger up to it.
await h.head(P(add(hire.centre, [0.3, 0.1, 0.06])), P(hire.centre), 300);
await frames(6);
const at = await page.evaluate(() => {
  const p = window.__cafe.board.panel;
  const b = p.buttons.find((x) => x.id === 'hire');
  const g = p.mesh.geometry.parameters;
  const V = p.mesh.position.constructor;
  const s = p.mesh.getWorldScale(new V()).z;
  return [0.09, 0.035].map((out) => p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h * 0.8) / p.height) * g.height, out / s)).toArray());
});
for (const p of at) { await handRaw(p.map((v, i) => v - tip[i])); await frames(3); }
await shot('howto-hire');

const errors = await h.finish();
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no console errors');
console.log('public/ui/howto-pinch.jpg, howto-seat.jpg, howto-hire.jpg');
process.exit(0);
