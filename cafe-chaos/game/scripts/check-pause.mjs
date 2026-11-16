/**
 * Pause check, in the real game from the seat:
 * 1. the headset's own menu in front (the session goes visible-blurred) pauses a run;
 *    when it is gone the game stays paused until the player resumes;
 * 2. while paused the café is still (clock stopped, hands kept off the guests),
 *    its lamps go down and the theme is turned down;
 * 3. paused, the café is hidden behind the card; Resume carries on at once:
 *    the café shows and moves again, and the lamps and theme come back up;
 * 4. the bar's Pause pauses again at once (the pause card is back);
 * 5. the pause card has Resume, How to play, Settings and End (no Hire); the
 *    bar's Shop, while paused, opens the shop; HIRE there hires and shows the
 *    next price; CLOSE goes back to the pause card.
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
  return { phase: game.phase, clock: +game.clock.toFixed(2), card: game.menu.card.open, dim: +mood.paused.toFixed(2), handsOff: guests.handsOff, duck: theme.ducked, tabPressed: null };
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

// 3. Paused, the café is hidden behind the card; Resume: at once, the café shows and moves again (no count).
// The café's place in the world (position, turn, size), before the pause card hides it and after Resume.
const pose = () => page.evaluate(() => {
  const c = window.__cafe.system.cafe;
  c.updateWorldMatrix(true, false);
  return { m: c.matrixWorld.toArray() };
});
const hiddenWhilePaused = await page.evaluate(() => !window.__cafe.system.cafe.visible);
const before = await pose();
await page.evaluate(() => window.__cafe.game.click('resume'));
await page.waitForTimeout(50);
s = await state();
const shownAgain = await page.evaluate(() => window.__cafe.system.cafe.visible);
const afterPose = await pose();
const moved = Math.max(...before.m.map((v, i) => Math.abs(v - afterPose.m[i])));
check('paused the café is hidden; Resume carries on at once, the café shown again', hiddenWhilePaused && s.phase === 'run' && !s.card && shownAgain, JSON.stringify({ hiddenWhilePaused, shownAgain, phase: s.phase, card: s.card }));
check('on Resume the café is back exactly where it was (same place, turn and size)', moved < 1e-6, `largest change in its world matrix ${moved.toExponential(1)}`);
// 4. Pause again: paused at once, the card back.
await page.evaluate(() => window.__cafe.game.click('bar-pause'));
await page.waitForTimeout(800);
s = await state();
const at2 = s.clock;
check('Pause again pauses at once, the card back', s.phase === 'paused' && s.card, JSON.stringify(s));
// 5. The pause card (no Hire); the shop from the bar, while paused.
const ids = await page.evaluate(() => window.__cafe.game.menu.card.buttons.map((b) => b.id));
await page.evaluate(() => { window.__cafe.score.bank = 100; window.__cafe.game.click('bar-shop'); });
const shopOpen = await page.evaluate(() => ({ kind: window.__cafe.game.menu.cardKind, phase: window.__cafe.game.phase }));
await page.evaluate(() => window.__cafe.game.click('hire'));
await page.waitForTimeout(800);
const after = await page.evaluate(() => ({ staff: window.__cafe.shop.staff, phase: window.__cafe.game.phase, next: window.__cafe.game.menu.card.buttons.find((b) => b.id.startsWith('hire'))?.label, wrist: window.__cafe.wrist.open }));
await h.screenshot('artifacts/pause-shop.png');
await page.evaluate(() => window.__cafe.game.click('shop-close'));
const backTo = await page.evaluate(() => ({ kind: window.__cafe.game.menu.cardKind, phase: window.__cafe.game.phase }));
check('the pause card offers Resume, How to play, Settings and End; Shop opens the shop, HIRE hires and shows the next price, CLOSE goes back to the pause card',
  ids.join(',') === 'resume,how,settings,end' && shopOpen.kind === 'shop' && shopOpen.phase === 'paused' && after.staff === 2 && after.phase === 'paused' && /150/.test(after.next ?? '') && backTo.kind === 'pause' && backTo.phase === 'paused',
  `${ids.join(',')} | shop ${JSON.stringify(shopOpen)} -> ${JSON.stringify(after)} -> ${JSON.stringify(backTo)}`);
await h.screenshot('artifacts/pause-card.png');
// Then all the way through.
await page.evaluate(() => window.__cafe.game.click('resume'));
await until(() => window.__cafe.game.phase === 'run', 60000);
await page.waitForTimeout(3000);
await until(() => window.__cafe.mood.paused < 0.1, 30000);
s = await state();
check('after Resume the café moves again, lamps and theme back up', s.phase === 'run' && s.clock > at2 && !s.card && !s.handsOff && s.dim < 0.1 && !s.duck, JSON.stringify(s));
await h.screenshot('artifacts/pause-3-running.png');
const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
