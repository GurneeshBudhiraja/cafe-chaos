/**
 * Tips check, in the real game (game/tips.ts):
 *  1. the first run's coach card takes the hand ray (its Skip, out of a
 *     seated reach, is pressed with a point and a pinch);
 *  2. at the start of level 1, "Serve 5 guests" under the bar's count, gone
 *     once a guest is served; then with the bank able to pay for a table,
 *     "Open a table" next to a padlock, with a pop; buying one sends it away;
 *  3. the first guest in a hurry: "In a hurry!" over it, and its clock
 *     waits while the tip is up; seated, the tip goes;
 *  4. the first pair: "Two friends"; the first dirty table: "Dirty table";
 *     the bank able to pay for a barista: "More hands" under the Shop
 *     button, gone when the shop opens;
 *  5. one at a time; each once a save (after a reload none comes back);
 *     no console errors.
 * Usage: dev server running, then `node scripts/check-tips.mjs`.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const ready = (h) => h.page.waitForFunction(() => window.__cafe?.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => { localStorage.removeItem('cafe-chaos/save/v3'); window.__cafe.system.replace(); });
    await ready(h);
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 60000, arg = null) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const tip = () => page.evaluate(() => { const { game } = window.__cafe; return { shown: game.tipShown, open: game.tip.panel.open, count: game.tipsShown, saved: JSON.parse(localStorage.getItem('cafe-chaos/save/v3') ?? 'null')?.tips ?? [] }; });
for (const k of ['left', 'right']) await send('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });

// 1. The coach card takes the ray: aim at its Skip and pinch.
await page.evaluate(() => window.__cafe.game.click('new'));
await until(() => window.__cafe.game.phase === 'tutorial' && window.__cafe.game.coach.open, 60000);
await page.waitForTimeout(800);
const REST = [SEAT.x - 0.25, SEAT.y - 0.35, SEAT.z - 0.15];
const target = await page.evaluate(() => {
  const p = window.__cafe.game.coach;
  const b = p.buttons.find((x) => x.id === 'skip');
  const g = p.mesh.geometry.parameters;
  const V = p.mesh.position.constructor;
  p.mesh.updateWorldMatrix(true, false);
  return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, 0)).toArray();
});
{
  const d = target.map((v, i) => v - REST[i]);
  const len = Math.hypot(...d);
  const n = d.map((v) => v / len);
  const cr = [-n[1] * 0 + 0 * n[2] - (-1) * n[1], -1 * n[0] - 0 * n[2], 0];
  const ax = [0, 0, -1];
  const c2 = [ax[1] * n[2] - ax[2] * n[1], ax[2] * n[0] - ax[0] * n[2], ax[0] * n[1] - ax[1] * n[0]];
  void cr;
  const w = 1 + (ax[0] * n[0] + ax[1] * n[1] + ax[2] * n[2]);
  const ql = Math.hypot(c2[0], c2[1], c2[2], w);
  await send('set_transform', { device: 'hand-right', position: { x: REST[0], y: REST[1], z: REST[2] }, orientation: { x: c2[0] / ql, y: c2[1] / ql, z: c2[2] / ql, w: w / ql } });
}
await frames(6);
const aimed = await page.evaluate(() => window.__cafe.game.aim.right);
await send('set_select_value', { device: 'hand-right', value: 1 });
await frames(4);
await send('set_select_value', { device: 'hand-right', value: 0 });
await frames(4);
await until(() => window.__cafe.game.phase === 'run', 20000);
check('the first run\'s coach card takes the hand ray: Skip pointed at and pinched starts the run', aimed === 'skip' && (await page.evaluate(() => window.__cafe.game.phase)) === 'run', `aimed ${aimed}`);
await send('set_transform', { device: 'hand-right', position: { x: -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
await page.evaluate(() => { const { guests } = window.__cafe; guests.arrivals = false; guests.patienceFrozen = true; guests.clear(); });

// 2. The goal first, under the bar's level count; then the table tip.
await until(() => window.__cafe.game.tipShown === 'goal', 10000);
let t = await tip();
// In the bar's own space (it turns to the player): below it, and left of its middle, where the level count is.
const goalAt = await page.evaluate(() => { const { game, system } = window.__cafe; const V = system.cafe.position.constructor; const p = game.tip.panel.mesh.getWorldPosition(new V()); const bar = game.strip.panel.mesh.getWorldPosition(new V()); const local = game.strip.panel.mesh.worldToLocal(p.clone()); return { below: bar.y - p.y, left: -local.x, title: game.tip.drawn.split('|')[0] }; });
check('at the start of level 1: "Serve 5 guests" under the bar, towards its level count', t.shown === 'goal' && t.open && goalAt.title === 'Serve 5 guests' && goalAt.below > 0.03 && goalAt.below < 0.12 && goalAt.left > 0.02, JSON.stringify({ ...t, ...goalAt }));
await h.screenshot('artifacts/tips-0-goal.png');
await page.evaluate(() => { window.__cafe.game.levelServed = 1; });
await until(() => window.__cafe.game.tipShown === null, 10000);
check('a guest served sends the goal tip away', (await tip()).shown === null, 'gone');
await page.evaluate(() => { window.__cafe.game.levelServed = 0; window.__cafe.score.bank = 16; });
await until(() => window.__cafe.game.tipShown === 'table', 10000);
t = await tip();
const pops = await page.evaluate(() => window.__cafe.sound.tips);
check('the bank able to pay for a table: "Open a table" next to a padlock, with a pop; saved as seen', t.shown === 'table' && t.open && pops === 2 && t.saved.includes('table'), JSON.stringify({ ...t, pops }));
await h.screenshot('artifacts/tips-1-table.png');
await page.evaluate(() => { const { game } = window.__cafe; const tag = game.tags[0]; game.click(`table-${tag.table}`); game.click('buy-yes'); });
await until(() => window.__cafe.game.tipShown === null, 10000);
check('buying a table sends the tip away', (await tip()).shown === null, 'gone');

// 3. The first guest in a hurry.
const hurried = await page.evaluate(() => { const { guests } = window.__cafe; guests.patienceFrozen = false; guests.hurryIn(1); const g = guests.spawn(); return g.id; });
await until(() => window.__cafe.game.tipShown === 'hurry', 20000);
const p1 = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id).patience, hurried);
await page.waitForTimeout(1500);
const p2 = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id).patience, hurried);
check('the first hurried guest: "In a hurry!" over it, its clock waiting while the tip is up', Math.abs(p2 - p1) < 0.15, `patience ${p1.toFixed(2)} -> ${p2.toFixed(2)}`);
await h.screenshot('artifacts/tips-2-hurry.png');
// Paused with the tip up, then back: the tip shows again (it was used up unseen before).
await page.evaluate(() => window.__cafe.game.click('bar-pause'));
await until(() => window.__cafe.game.phase === 'paused');
const hiddenWhilePaused = await page.evaluate(() => !window.__cafe.game.tip.panel.open);
await page.evaluate(() => window.__cafe.game.click('resume'));
await until(() => window.__cafe.game.phase === 'run');
await frames(4);
const backAfter = await page.evaluate(() => ({ shown: window.__cafe.game.tipShown, open: window.__cafe.game.tip.panel.open }));
check('paused with a tip up it hides, and back in the run it shows again', hiddenWhilePaused && backAfter.shown === 'hurry' && backAfter.open, JSON.stringify({ hiddenWhilePaused, ...backAfter }));
await page.evaluate((id) => { const { guests } = window.__cafe; const s = guests.seats.find((x) => x.occupant === 0 && !x.locked && !x.dirty); guests.seatGuest(id, s.index); }, hurried);
await until(() => window.__cafe.game.tipShown === null, 10000);
check('seated, the hurry tip goes', (await tip()).shown === null, 'gone');

// 4. A pair, a dirty table, the shop.
await page.evaluate(() => { const { guests } = window.__cafe; guests.patienceFrozen = true; guests.level = 6; guests.queueCap = 4; const a = guests.spawn(); const b = guests.spawn(); guests.pair(a, b); });
await until(() => window.__cafe.game.tipShown === 'pair', 20000);
check('the first pair: "Two friends"', (await tip()).shown === 'pair', 'shown');
await page.evaluate(() => { const { guests } = window.__cafe; for (const g of guests.guests.filter((x) => x.friend && x.state === 'queued')) { const s = guests.seats.find((x) => x.occupant === 0 && !x.locked && !x.dirty); guests.seatGuest(g.id, s.index); } });
await until(() => window.__cafe.game.tipShown === null, 15000);
await page.evaluate(() => window.__cafe.mess.soil(window.__cafe.shop.tables.find((x) => x !== 2 && x !== 8) ?? 8));
await until(() => window.__cafe.game.tipShown === 'dirty', 20000);
check('the first dirty table: "Dirty table"', (await tip()).shown === 'dirty', 'shown');
await until(() => window.__cafe.game.tipShown === null, 20000);
await page.evaluate(() => { window.__cafe.score.bank = 80; });
await until(() => window.__cafe.game.tipShown === 'shop', 20000);
check('the bank able to pay for a barista: "More hands" under the Shop button', (await tip()).shown === 'shop', 'shown');
await h.screenshot('artifacts/tips-3-shop.png');
await page.evaluate(() => window.__cafe.game.click('bar-shop'));
await until(() => window.__cafe.game.tipShown === null, 10000);
check('opening the shop sends it away', (await tip()).shown === null, 'gone');
await page.evaluate(() => window.__cafe.game.click('shop-close'));

// 5. Once a save.
t = await tip();
check('each tip was shown once, one at a time, and saved', t.count === 6 && ['goal', 'table', 'hurry', 'pair', 'dirty', 'shop'].every((x) => t.saved.includes(x)), JSON.stringify(t));
await page.evaluate(() => window.__cafe.game.click('bar-pause'));
await until(() => window.__cafe.game.phase === 'paused');
await h.reload();
await ready(h);
await page.evaluate(() => { const { game } = window.__cafe; game.click('continue'); });
await until(() => window.__cafe.game.phase === 'run', 60000);
await page.evaluate(() => { const { guests, score, mess } = window.__cafe; guests.arrivals = false; score.bank = 900; guests.hurryIn(1); guests.spawn(); mess.soil(8); });
await page.waitForTimeout(6000);
t = await tip();
check('after a reload none comes back', t.count === 0 && t.shown === null, JSON.stringify(t));

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
