/**
 * A plan view of the café for laying out paths: looks straight down on
 * it (desktop preview, no headset) with a 5 cm grid in the café's own
 * space, marks the seat anchors, the gate and any extra points given,
 * and prints the anchors' positions.
 *
 * Usage: dev server running, then `node scripts/look-top.mjs`.
 * Output: artifacts/top.png.
 */

import { chromium } from 'playwright';
import { APP_URL } from './lib/headset.mjs';

const browser = await chromium.launch({ args: ['--ignore-certificate-errors', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, ignoreHTTPSErrors: true });
await page.goto(APP_URL);
await page.waitForFunction(() => window.__cafe?.system.pieces.length > 10, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const { world, system } = window.__cafe;
  const THREE = { V: world.camera.position.constructor };
  const cafe = system.cafe;
  cafe.position.set(0, 0, 0);
  cafe.rotation.set(0, 0, 0);
  cafe.updateMatrixWorld(true);
  const cam = world.camera;
  cam.position.set(0, 1.25, 0.0001);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  cam.fov = 40;
  cam.updateProjectionMatrix();
  window.__top = true;
  const seats = system.seats.map((s) => {
    const p = cafe.worldToLocal(s.getWorldPosition(new THREE.V()));
    const f = s.getWorldDirection(new THREE.V());
    return { name: `${s.parent?.name ?? ''}/${s.name}`, at: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)], facing: [+f.x.toFixed(2), +f.z.toFixed(2)] };
  });
  const named = {};
  for (const n of ['Entrance', 'BenchSpot']) {
    const o = cafe.getObjectByName(n);
    if (o) named[n] = cafe.worldToLocal(o.getWorldPosition(new THREE.V())).toArray().map((v) => +v.toFixed(3));
  }
  return { seats, named };
});
console.log(JSON.stringify(info.named));
for (const s of info.seats) console.log(s.name, JSON.stringify(s.at), 'faces', JSON.stringify(s.facing));
await page.waitForTimeout(2500);
// Overlay: a grid in café space, drawn over the screenshot by projecting through the camera.
await page.evaluate((seats) => {
  const { world } = window.__cafe;
  const V = world.camera.position.constructor;
  const c = document.createElement('canvas');
  c.width = innerWidth; c.height = innerHeight;
  c.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:99999';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const px = (x, z, y = 0.03) => { const v = new V(x, y, z).project(world.camera); return [(v.x + 1) / 2 * c.width, (1 - v.y) / 2 * c.height]; };
  ctx.lineWidth = 1; ctx.font = '11px monospace';
  for (let x = -0.7; x <= 0.701; x += 0.05) { ctx.strokeStyle = Math.abs(x) < 1e-6 ? '#f00' : Math.abs((x * 10) % 1) < 1e-6 ? 'rgba(0,255,255,0.7)' : 'rgba(0,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(...px(x, -0.45)); ctx.lineTo(...px(x, 0.5)); ctx.stroke(); if (Math.abs(Math.round(x * 10) - x * 10) < 1e-6) { ctx.fillStyle = '#0ff'; ctx.fillText(x.toFixed(1), px(x, 0.5)[0] - 10, px(x, 0.5)[1] + 12); } }
  for (let z = -0.45; z <= 0.501; z += 0.05) { ctx.strokeStyle = Math.abs(z) < 1e-6 ? '#f00' : Math.abs(Math.round(z * 10) - z * 10) < 1e-6 ? 'rgba(0,255,255,0.7)' : 'rgba(0,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(...px(-0.7, z)); ctx.lineTo(...px(0.7, z)); ctx.stroke(); if (Math.abs(Math.round(z * 10) - z * 10) < 1e-6) { ctx.fillStyle = '#0ff'; ctx.fillText('z' + z.toFixed(1), px(-0.7, z)[0] - 34, px(-0.7, z)[1] + 4); } }
  ctx.fillStyle = '#ff0';
  for (const s of seats) { const [x, y] = px(s.at[0], s.at[2], s.at[1]); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
}, info.seats);
await page.screenshot({ path: 'artifacts/top.png', timeout: 180000 });
await browser.close();
