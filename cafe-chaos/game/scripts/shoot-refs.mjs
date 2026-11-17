/**
 * Reference renders for store art and key art (to hand to an image model
 * or an artist with the prompts in docs/STORE-ART.md): the café from the
 * front and three-quarters, the guests in line, each guest close, the
 * counter, and a hand over a guest. Timer dots and the scoreboard are
 * hidden; the emulator's grey room is hidden (a dark ground).
 * Usage: dev server running, then `node scripts/shoot-refs.mjs`.
 * Output: artifacts/refs/ref-*.png (or the folder in $OUT).
 */

import { mkdirSync } from 'node:fs';

process.env.APP_URL = 'https://localhost:8082/?hands=cream';
const { startHeadset } = await import('./lib/headset.mjs');
const OUT = process.env.OUT ?? 'artifacts/refs';
mkdirSync(OUT, { recursive: true });
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const h = await startHeadset({ size: { width: 1600, height: 1000 }, fovDeg: 50, async prepare(h) {
  await h.head(SEAT, { x: -1.3, y: 0.79, z: 0.28 });
  await h.page.evaluate(() => window.__cafe.system.replace());
  await h.page.waitForFunction(() => window.__cafe.game.phase === 'title' && window.__cafe.mood.lampsUp > 0.99, null, { timeout: 60000 });
} });
const { page } = h;
await page.evaluate(() => { for (const c of document.querySelectorAll('canvas')) if (getComputedStyle(c).zIndex === '1') c.style.visibility = 'hidden'; document.body.style.background = '#1d1916'; });
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const handRaw = (p) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
await handRaw([-0.3, 0.3, 1.2]);
await page.evaluate(() => window.__cafe.game.click('open'));
await page.waitForFunction(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving, null, { timeout: 60000 });
await page.evaluate(() => window.__cafe.game.click('skip'));
await page.waitForFunction(() => window.__cafe.game.phase === 'run', null, { timeout: 60000 });
await page.evaluate(() => { const g = window.__cafe.guests; g.patienceFrozen = true; g.spawnSeconds = [0.3, 0.6]; window.__cafe.strip.panel.show(false); });
await page.waitForFunction(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 4, null, { timeout: 180000 });
// Seat a few guests so the café looks busy.
await page.evaluate(() => { const { guests } = window.__cafe; const free = guests.seats.filter((s) => s.occupant === 0); [0, 5, 9].forEach((k, i) => { const g = guests.line[0]; if (g && free[k]) guests.seatGuest(g.id, free[k].index); }); });
await page.waitForTimeout(4000);
await page.evaluate(() => { window.__cafe.strip.panel.show(false); for (const g of window.__cafe.guests.guests) g.dial.sprite.visible = false; window.__cafe.guests.patienceFrozen = true; });
const cafe = await page.evaluate(() => window.__cafe.system.cafe.position.toArray());
const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
const hideDots = () => page.evaluate(() => { const g0 = window.__cafe.guests.guests[0]; if (g0) { const proto = Object.getPrototypeOf(g0.dial); proto.update = function () { this.sprite.visible = false; }; } for (const g of window.__cafe.guests.guests) g.dial.sprite.visible = false; });
await hideDots();
// 1. Hero: three-quarter view from front-right, a little above.
await h.head(P([cafe[0] + 0.55, cafe[1] + 0.32, cafe[2] + 0.32]), P([cafe[0], cafe[1] + 0.08, cafe[2]]));
await page.waitForTimeout(1200); await hideDots();
await page.screenshot({ path: `${OUT}/ref-cafe-hero.png` });
// 2. Front, eye level with the café.
await h.head(P([cafe[0] + 0.62, cafe[1] + 0.14, cafe[2]]), P([cafe[0], cafe[1] + 0.1, cafe[2]]));
await page.waitForTimeout(1200); await hideDots();
await page.screenshot({ path: `${OUT}/ref-cafe-front.png` });
// 3. The guests in line, close.
const q = await page.evaluate(() => { const { guests, system } = window.__cafe; const l = guests.line.slice(0, 3); const V = system.cafe.position.constructor; const c = new V(); l.forEach((g) => c.add(g.actor.grip.getWorldPosition(new V()))); return c.divideScalar(l.length).toArray(); });
await h.head(P([q[0] + 0.2, q[1] + 0.06, q[2] + 0.1]), P([q[0], q[1], q[2]]));
await page.waitForTimeout(1200); await hideDots();
await page.screenshot({ path: `${OUT}/ref-guests.png` });
// 4. A barista at the counter.
const b = await page.evaluate(() => { const s = window.__cafe.baristas.staff[0]; const V = window.__cafe.system.cafe.position.constructor; const r = s?.barista?.root; return r ? r.getWorldPosition(new V()).toArray() : null; });
if (b) { await h.head(P([b[0] + 0.16, b[1] + 0.09, b[2] + 0.12]), P([b[0], b[1] + 0.035, b[2]])); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/ref-barista.png` }); }
// 4b. Each guest kind on its own, close.
const each = await page.evaluate(() => { const { guests, system } = window.__cafe; const V = system.cafe.position.constructor; return guests.line.slice(0, 4).map((g) => g.actor.grip.getWorldPosition(new V()).toArray()); });
for (const [i, e] of each.entries()) { await h.head(P([e[0] + 0.11, e[1] + 0.03, e[2] + 0.02]), P([e[0], e[1], e[2]])); await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/ref-guest-${i + 1}.png` }); }
// 5. A hand pinching a guest.
const g = await page.evaluate(() => { const { guests, system } = window.__cafe; return guests.line[0].actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray(); });
await page.evaluate(() => { for (const c of window.__cafe.guests.cards.cards) c.mesh.layers.set(7); });
await h.head(P([g[0] + 0.24, g[1] + 0.12, g[2] + 0.14]), P([g[0] - 0.02, g[1] + 0.03, g[2]]));
await handRaw([g[0] - 0.02, g[1] + 0.02, g[2] - 0.06]);
await page.waitForTimeout(1200); await hideDots();
await page.screenshot({ path: `${OUT}/ref-pinch.png` });
console.log(`${OUT}/ref-*.png`);
await h.finish();
process.exit(0);
