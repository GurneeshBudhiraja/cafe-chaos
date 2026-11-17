/**
 * Flicker check (lib/decal.ts): the café crowded (every table open, every
 * seat taken and served, the line full, messes about), and what makes a
 * crowded café flicker on the headset is measured:
 *  1. the camera's near plane is 3 cm (it was 5 mm, which made the depth
 *     test about ten times coarser at the café's distance);
 *  2. everything laid flat on another surface wins the depth test against
 *     it: each guest's shadow blob is lifted 2 mm off the floor and its
 *     material counted nearer (polygonOffset); each mess rests on its table
 *     top (its lowest point above it) with its own materials counted
 *     nearer; the seat glow's discs too;
 *  3. how much a crowded café costs to draw against an empty one (draw
 *     calls and triangles), reported;
 *  4. no console errors.
 * Usage: dev server running, then `node scripts/check-flicker.mjs`.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => { localStorage.removeItem('cafe-chaos/save/v3'); window.__cafe.system.replace(); });
    await h.page.waitForFunction(() => window.__cafe?.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 60000) => page.waitForFunction(fn, null, { timeout, polling: 100 }).then(() => true, () => false);
for (const k of ['left', 'right']) await page.evaluate((k) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }), k);
await page.evaluate(() => { const g = window.__cafe.game; g.save.tips = ['goal', 'table', 'shop', 'dirty', 'hurry', 'pair']; g.save.tutorialDone = true; g.click('open'); });
await until(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving);
await page.evaluate(() => window.__cafe.game.click('skip'));
await until(() => window.__cafe.game.phase === 'run');
await page.waitForTimeout(1500);
const cost = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => { const i = window.__cafe.world.renderer.info.render; ok({ calls: i.calls, triangles: i.triangles }); }))));
const empty = await cost();

// 1. The near plane.
const near = await page.evaluate(() => window.__cafe.world.camera.near);
check('the camera\'s near plane is 3 cm (not 5 mm: the depth test six times finer at the café)', near >= 0.03, `near ${near} m`);

// The café crowded: every table open, every seat taken (and served), the line full.
await page.evaluate(() => {
  const { guests, shop, system, game } = window.__cafe;
  guests.arrivals = false;
  guests.patienceFrozen = true;
  guests.mealSeconds = 1e6;
  shop.restore(2, system.tables.filter((i) => i < 13), true);
  game.applyLocks();
  guests.queueCap = 4;
  for (const seat of guests.seats) {
    if (seat.occupant !== 0 || seat.locked) continue;
    const g = guests.spawn();
    g.wishes = [];
    guests.seatGuest(g.id, seat.index);
  }
  guests.arrivals = true;
  guests.spawnSeconds = [0.5, 0.8];
});
await until(() => window.__cafe.guests.guests.filter((g) => g.state === 'seated').length >= 18, 120000);
await until(() => window.__cafe.guests.line.length >= 4, 60000);
await page.waitForTimeout(8000);
const crowded = await page.evaluate(() => ({ seated: window.__cafe.guests.guests.filter((g) => g.state === 'seated').length, line: window.__cafe.guests.line.length, served: window.__cafe.baristas.servedCount }));
// Some places dirty too (one at each of three tables whose other seat is still taken).
await page.evaluate(() => {
  const { guests, mess } = window.__cafe;
  for (const t of [1, 4, 9]) {
    const at = guests.seats.filter((s) => s.table === t);
    const g = guests.guests.find((x) => x.seat === at[0] && x.state === 'seated');
    if (g) { g.patience = 0; }
    mess.soilSeat(at[0]);
  }
});
await page.waitForTimeout(1500);
const full = await cost();

// 2. Laid on, never fighting what is under it.
const laid = await page.evaluate(() => {
  const { guests, mess, system } = window.__cafe;
  const blobs = system.cafe.getObjectByName('GuestBlobs');
  const V = system.cafe.position.constructor;
  // The blobs' height over the floor under them (café space), from their instance matrices.
  const m = new blobs.matrix.constructor();
  const p = new V();
  let lowest = Infinity;
  for (let i = 0; i < blobs.count; i++) {
    blobs.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    const ground = system.nav.heightAt(p.x, p.z);
    lowest = Math.min(lowest, p.y - ground);
  }
  // The messes: lowest point against their table's top, and their materials offset.
  const messes = system.cafe.children.filter((c) => c.name === 'table-mess');
  const tops = [];
  let offset = true;
  for (const model of messes) {
    model.updateMatrixWorld(true);
    let min = Infinity;
    model.traverse((n) => {
      if (!n.isMesh) return;
      if (!n.material.polygonOffset) offset = false;
      const pos = n.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld);
        min = Math.min(min, system.cafe.worldToLocal(p).y);
      }
    });
    const seat = guests.seats.find((s) => s.meal && Math.hypot(s.meal.x - model.position.x, s.meal.z - model.position.z) < 0.001);
    if (seat) tops.push(+((min - seat.meal.y) * 1000).toFixed(2));
  }
  const glow = [];
  system.cafe.traverse((n) => { if (n.isMesh && n.material?.color?.getHex?.() === 0x9a86ff) glow.push(!!n.material.polygonOffset); });
  return { blobs: blobs.count, blobLift: +(lowest * 1000).toFixed(2), blobOffset: !!blobs.material.polygonOffset, messes: messes.length, messOverTopMm: tops, messOffset: offset, glowOffset: glow.length > 0 && glow.every(Boolean), glowParts: glow.length };
});
check('each guest\'s shadow blob is lifted off the floor (2 mm over the guest\'s ground; the walk grid\'s floor height differs by under a millimetre) and counted nearer', laid.blobs >= 8 && laid.blobLift >= 1 && laid.blobOffset, JSON.stringify({ blobs: laid.blobs, liftMm: laid.blobLift, offset: laid.blobOffset }));
check('each mess rests on its table top (its lowest point above it) with its materials counted nearer', laid.messes >= 3 && laid.messOverTopMm.length > 0 && laid.messOverTopMm.every((v) => v >= 0.5) && laid.messOffset, JSON.stringify({ messes: laid.messes, lowestOverTopMm: laid.messOverTopMm, offset: laid.messOffset }));
check('the seat glow\'s discs are counted nearer too', laid.glowOffset, JSON.stringify({ parts: laid.glowParts, offset: laid.glowOffset }));
await h.screenshot('artifacts/flicker-crowded.png');

// 3. What the crowd costs to draw.
console.log(`(a crowded café: ${crowded.seated} seated, ${crowded.line} in line; ${full.calls} draw calls and ${(full.triangles / 1000).toFixed(0)}k triangles a frame, against ${empty.calls} and ${(empty.triangles / 1000).toFixed(0)}k empty)`);

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
