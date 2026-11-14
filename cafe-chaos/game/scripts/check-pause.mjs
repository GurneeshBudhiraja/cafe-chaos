/**
 * Pause check, in the real game from the seat:
 * 1. the headset's own menu in front (the session goes visible-blurred) pauses a run;
 *    when it is gone the game stays paused until the player resumes;
 * 2. while paused the café is still (clock stopped, hands kept off the guests),
 *    its lamps go down and the theme is turned down;
 * 3. Resume counts 3, 2, 1 on the card and the pause button with the café still
 *    frozen, then the café moves again and the lamps and theme come back up;
 * 4. pressing pause during the count holds the pause (the pause card is back);
 * 5. the pause card has Hire (which hires) and How to play.
 * Usage: dev server running, then `node scripts/check-pause.mjs`.
 * Output: PASS/FAIL lines; artifacts/pause-*.png.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 60000) => page.waitForFunction(fn, null, { timeout, polling: 200 }).then(() => true, () => false);
const state = () => page.evaluate(() => {
  const { game, mood, theme, guests } = window.__cafe;
  return { phase: game.phase, resuming: +game.resuming.toFixed(2), clock: +game.clock.toFixed(2), card: game.card.open, dim: +mood.paused.toFixed(2), handsOff: guests.handsOff, duck: theme.ducked, tabPressed: null };
});
for (const k of ['left', 'right']) await page.evaluate((k) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }), k);
await page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); });
await until(() => window.__cafe.game.clock > 2);

// 1. The headset's menu: the session is blurred, then visible again.
await page.evaluate(() => window.IWER_DEVICE.updateVisibilityState('visible-blurred'));
await until(() => window.__cafe.game.phase === 'paused', 30000);
let s = await state();
check('the headset menu in front pauses the run', s.phase === 'paused' && s.card, JSON.stringify(s));
await page.evaluate(() => window.IWER_DEVICE.updateVisibilityState('visible'));
await page.waitForTimeout(4000);
const at = s.clock;
s = await state();
check('with the menu gone it stays paused until the player resumes', s.phase === 'paused' && s.clock === at, JSON.stringify(s));
// 2. Paused: still, hands off, lamps down, theme down.
await until(() => window.__cafe.mood.paused > 0.9, 30000);
s = await state();
check('paused: the café is still and hands are kept off the guests', s.clock === at && s.handsOff, JSON.stringify(s));
check('paused: the lamps go down and the theme is turned down', s.dim > 0.9 && s.duck, JSON.stringify(s));
await h.screenshot('artifacts/pause-1-paused.png');

// 3. Resume: 3, 2, 1 with the café still frozen, then it moves.
await page.evaluate(() => window.__cafe.game.click('resume'));
await page.waitForTimeout(500);
s = await state();
const tabCount = await page.evaluate(() => window.__cafe.game.resuming);
check('Resume starts a 3-2-1 with the café still frozen', s.phase === 'paused' && s.resuming > 0 && s.resuming <= 3 && s.clock === at && s.card, JSON.stringify(s));
await until(() => Math.ceil(window.__cafe.game.resuming) === 2, 30000);
await h.screenshot('artifacts/pause-2-count.png');
// 4. Pause during the count: held.
await page.evaluate(() => window.__cafe.game.click('tab'));
await page.waitForTimeout(1500);
s = await state();
check('pressing pause during the count holds the pause', s.phase === 'paused' && s.resuming === 0 && s.card && s.clock === at, JSON.stringify(s));
// 5. The pause card has Hire and How to play (the wrist menu is off by default).
const ids = await page.evaluate(() => window.__cafe.game.card.buttons.map((b) => `${b.id}:${b.label}`));
await page.evaluate(() => { window.__cafe.score.bank = 100; window.__cafe.game.click('hire'); });
await page.waitForTimeout(800);
const after = await page.evaluate(() => ({ staff: window.__cafe.shop.staff, phase: window.__cafe.game.phase, hire: window.__cafe.game.card.buttons.find((b) => b.id === 'hire')?.label, wrist: window.__cafe.wrist.open }));
check('the pause card offers Resume, Hire, How to play and End; Hire there hires and shows the next price', ids.map((x) => x.split(':')[0]).join(',') === 'resume,hire,how,end' && after.staff === 2 && after.phase === 'paused' && /120/.test(after.hire ?? ''), `${ids.join(' | ')} -> ${JSON.stringify(after)}`);
await h.screenshot('artifacts/pause-card.png');
// Then all the way through.
await page.evaluate(() => window.__cafe.game.click('resume'));
await until(() => window.__cafe.game.phase === 'run', 60000);
await page.waitForTimeout(3000);
await until(() => window.__cafe.mood.paused < 0.1, 30000);
s = await state();
check('after the count the café moves again, lamps and theme back up', s.phase === 'run' && s.clock > at && !s.card && !s.handsOff && s.dim < 0.1 && !s.duck, JSON.stringify(s));
await h.screenshot('artifacts/pause-3-running.png');
const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed (count started at ${tabCount.toFixed(2)})`);
process.exit(results.every(Boolean) ? 0 : 1);
