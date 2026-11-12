/**
 * A look at the side board from the seat, and a real fingertip press on it.
 * - from the seat looking at the café: is the board in view, and how big?
 * - looking at the board: saving up, then able to hire;
 * - the index fingertip pushed through the Hire button hires a server, and
 *   through Pause pauses; a finger held through the face presses once.
 * Usage: dev server running, then `node scripts/look-board.mjs`.
 * Output: artifacts/board-*.png, and what it measured.
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
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const Q = { x: 0, y: 0, z: 0, w: 1 };
const handTo = (p) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);

// Where the index fingertip sits relative to the emulated hand.
const AWAY = [-0.9, 1.0, 0.6];
await handTo(AWAY);
await frames(4);
const tipOffset = (await page.evaluate(() => window.__cafe.hold.tip.right.point.toArray())).map((v, i) => v - AWAY[i]);
const tipTo = (p) => handTo(p.map((v, i) => v - tipOffset[i]));

await page.evaluate(() => { window.__cafe.game.click('open'); window.__cafe.game.click('skip'); });
await frames(6);
const info = await page.evaluate(() => {
  const { board, world, system } = window.__cafe;
  const V = system.cafe.position.constructor;
  const centre = board.panel.mesh.getWorldPosition(new V());
  const head = world.player.head.getWorldPosition(new V());
  const cafe = system.cafe.getWorldPosition(new V());
  const toBoard = centre.clone().sub(head);
  const toCafe = cafe.clone().sub(head);
  const b = window.__cafe.hold.bounds;
  return { cafeBounds: [b.min.x, b.max.x, b.min.z, b.max.z].map((v) => +v.toFixed(2)), scale: system.cafe.scale.x, boardAt: centre.toArray().map((v) => +v.toFixed(3)), fromEyes: +toBoard.length().toFixed(3), fromCafeCentre: +centre.distanceTo(cafe).toFixed(3), degreesOffTheCafe: +((toBoard.angleTo(toCafe) * 180) / Math.PI).toFixed(1) };
});
console.log('board', JSON.stringify(info));
await h.screenshot('artifacts/board-1-from-seat.png');

// Looking at the board.
const B = info.boardAt;
await h.head(SEAT, { x: B[0], y: B[1], z: B[2] }, 300);
await h.pause(400);
await h.screenshot('artifacts/board-2-saving.png');
await page.evaluate(() => (window.__cafe.score.bank = 75));
await frames(3);
await h.screenshot('artifacts/board-3-can-hire.png');

/** World position on a board button's face, `out` metres in front of it. */
const buttonAt = (id, out) => page.evaluate(([id, out]) => {
  const p = window.__cafe.board.panel;
  const b = p.buttons.find((x) => x.id === id);
  const g = p.mesh.geometry.parameters;
  const V = p.mesh.position.constructor;
  const s = p.mesh.getWorldScale(new V()).z;
  return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, out / s)).toArray();
}, [id, out]);
const state = () => page.evaluate(() => ({ staff: window.__cafe.shop.staff, bank: window.__cafe.score.bank, phase: window.__cafe.game.phase, hover: window.__cafe.board.panel.hover, purchases: window.__cafe.shop.purchases, refused: window.__cafe.shop.refused }));

// The fingertip comes near Hire (it lights), pushes through (one hire), stays through (no second), and draws back.
await tipTo(await buttonAt('hire', 0.03));
await frames(3);
const near = await state();
await h.screenshot('artifacts/board-4-finger-near.png');
await tipTo(await buttonAt('hire', -0.004));
await frames(3);
const pushed = await state();
await frames(4);
const held = await state();
await tipTo(await buttonAt('hire', 0.05));
await frames(3);
// Pause, the same way.
await tipTo(await buttonAt('pause', 0.03));
await frames(3);
await tipTo(await buttonAt('pause', -0.004));
await frames(3);
const paused = await state();
await h.screenshot('artifacts/board-5-paused.png');
const ok = (name, pass, detail) => console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
ok('a fingertip near Hire lights it', near.hover === 'hire' && near.staff === 1, JSON.stringify(near));
ok('pushing through hires one server and spends the price', pushed.staff === 2 && pushed.bank === 15 && pushed.purchases === 1, JSON.stringify(pushed));
ok('a finger held through the face presses only once', held.staff === 2 && held.purchases === 1 && held.refused === 0, JSON.stringify(held));
ok('a fingertip through Pause pauses the run', paused.phase === 'paused', JSON.stringify(paused));
const errors = await h.finish();
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no console errors');
process.exit(0);
