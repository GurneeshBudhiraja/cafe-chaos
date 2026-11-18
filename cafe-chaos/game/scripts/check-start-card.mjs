/**
 * Start card check (the café row and the corner buttons), with the hand ray
 * and a pinch, as on Quest 3:
 * 1. everything on the card is inside its outer box, and the café row's
 *    buttons inside its window;
 * 2. Settings, Quit and How to play open their cards (and close again);
 *    with Settings open, the start card behind it is hidden;
 * 3. two cafés fit the window: no arrows, the row centred;
 * 4. a pinch dragged along the row moves nothing and starts no café;
 * 5. the row holds the cafés only (no Coming Soon card);
 * 6. a pinch on a café's card (no drag) starts that café.
 * Shots: artifacts/start-card-after.png (the card, flat), -scrolled.png,
 * and -view.png (the headset view).
 *
 * Usage: dev server running, then `node scripts/check-start-card.mjs`.
 * CAFE=canada picks the Canadian café in step 6 (default japan).
 */
import { writeFileSync } from 'node:fs';

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const CAFE = process.env.CAFE ?? 'japan';
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, { x: -1.85, y: 1.22, z: 0.28 });
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 30000 });
  },
});
const { page } = h;
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
await until(() => window.__cafe.game.phase === 'title' && window.__cafe.game.menu.card.open);
await page.waitForTimeout(1200);
const shot = async (name) => {
  const data = await page.evaluate(() => window.__cafe.game.menu.card.canvas.toDataURL('image/png'));
  writeFileSync(`artifacts/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
};
await shot('start-card-after');
await page.screenshot({ path: 'artifacts/start-card-after-view.png' });

// 1. Inside the box.
const box = await page.evaluate(() => {
  const m = window.__cafe.game.menu;
  const c = m.card;
  const k = c.width / 960;
  const live = c.buttons.filter((b) => b.w > 0);
  const out = live.filter((b) => b.x < 24 * k || b.x + b.w > c.width - 24 * k || b.y < 24 * k || b.y + b.h > c.height - 24 * k).map((b) => b.id);
  const row = live.filter((b) => b.id.startsWith('play-') || b.id.startsWith('new-') || b.id.startsWith('buy-'));
  const outRow = row.filter((b) => b.x < 52 * k - 0.5 || b.x + b.w > 908 * k + 0.5).map((b) => b.id);
  return { ids: live.map((b) => b.id), out, outRow };
});
check('everything inside the outer box, the row inside its window', box.out.length === 0 && box.outRow.length === 0, JSON.stringify(box));

const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const REST = [SEAT.x - 0.25, SEAT.y - 0.35, SEAT.z - 0.15];
/** Point the right hand's ray at a spot on a card (canvas pixels), and say what it lights. */
const aimPx = async (which, px, py) => {
  const target = await page.evaluate(([which, px, py]) => {
    const p = window.__cafe.game.menu[which];
    const g = p.mesh.geometry.parameters;
    const V = p.mesh.position.constructor;
    return p.mesh.localToWorld(new V((px / p.width - 0.5) * g.width, (0.5 - py / p.height) * g.height, 0)).toArray();
  }, [which, px, py]);
  const d = target.map((v, i) => v - REST[i]);
  const len = Math.hypot(...d);
  const n = d.map((v) => v / len);
  const ax = [0, 0, -1];
  const dot = ax[0] * n[0] + ax[1] * n[1] + ax[2] * n[2];
  const cr = [ax[1] * n[2] - ax[2] * n[1], ax[2] * n[0] - ax[0] * n[2], ax[0] * n[1] - ax[1] * n[0]];
  const w = 1 + dot;
  const ql = Math.hypot(cr[0], cr[1], cr[2], w);
  await send('set_transform', { device: 'hand-right', position: { x: REST[0], y: REST[1], z: REST[2] }, orientation: { x: cr[0] / ql, y: cr[1] / ql, z: cr[2] / ql, w: w / ql } });
  await frames(6);
  return page.evaluate(() => window.__cafe.game.aim.right);
};
const centre = (which, id) => page.evaluate(([which, id]) => {
  const b = window.__cafe.game.menu[which].buttons.find((x) => x.id === id);
  return b && b.w > 0 ? [b.x + b.w / 2, b.y + b.h / 2] : null;
}, [which, id]);
const aimAt = async (which, id) => {
  const c = await centre(which, id);
  return c ? aimPx(which, c[0], c[1]) : `(${id} not shown)`;
};
const pinch = (v) => send('set_select_value', { device: 'hand-right', value: v });
const tap = async () => {
  await pinch(1);
  await frames(4);
  await pinch(0);
  await frames(4);
};
const state = () => page.evaluate(() => {
  const g = window.__cafe.game;
  return { phase: g.phase, sheet: g.menu.sheetKind, how: g.menu.how.open, scroll: Math.round(g.menu.scroll), cardDim: g.menu.card.dimmed, pending: g.pending?.id ?? null };
});

// 2. The corner buttons.
const litGear = await aimAt('card', 'gear');
await tap();
const gear = (await state()).sheet;
await page.waitForTimeout(600);
// Only the card in front is seen: the start card behind fades out altogether (the owner's Quest playtest).
const behind = await page.evaluate(() => ({ card: window.__cafe.game.menu.card.mesh.visible, sheet: window.__cafe.game.menu.sheet.mesh.visible }));
await shot('start-card-settings');
await aimAt('sheet', 'close');
await tap();
await page.waitForTimeout(600);
const back = await page.evaluate(() => window.__cafe.game.menu.card.mesh.visible);
check('Settings (top right) opens Settings, CLOSE closes it', litGear === 'gear' && gear === 'settings' && (await state()).sheet === 'none', JSON.stringify({ litGear, gear }));
check('with Settings open the start card behind is hidden (only the card in front is seen), and back after CLOSE', !behind.card && behind.sheet && back, JSON.stringify({ behind, back }));

const litQuit = await aimAt('card', 'quit');
await tap();
const quit = (await state()).sheet;
await page.waitForTimeout(400);
await aimAt('sheet', 'quit-no');
await tap();
await page.waitForTimeout(400);
check('Quit (top left) asks first, KEEP PLAYING goes back', litQuit === 'quit' && quit === 'quit' && (await state()).sheet === 'none', JSON.stringify({ litQuit, quit }));

const litHelp = await aimAt('card', 'help');
await tap();
await page.waitForTimeout(600);
const help = await state();
await aimAt('how', 'back');
await tap();
await until(() => window.__cafe.game.menu.card.open && !window.__cafe.game.menu.how.open, null, 8000);
await page.waitForTimeout(800);
check('How to play (beside Settings) opens How to play, ✕ comes back', litHelp === 'help' && help.how, JSON.stringify({ litHelp, help }));

// 3. Two cafés fit the window: no arrows, and the row centred in it (the owner's playtest: no café-to-come card).
const row = await page.evaluate(() => {
  const c = window.__cafe.game.menu.card;
  const k = c.width / 960;
  const b = (id) => c.buttons.find((x) => x.id === id);
  const jp = b('play-japan');
  const ca = b('play-canada');
  return { arrows: [b('carousel-prev')?.w ?? 0, b('carousel-next')?.w ?? 0], left: +(jp.x / k - 52).toFixed(1), right: +(908 - (ca.x + ca.w) / k).toFixed(1), plays: c.buttons.filter((x) => x.id.startsWith('play-')).map((x) => x.id) };
});
check('two cafés fit: no arrows, the row centred in its window', row.arrows.every((w) => w === 0) && Math.abs(row.left - row.right) < 2, JSON.stringify(row));

// 4. A pinch dragged along the row: it does not scroll (there is nowhere to go) and starts no café.
const k = await page.evaluate(() => window.__cafe.game.menu.card.width / 960);
const y = 360 * k;
await aimPx('card', 600 * k, y);
await pinch(1);
await frames(3);
for (let x = 600; x >= 300; x -= 50) {
  await aimPx('card', x * k, y);
}
await pinch(0);
await frames(4);
await page.waitForTimeout(900);
const dragged = await state();
check('a pinch dragged along the row moves nothing and starts no café', dragged.scroll === 0 && dragged.phase === 'title' && !dragged.pending, JSON.stringify(dragged));

// 5. Only the cafés are in the row: no café-to-come card.
check('the row holds the two cafés only (no Coming Soon)', row.plays.join() === 'play-japan,play-canada' || row.plays.join() === 'play-canada,play-japan', row.plays.join());

// 6: pinch a café's card.
const litCafe = await aimAt('card', `play-${CAFE}`);
await tap();
const started = await until((c) => window.__cafe.game.phase !== 'title' || window.__cafe.game.pending?.id === c || window.__cafe.cafe?.id === c, CAFE, 20000);
const after = await state();
check(`a pinch on the ${CAFE} card starts that café`, litCafe === `play-${CAFE}` && started, JSON.stringify({ litCafe, after }));

console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
if (h.errors.length) console.log('page errors:', h.errors.filter((e) => !/IBL|hdr/.test(e)).slice(0, 5));
process.exit(results.every((r) => r.ok) ? 0 : 1);
