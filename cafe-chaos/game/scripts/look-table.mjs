/**
 * The room matters: on a detected table, guests come from the table's real
 * edge. Reports whether the café is on a surface, how far the table runs
 * to the right of the usual arrival point, and where the next guest
 * appears; pictures from the seat as guests walk in across the table.
 * Usage: dev server running, then `node scripts/look-table.mjs`.
 * Output: artifacts/table-*.png.
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
const run = await page.evaluate(() => {
  const { system, guests, game } = window.__cafe;
  game.click('open');
  game.click('skip');
  guests.patienceFrozen = true;
  return { onDesk: system.onDesk, tableRunRight: +system.tableRun(0.525, 0.21, 1).toFixed(3), tableRunLeft: +system.tableRun(-0.5, 0, -1).toFixed(3), scale: system.cafe.scale.x };
});
console.log(JSON.stringify(run));
await page.waitForFunction(() => window.__cafe.guests.guests.length >= 1, null, { timeout: 120000 });
console.log(JSON.stringify(await page.evaluate(() => ({ arrival: window.__cafe.guests.arrival.toArray().map((v) => +v.toFixed(3)), fromEdge: +window.__cafe.guests.fromEdge.toFixed(3) }))));
await h.pause(1500);
await h.screenshot('artifacts/table-1-arriving.png');
await page.waitForFunction(() => window.__cafe.guests.guests.length >= 3, null, { timeout: 180000 });
await h.screenshot('artifacts/table-2-walking-in.png');
const errors = await h.finish();
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no console errors');
process.exit(0);
