/**
 * Saving the staff, across a reload of the page:
 * 1. a fresh café has one barista;
 * 2. a hire is saved, and after a reload the café comes back with two (not more,
 *    and none appearing then going);
 * 3. an old save with more hires than there are now is held to three baristas;
 * 4. with all three on the staff, Hire is no longer offered.
 * Usage: dev server running, then `node scripts/check-save.mjs`.
 * Output: PASS/FAIL lines.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const KEY = 'cafe-chaos/save/v2';
const ready = async (h) => {
  await h.head(SEAT, LOOK);
  await h.page.evaluate(() => window.__cafe.system.replace());
  await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 90000 });
  // The models load in the background: give them time to come on.
  await h.page.waitForTimeout(6000);
};
const h = await startHeadset({ prepare: async (h) => { await h.page.evaluate((k) => localStorage.removeItem(k), KEY); await h.reload(); } });
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
/** Reload the page as a player would (the headset harness set up again), and watch the staff while it loads. */
async function reload() {
  await h.reload();
  await page.evaluate(() => { window.__most = 0; const tick = () => { window.__most = Math.max(window.__most, window.__cafe.baristas.staff.length); requestAnimationFrame(tick); }; tick(); });
  await ready(h);
}
const staff = () => page.evaluate(() => ({ staff: window.__cafe.baristas.staff.length, most: window.__most ?? null, hires: window.__cafe.shop.hires, price: window.__cafe.shop.price, saved: JSON.parse(localStorage.getItem('cafe-chaos/save/v2') ?? 'null') }));

await ready(h);
let s = await staff();
check('a fresh café has one barista', s.staff === 1 && s.hires === 0 && s.price === 60, JSON.stringify(s));
await page.evaluate(() => { const { game, score } = window.__cafe; game.click('open'); game.click('skip'); score.bank = 100; game.click('hire'); });
await page.waitForFunction(() => window.__cafe.baristas.staff.length === 2, null, { timeout: 60000 }).catch(() => {});
s = await staff();
check('a hire is saved', s.staff === 2 && s.saved?.hires === 1, JSON.stringify(s));
await reload();
s = await staff();
check('after a reload the café comes back with two baristas, never more', s.staff === 2 && s.most === 2 && s.hires === 1 && s.price === 120, JSON.stringify(s));
await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ bank: 50, hires: 5, tutorialDone: true, bestSeconds: 0, bestCoins: 0, runs: 1 })), KEY);
await reload();
s = await staff();
check('an old save with more hires is held to three baristas, and Hire is no longer offered', s.staff === 3 && s.most === 3 && s.hires === 2 && s.price === null, JSON.stringify(s));
await page.evaluate((k) => localStorage.removeItem(k), KEY);
const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
