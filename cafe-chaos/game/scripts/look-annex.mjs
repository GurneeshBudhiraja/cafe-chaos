/**
 * The left side before and after the annex opens, in plan view (desktop
 * preview, no headset): the exit in the left wall, the way a guest who has
 * eaten takes out of the café (drawn in magenta), and the seats (yellow);
 * then the annex is opened, it rises, and the same again. Prints the seat
 * counts, the ways out and how long the grid took to read again.
 *
 * Usage: dev server running, then `node scripts/look-annex.mjs`.
 * Output: artifacts/annex-before.png, artifacts/annex-plaque.png, artifacts/annex-after.png.
 */

import { chromium } from 'playwright';
import { APP_URL } from './lib/headset.mjs';

const browser = await chromium.launch({ args: ['--ignore-certificate-errors', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, ignoreHTTPSErrors: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(APP_URL);
await page.waitForFunction(() => window.__cafe?.system.pieces.length > 10 && window.__cafe.guests.seats.length > 0, null, { timeout: 90000 });
await page.waitForTimeout(1500);

/** Look straight down; report the state; draw the seats and the ways out. */
async function shot(file) {
  const info = await page.evaluate(() => {
    const { world, system, guests } = window.__cafe;
    const V = world.camera.position.constructor;
    const cafe = system.cafe;
    cafe.position.set(0, 0, 0);
    cafe.rotation.set(0, 0, 0);
    cafe.scale.setScalar(1);
    cafe.updateMatrixWorld(true);
    const cam = world.camera;
    cam.position.set(-0.12, 1.3, 0.0001);
    cam.up.set(0, 0, -1);
    cam.lookAt(-0.12, 0, 0);
    cam.fov = 44;
    cam.updateProjectionMatrix();
    const shown = (n) => cafe.getObjectByName(n)?.visible ?? null;
    // The way out from three seats: front row middle, back row left, the right end.
    const nav = system.nav;
    const lanes = system.annexOpen ? [[-0.672, 0.115]] : [[-0.452, 0.004]];
    const from = [guests.seats[0], guests.seats[Math.floor(guests.seats.length / 2)], guests.seats[guests.seats.length - 1]];
    const ways = from.map((s) => {
      const p = nav.findPath(s.position, new V(lanes[0][0], nav.heightAt(lanes[0][0], lanes[0][1]), lanes[0][1]));
      return p ? p.map((q) => [q.x, q.y, q.z]) : null;
    });
    return {
      walls: { closed: shown('WallLeft-Closed'), open: shown('WallLeft-Open'), gardenLeft: shown('GardenLeft') },
      annex: !!system.annex, annexOpen: system.annexOpen, seats: guests.seats.length, furniture: system.furniture,
      navMs: nav.buildMs, ways: ways.map((w) => (w ? `${w.length} points, ends at x ${w[w.length - 1][0].toFixed(3)}` : 'NO WAY')),
      waysDrawn: ways, seatsDrawn: guests.seats.map((s) => [s.position.x, s.position.y, s.position.z]),
    };
  });
  await page.waitForTimeout(2500);
  await page.evaluate(({ waysDrawn, seatsDrawn }) => {
    document.getElementById('overlay')?.remove();
    const { world } = window.__cafe;
    const V = world.camera.position.constructor;
    const c = document.createElement('canvas');
    c.id = 'overlay';
    c.width = innerWidth; c.height = innerHeight;
    c.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:99999';
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    const px = (p) => { const v = new V(p[0], p[1], p[2]).project(world.camera); return [(v.x + 1) / 2 * c.width, (1 - v.y) / 2 * c.height]; };
    ctx.fillStyle = '#ff0';
    for (const s of seatsDrawn) { const [x, y] = px(s); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#f0f'; ctx.lineWidth = 2;
    for (const w of waysDrawn) { if (!w) continue; ctx.beginPath(); w.forEach((p, i) => (i ? ctx.lineTo(...px(p)) : ctx.moveTo(...px(p)))); ctx.stroke(); }
  }, info);
  await page.screenshot({ path: file, timeout: 180000 });
  delete info.waysDrawn;
  delete info.seatsDrawn;
  console.log(file, JSON.stringify(info));
}

await shot('artifacts/annex-before.png');
// A close look at the plaque that extends the café, from the player's side.
await page.evaluate(() => {
  document.getElementById('overlay')?.remove();
  const { world, system } = window.__cafe;
  const V = world.camera.position.constructor;
  const p = system.cafe.getObjectByName('PlaqueSpot-1').getWorldPosition(new V());
  const cam = world.camera;
  cam.up.set(0, 1, 0);
  cam.position.set(p.x, p.y + 0.12, p.z + 0.1);
  cam.lookAt(p.x, p.y, p.z);
  cam.fov = 30;
  cam.updateProjectionMatrix();
});
await page.waitForTimeout(2500);
await page.screenshot({ path: 'artifacts/annex-plaque.png', timeout: 180000 });
// Press it, as a pinch on it would.
const opened = await page.evaluate(() => {
  const { unlocks } = window.__cafe;
  unlocks.press();
  return !!window.__cafe.system.annex;
});
console.log('pressed the plaque; the café is extending:', opened);
await page.waitForFunction(() => window.__cafe.system.annexOpen && window.__cafe.guests.seats.length > 23, null, { timeout: 120000 }).catch(() => console.log('annex did not finish opening'));
await shot('artifacts/annex-after.png');
console.log(errors.length ? `errors:\n${errors.slice(0, 5).join('\n')}` : 'no errors');
await browser.close();
