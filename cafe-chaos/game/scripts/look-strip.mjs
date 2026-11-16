/**
 * A look at the scoreboard strip (at eye level over the café), from the seat, and
 * close up, at full, middling and low happiness; and a few frames of a
 * segment draining when a guest leaves unhappy.
 * Usage: dev server running, then `node scripts/look-strip.mjs`.
 * Output: artifacts/strip-*.png.
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
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
await page.evaluate(() => {
  const { game, guests } = window.__cafe;
  game.click('open');
  game.click('skip');
  guests.patienceFrozen = true;
  guests.spawnSeconds = [0.6, 1.2];
});
// A café with some guests about.
await page.waitForFunction(() => window.__cafe.guests.line.length >= 3, null, { timeout: 180000 });
const set = (happy, bank, clock) => page.evaluate(([happy, bank, clock]) => { const { score, game } = window.__cafe; score.happiness = happy; score.bank = bank; game.clock = clock; window.__cafe.strip.settle(); }, [happy, bank, clock]);
const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
const at = await page.evaluate(() => window.__cafe.strip.panel.mesh.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
const info = await page.evaluate(() => { const { strip, world, system } = window.__cafe; const V = system.cafe.position.constructor; return { fromEyes: +strip.panel.mesh.getWorldPosition(new V()).distanceTo(world.player.head.getWorldPosition(new V())).toFixed(3) }; });
console.log('strip', JSON.stringify(info));
for (const [name, happy, bank, clock] of [['full', 100, 0, 12], ['mid', 70, 46, 222], ['low', 20, 154, 318]]) {
  await set(happy, bank, clock);
  await h.head(SEAT, LOOK, 200);
  await frames(4);
  await h.screenshot(`artifacts/strip-${name}-seat.png`);
  // Looking a little up from the café, at the strip, as a player glances at it.
  const mid = await page.evaluate(() => window.__cafe.strip.panel.mesh.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
  await h.head(SEAT, P([mid[0], mid[1] - 0.12, mid[2]]), 200);
  await frames(4);
  await h.screenshot(`artifacts/strip-${name}-glance.png`);
  await h.head(P([mid[0] + 0.28, mid[1], mid[2] + 0.02]), P(mid), 200);
  await frames(4);
  await h.screenshot(`artifacts/strip-${name}-close.png`);
}
// A guest leaves unhappy: 70 -> 62 (one segment drains), and coins come in.
await set(70, 46, 222);
await frames(3);
await page.evaluate(() => { window.__cafe.score.happiness = 62; window.__cafe.score.bank = 58; });
for (let i = 0; i < 4; i++) { await frames(1); await h.screenshot(`artifacts/strip-drain-${i}.png`); }
const errors = await h.finish();
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no console errors');
process.exit(0);
