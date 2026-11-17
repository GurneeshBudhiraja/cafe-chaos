/**
 * Bar check: Pause and Shop on the scoreboard, pressed with the hand ray.
 * In a run, with the viewer seated at the emulated table, it checks that:
 * 1. the bar shows Pause and Shop, live in a run; no round pause tab;
 * 2. a hand away from the café, pointed at Pause, shows the ray and lights
 *    the button; a pinch pauses, and the pause card stands in front of the
 *    eyes (RESUME, How to play, Settings, END THE EVENING; no Hire);
 * 3. paused, the café (and the bar) are hidden behind the card; RESUME on
 *    the card, pointed at and pinched: the run goes on at once;
 * 4. with the coins, Shop pauses and opens the shop; HIRE hires the next
 *    barista (the price taken); CLOSE carries on with the run;
 * 5. a hand over the café has no ray, and its pinch presses nothing;
 * 6. nothing on the console.
 *
 * Usage: dev server running, then `node scripts/check-bar.mjs`.
 * Output: artifacts/bar-*.png, and a pass/fail line.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const pinch = (value) => send('set_select_value', { device: 'hand-right', value });

// Into a run (straight past the first-run steps).
await page.evaluate(() => window.__cafe.game.click('open'));
await until(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving, null, 60000);
await page.evaluate(() => window.__cafe.game.click('skip'));
await until(() => window.__cafe.game.phase === 'run', null, 60000);
await page.waitForTimeout(800);

let s = await page.evaluate(() => ({ controls: window.__cafe.strip.controls, buttons: window.__cafe.strip.panel.buttons.map((b) => b.id), tab: !!window.__cafe.game.tab }));
check('the bar has Pause and Shop, live in a run; no pause tab', s.controls === 'live' && s.buttons.join() === 'bar-pause,bar-shop' && !s.tab, JSON.stringify(s));

/** Hold the right hand at `from` (world), turned so its ray points at a button's centre: on the bar, or (`card`) on the menu card. */
/** Aim the right hand's ray at a button: on the bar, on the menu card (`card` true), or on the panel an expression names. */
const aimAt = async (id, from = [-1.08, 1.0, 0.1], card = false) => {
  from ??= [-1.08, 1.0, 0.1];
  const target = await page.evaluate(([id, card]) => {
    const p = typeof card === 'string' ? eval(card) : card ? window.__cafe.game.menu.card : window.__cafe.strip.panel;
    const b = p.buttons.find((x) => x.id === id);
    const g = p.mesh.geometry.parameters;
    const V = p.mesh.position.constructor;
    const s = p.mesh.getWorldScale(new V()).z;
    return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, 0.0 / s)).toArray();
  }, [id, card]);
  // A quaternion turning -Z to the direction from the hand to the target.
  const d = target.map((v, i) => v - from[i]);
  const len = Math.hypot(...d);
  const n = d.map((v) => v / len);
  const a = [0, 0, -1];
  const dot = a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
  const c = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
  const w = 1 + dot;
  const ql = Math.hypot(c[0], c[1], c[2], w);
  await send('set_transform', { device: 'hand-right', position: { x: from[0], y: from[1], z: from[2] }, orientation: { x: c[0] / ql, y: c[1] / ql, z: c[2] / ql, w: w / ql } });
  await frames(6);
};
const tap = async () => {
  await pinch(1);
  await frames(4);
  await pinch(0);
  await frames(4);
};
const state = () => page.evaluate(() => { const { game, strip, shop, score } = window.__cafe; return { phase: game.phase, aim: game.aim.right, ray: game.rays.showing('right'), hover: strip.panel.hover, kind: game.menu.cardKind, card: game.menu.card.open, cardButtons: game.menu.card.buttons.map((b) => b.id), hires: shop.hires, bank: score.bank, controls: strip.controls }; });

// 2. Point at Pause: the ray shows, the button lights; pinch: paused, the card in front.
await aimAt('bar-pause');
s = await state();
check('a hand pointed at Pause shows the ray and lights it', s.aim === 'bar-pause' && s.ray && s.hover === 'bar-pause', JSON.stringify({ aim: s.aim, ray: s.ray, hover: s.hover }));
await page.screenshot({ path: 'artifacts/bar-aim.png' });
await tap();
s = await state();
const spot = await page.evaluate(() => { const { game } = window.__cafe; const m = game.menu.card.mesh; return { d: m.position.distanceTo(game.head), below: game.head.y - m.position.y }; });
check('a pinch pauses; the pause card stands in front of the eyes, without Hire', s.phase === 'paused' && s.kind === 'pause' && s.card && s.cardButtons.join() === 'resume,how,settings,end' && spot.d > 0.85 && spot.d < 1.15 && spot.below > 0.08, `${JSON.stringify({ phase: s.phase, kind: s.kind, buttons: s.cardButtons })}, ${(spot.d * 100).toFixed(0)} cm away, ${(spot.below * 100).toFixed(0)} cm below the eyes`);
await page.waitForTimeout(600);
await page.screenshot({ path: 'artifacts/bar-paused.png' });

