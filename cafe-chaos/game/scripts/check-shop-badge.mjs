/**
 * No pop-ups, and the Shop badge (the owner's Quest playtest: the tip
 * cards and the notes under the bar were small and in the face; what is
 * new shows as a count on the Shop button instead). In the real game:
 *  1. a fresh game's first minute (the goal, the first guests and their
 *     cards, when tips used to come): no tip card and no note ever opens;
 *  2. the Shop button's red badge counts what the Shop can newly buy: none
 *     with the bank empty; a table with the bank able to pay for one; a
 *     barista too with more;
 *  3. Shop (pointed at with the ray and pinched) opens as usual and the
 *     badge goes; closed, it stays gone for what was seen;
 *  4. something new to buy (the janitor) brings it back with 1;
 *  5. no console errors.
 * Shots: artifacts/shop-badge-bar.png (the bar, flat), -view.png.
 *
 * Usage: dev server running, then `node scripts/check-shop-badge.mjs`.
 */
import { writeFileSync } from 'node:fs';

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => { localStorage.removeItem('cafe-chaos/save/v4'); window.__cafe.system.replace(); });
    await h.page.waitForFunction(() => window.__cafe?.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const news = () => page.evaluate(() => window.__cafe.strip.shopNews);

// Into a fresh game's run, past the first-run steps.
await page.evaluate(() => window.__cafe.game.click('play-japan'));
await until(() => ['tutorial', 'run'].includes(window.__cafe.game.phase));
await page.evaluate(() => window.__cafe.game.click('skip'));
await until(() => window.__cafe.game.phase === 'run');

// 1. A minute of play as a fresh game: watched every frame, no tip card or note opens.
const watched = await page.evaluate(() => new Promise((ok) => {
  const { game, guests } = window.__cafe;
  const t0 = performance.now();
  const seen = { tip: false, note: false, tipShown: null };
  const tick = () => {
    if (game.tip.panel.open) seen.tip = true;
    if (game.note.panel.open) seen.note = true;
    if (game.tipShown) seen.tipShown = game.tipShown;
    if (performance.now() - t0 > 60000) { ok({ ...seen, guests: guests.guests.length }); return; }
    requestAnimationFrame(tick);
  };
  tick();
}));
check('a fresh game\'s first minute: no tip card and no note pops up', !watched.tip && !watched.note && watched.tipShown === null && watched.guests > 0, JSON.stringify(watched));

// 2. The badge counts what the Shop can newly buy.
const prices = await page.evaluate(() => ({ hire: window.__cafe.shop.price, table: window.__cafe.shop.tablePrice, janitor: window.__cafe.shop.janitorPrice }));
await page.evaluate(() => (window.__cafe.score.bank = 0));
await frames(4);
const none = await news();
await page.evaluate((p) => (window.__cafe.score.bank = p.table), prices);
await frames(4);
const one = await news();
await page.evaluate((p) => (window.__cafe.score.bank = Math.max(p.table, p.hire)), prices);
await frames(6);
const two = await news();
check('the badge: none with the bank empty, 1 for a table, 2 with a barista too', none === 0 && one === 1 && two === 2, JSON.stringify({ prices, none, one, two }));
const data = await page.evaluate(() => window.__cafe.strip.panel.canvas.toDataURL('image/png'));
writeFileSync('artifacts/shop-badge-bar.png', Buffer.from(data.split(',')[1], 'base64'));
await page.screenshot({ path: 'artifacts/shop-badge-view.png' });

// 3. Shop with the ray and a pinch: it opens as usual and the badge goes; closed, it stays gone.
const aimAt = async (id, panel) => {
  const from = [-1.08, 1.0, 0.1];
  const target = await page.evaluate(([id, panel]) => {
    const p = eval(panel);
    const b = p.buttons.find((x) => x.id === id);
    const g = p.mesh.geometry.parameters;
    const V = p.mesh.position.constructor;
    return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, 0)).toArray();
  }, [id, panel]);
  const d = target.map((v, i) => v - from[i]);
  const len = Math.hypot(...d);
  const n = d.map((v) => v / len);
  const c = [n[1], -n[0], 0];
  const w = 1 - n[2];
  const ql = Math.hypot(c[0], c[1], c[2], w);
  await send('set_transform', { device: 'hand-right', position: { x: from[0], y: from[1], z: from[2] }, orientation: { x: c[0] / ql, y: c[1] / ql, z: c[2] / ql, w: w / ql } });
  await frames(6);
};
const tap = async () => {
  await send('set_select_value', { device: 'hand-right', value: 1 });
  await frames(4);
  await send('set_select_value', { device: 'hand-right', value: 0 });
  await frames(4);
};
await aimAt('bar-shop', 'window.__cafe.strip.panel');
await tap();
const opened = await until(() => window.__cafe.game.phase === 'shopping' && window.__cafe.strip.drawer.panel.open, null, 8000);
const during = await news();
await page.evaluate(() => window.__cafe.game.click('shop-close'));
await until(() => window.__cafe.game.phase === 'run', null, 8000);
await frames(6);
const after = await news();
check('Shop opens as usual and the badge goes; closed, it stays gone', opened && during === 0 && after === 0, JSON.stringify({ opened, during, after }));

// 4. Something new to buy brings it back.
await page.evaluate((p) => (window.__cafe.score.bank = Math.max(p.table, p.hire, p.janitor)), prices);
await frames(6);
const again = await news();
check('something new to buy (the janitor) brings the badge back with 1', again === 1, JSON.stringify({ again }));

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} FAILED` : `${results.length}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
