/**
 * A short video of the café's tidy front and the scoreboard, from the seat:
 * the pill and pause button together, a corner brightening as a hand comes
 * near, then the scoreboard as happiness drains from full to almost empty
 * (green, amber, red, and the slow pulse below 30%), and coins coming in.
 * Usage: dev server running, then `node scripts/record-front.mjs`.
 * Output: artifacts/front.mp4.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  record: 'front',
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
    await h.page.evaluate(() => { const { game, guests } = window.__cafe; game.click('open'); game.click('skip'); guests.arrivals = false; guests.clear(); });
    await h.page.evaluate(() => { for (const k of ['left', 'right']) window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }); });
    await h.page.waitForTimeout(1500);
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const handTo = (k, p) => send('set_transform', { device: `hand-${k}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: { x: 0, y: 0, z: 0, w: 1 } });

// 1. The café from the seat: the pill and the pause button, faint corners.
await h.pause(2500);
// 2. A hand comes to the front-left corner: it brightens; then away again.
const corner = await page.evaluate(() => window.__cafe.handles.brackets[1].group.getWorldPosition(window.__cafe.handles.pill.group.position.clone()).toArray());
const AWAY = [-1.4, 0.4, 0.9];
for (let i = 1; i <= 8; i++) {
  const t = i / 8;
  await handTo('left', AWAY.map((v, k) => v + ([corner[0] + 0.02, corner[1] + 0.06, corner[2] + 0.03][k] - v) * t));
  await h.pause(120);
}
await h.pause(1500);
await handTo('left', AWAY);
await h.pause(1200);
// 3. Up to the scoreboard.
const strip = await page.evaluate(() => window.__cafe.strip.panel.mesh.getWorldPosition(window.__cafe.strip.panel.mesh.position.clone()).toArray());
const AT = { x: strip[0], y: strip[1], z: strip[2] };
const NEAR = { x: strip[0] + 0.55, y: strip[1] - 0.02, z: strip[2] };
await h.head(NEAR, AT, 1500);
await h.pause(1200);
// 4. Happiness draining, a step at a time; coins come in along the way.
for (const v of [90, 80, 70, 60, 50, 40, 30, 20, 10]) {
  await page.evaluate((v) => { const { score } = window.__cafe; score.happiness = v; if (v % 30 === 0) score.bank += 15; }, v);
  await h.pause(v <= 30 ? 2200 : 1300);
}
await h.pause(1500);
// 5. Back to the seat.
await h.head(SEAT, LOOK, 1500);
await h.pause(2000);
const errors = await h.finish();
console.log(errors.length ? `errors: ${errors.slice(0, 3).join(' | ')}` : 'clean');
