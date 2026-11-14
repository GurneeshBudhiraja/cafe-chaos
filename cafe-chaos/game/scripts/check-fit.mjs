/**
 * Fitting the café to the player's table (from the seat):
 * 1. it lands on the detected table, squared to the table's near edge;
 * 2. all of it is on the table (its footprint's corners inside the table's outline);
 * 3. it is no larger than full size, and shrinks for a small table;
 * 4. its centre is a comfortable reach away (not right under the chin).
 * Usage: dev server running, then `node scripts/check-fit.mjs`.
 * Output: PASS/FAIL lines; artifacts/fit-seat.png.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 60000 });
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const read = () => page.evaluate(() => {
  const { system } = window.__cafe;
  const c = system.cafe;
  const surface = system.chosen.surface;
  if (!surface) return { onDesk: system.onDesk };
  const o = surface.object;
  const poly = surface.plane.polygon.map((p) => o.localToWorld(new c.position.constructor(p.x, 0, p.z)));
  // Edges' directions (world), and the café's across-direction.
  const across = Math.atan2(Math.cos(c.rotation.y), -Math.sin(c.rotation.y));
  const squared = Math.min(...poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; const e = Math.atan2(b.z - a.z, b.x - a.x); let d = Math.abs(((e - across) % Math.PI + Math.PI) % Math.PI); return Math.min(d, Math.PI - d); })) * 180 / Math.PI;
  const f = system.footprint;
  const s = c.scale.x;
  const inside = (x, z) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) ins = !ins; } return ins; };
  const corners = [[f.minX, f.minZ], [f.maxX, f.minZ], [f.maxX, f.maxZ], [f.minX, f.maxZ]].map(([x, z]) => c.localToWorld(new c.position.constructor(x, 0, z)));
  const head = window.__cafe.world.camera.getWorldPosition(new c.position.constructor());
  return { onDesk: system.onDesk, scale: +s.toFixed(2), squaredDeg: +squared.toFixed(1), allOn: corners.every((p) => inside(p.x, p.z)), reach: +Math.hypot(c.position.x - head.x, c.position.z - head.z).toFixed(2), table: poly.map((p) => [+p.x.toFixed(2), +p.z.toFixed(2)]) };
});
let s = await read();
check('it lands on the table, squared to the table\'s near edge', s.onDesk && s.squaredDeg < 2, JSON.stringify(s));
check('all of it is on the table, no larger than full size', s.allOn && s.scale <= 1, JSON.stringify(s));
check('its centre is a comfortable reach away', s.reach >= 0.4 && s.reach <= 0.9, `reach ${s.reach} m`);
await h.screenshot('artifacts/fit-seat.png');
// A small table: shrink the detected table to 60 x 45 cm about its middle, and place again.
await page.evaluate(() => {
  const { system } = window.__cafe;
  const plane = system.chosen.surface.plane;
  const P = plane.polygon;
  const cx = P.reduce((a, p) => a + p.x, 0) / P.length, cz = P.reduce((a, p) => a + p.z, 0) / P.length;
  const small = [[-0.3, -0.225], [0.3, -0.225], [0.3, 0.225], [-0.3, 0.225]].map(([x, z]) => new DOMPointReadOnly(cx + x, 0, cz + z));
  Object.defineProperty(plane, 'polygon', { get: () => small, configurable: true });
  system.replace();
});
await page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 60000 });
s = await read();
check('on a small table it shrinks to fit, all of it on the table', s.onDesk && s.allOn && s.scale < 1 && s.scale >= 0.45, JSON.stringify(s));
await h.screenshot('artifacts/fit-small.png');
const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