// 3. While paused the café (and the bar with it) is hidden behind the card; RESUME on the card: the run goes on at once.
const hidden = await page.evaluate(() => !window.__cafe.system.cafe.visible);
check('paused, the café is hidden behind the card (not drawn)', hidden, `hidden ${hidden}`);
await aimAt('resume', undefined, true);
await tap();
s = await state();
const shown = await page.evaluate(() => window.__cafe.system.cafe.visible);
check('RESUME carries on at once, the café shown again', s.phase === 'run' && !s.card && shown, JSON.stringify({ phase: s.phase, card: s.card, shown }));

// 4. Shop: the drawer comes down under the bar, the café still and in view; HIRE; Close carries on.
await page.evaluate(() => (window.__cafe.score.bank = 75));
await frames(4);
const badge = await page.evaluate(() => window.__cafe.shop.affordable);
await aimAt('bar-shop');
await tap();
s = await state();
const drawer = () => page.evaluate(() => { const { strip, system } = window.__cafe; const V = system.cafe.position.constructor; const d = strip.drawer.panel; d.mesh.updateWorldMatrix(true, false); return { open: d.open, buttons: d.buttons.map((b) => b.id), speed: system.timeScale, cafe: system.cafe.visible, card: window.__cafe.game.menu.card.open, bottom: d.mesh.localToWorld(new V(0, -0.05, 0)).y, top: system.cafe.localToWorld(new V(0, 0.405, -0.33)).y }; });
let dr = await drawer();
check('Shop: the drawer comes down under the bar, the café still and in view (no card), clear of the café\'s top', s.phase === 'shopping' && dr.open && dr.buttons.includes('hire') && dr.buttons.includes('shop-close') && dr.speed === 0 && dr.cafe && !dr.card && dr.bottom > dr.top && badge, JSON.stringify({ phase: s.phase, ...dr, affordable: badge }));
await page.waitForTimeout(600);
await page.screenshot({ path: 'artifacts/bar-shop.png' });
// HIRE pointed at and pinched in the drawer.
await aimAt('hire', null, 'window.__cafe.strip.drawer.panel');
await tap();
s = await state();
dr = await drawer();
check('HIRE (pointed at and pinched) hires the next barista, the price taken; the drawer shows the next price', s.hires === 1 && s.bank === 35 && s.phase === 'shopping' && dr.buttons.includes('hire-later'), JSON.stringify({ hires: s.hires, bank: s.bank, buttons: dr.buttons }));
await aimAt('shop-close', null, 'window.__cafe.strip.drawer.panel');
await tap();
const closed = await until(() => window.__cafe.game.phase === 'run' && !window.__cafe.strip.drawer.panel.open && window.__cafe.system.timeScale === 1, null, 15000);
check('Close carries on with the run', closed, `${closed}`);

// 5. A hand over the café: no ray, and a pinch presses nothing on the bar.
const cafeTop = await page.evaluate(() => { const c = window.__cafe.system.cafe.position; return [c.x, c.y + 0.08, c.z]; });
await aimAt('bar-pause', cafeTop);
s = await state();
await tap();
const after = await state();
check('a hand over the café has no ray; its pinch does not pause', s.aim === null && !s.ray && after.phase === 'run', JSON.stringify({ aim: s.aim, ray: s.ray, phase: after.phase }));
// High over the roof (lifting a guest, reaching over to the back), pointing straight at Pause: still over the café, no ray.
const overRoof = await page.evaluate(() => { const { system, hold } = window.__cafe; const V = system.cafe.position.constructor; const p = system.cafe.localToWorld(new V(0, hold.bounds.max.y + 0.2, 0)); return p.toArray(); });
await aimAt('bar-pause', overRoof);
s = await state();
await tap();
const afterHigh = await state();
check('a hand 20 cm over the café\'s roof, pointed at Pause: no ray, its pinch does not pause (a guest pinch never presses the bar)', s.aim === null && !s.ray && afterHigh.phase === 'run', JSON.stringify({ aim: s.aim, ray: s.ray, phase: afterHigh.phase }));

// 6. A raised hand pointing at nothing yet: the short beam, no cursor (so the ray is there to be found).
{
  const from = [-1.08, 1.0, 0.1];
  // Up and off to the player's side, away from the bar and the café.
  const d = [0.15, 0.35, 0.9];
  const len = Math.hypot(...d);
  const n = d.map((v) => v / len);
  const a = [0, 0, -1];
  const dot = a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
  const c = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
  const w = 1 + dot;
  const ql = Math.hypot(c[0], c[1], c[2], w);
  await send('set_transform', { device: 'hand-right', position: { x: from[0], y: from[1], z: from[2] }, orientation: { x: c[0] / ql, y: c[1] / ql, z: c[2] / ql, w: w / ql } });
  await frames(8);
}
const beam = await page.evaluate(() => ({ aim: window.__cafe.game.aim.right, showing: window.__cafe.game.rays.showing('right'), idle: window.__cafe.game.rays.idleBeam('right') }));
check('a raised hand pointing at nothing shows the short beam without a cursor', beam.aim === null && beam.showing && beam.idle, JSON.stringify(beam));
await page.screenshot({ path: 'artifacts/bar-beam.png' });
// Lowered to rest: no beam.
await send('set_transform', { device: 'hand-right', position: { x: -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
await frames(30);
const rest = await page.evaluate(() => window.__cafe.game.rays.showing('right'));
check('a hand lowered to rest shows no beam', !rest, `showing ${rest}`);

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : `${results.length}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
