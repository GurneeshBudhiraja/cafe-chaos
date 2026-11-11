/**
 * A sheet of every face the guest models can make: five pairs of eyes
 * across, five mouths down, on one guest each (desktop preview, no
 * headset), for choosing which face goes with which feeling; and a
 * second sheet of the faces a held guest shows, each as the game makes
 * it (guests/expressions.ts).
 *
 * Usage: dev server running, then `node scripts/look-faces.mjs [mochi|onigiri|tofu]`.
 * Output: artifacts/faces.png, artifacts/held-faces.png.
 */

import { chromium } from 'playwright';
import { APP_URL } from './lib/headset.mjs';

const species = process.argv[2] ?? 'mochi';
const browser = await chromium.launch({ args: ['--ignore-certificate-errors', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, ignoreHTTPSErrors: true });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(APP_URL);
await page.waitForFunction(() => window.__cafe?.system.pieces.length > 10, null, { timeout: 60000 });
await page.waitForTimeout(3000);
const labels = await page.evaluate(async (species) => {
  const { GuestActor, EYES, MOUTHS, castLoaded } = await import('/src/guests/actor.ts');
  const { world, system } = window.__cafe;
  const look = { species, tint: 0xffffff, outfit: [] };
  for (let i = 0; i < 100 && !castLoaded(look); i++) await new Promise((r) => setTimeout(r, 200));
  system.cafe.visible = false;
  const cam = world.camera;
  const actors = [];
  EYES.forEach((eyes, i) => MOUTHS.forEach((mouth, j) => {
    const a = new GuestActor(look);
    a.root.position.set((i - 2) * 0.085, 2 + (2 - j) * 0.085, 0);
    for (const m of a.materials) if (m.emissiveMap) m.emissiveIntensity = 1;
    world.scene.add(a.root);
    a.play('Lifted', 0);
    a.setFace({ eyes, mouth, lookX: 0, lookY: 0 });
    a.update(0);
    actors.push(a);
  }));
  window.__sheet = actors;
  cam.position.set(0, 2.03, 0.62);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 2.03, 0);
  cam.fov = 40;
  cam.updateProjectionMatrix();
  return { eyes: [...EYES], mouths: [...MOUTHS] };
}, species);
await page.waitForTimeout(3000);
await page.evaluate(({ eyes, mouths }) => {
  const c = document.createElement('canvas');
  c.width = innerWidth; c.height = innerHeight;
  c.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:99999';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const V = window.__cafe.world.camera.position.constructor;
  const px = (x, y) => { const v = new V(x, y, 0).project(window.__cafe.world.camera); return [(v.x + 1) / 2 * c.width, (1 - v.y) / 2 * c.height]; };
  ctx.font = '13px monospace'; ctx.fillStyle = '#fff';
  eyes.forEach((e, i) => { const [x, y] = px((i - 2) * 0.085, 2 + 2.9 * 0.085); ctx.fillText(e, x - 30, y); });
  mouths.forEach((m, j) => { const [x, y] = px(-2.75 * 0.085, 2 + (2 - j) * 0.085 + 0.03); ctx.fillText(m, x - 40, y); });
}, labels);
await page.screenshot({ path: 'artifacts/faces.png' });
console.log('artifacts/faces.png');

// A second sheet: the faces a held guest shows (guests/expressions.ts), each as the game makes it.
const moods = await page.evaluate(async (species) => {
  const { GuestActor } = await import('/src/guests/actor.ts');
  const { HeldAct } = await import('/src/guests/expressions.ts');
  const { world } = window.__cafe;
  for (const a of window.__sheet) a.root.visible = false;
  document.querySelector('canvas[style*="z-index:99999"], canvas[style*="z-index: 99999"]')?.remove();
  // What each is told: how far from the player's head, how much patience is left, and where the seat below is.
  const CASES = [
    ['surprised', 0.3, { distance: 0.5, patience: 1, lookX: 0, lookY: -1 }],
    ['calm', 2.3, { distance: 0.5, patience: 0.9, lookX: 0.3, lookY: -0.95 }],
    ['uneasy', 2.3, { distance: 0.5, patience: 0.4, lookX: 0.3, lookY: -0.95 }],
    ['worried', 2.3, { distance: 0.5, patience: 0.15, lookX: 0.3, lookY: -0.95 }],
    ['puzzled', 2.3, { distance: 0.15, patience: 0.9, lookX: 0.3, lookY: -0.95 }],
  ];
  CASES.forEach(([name, seconds, held], i) => {
    const a = new GuestActor({ species, tint: 0xffffff, outfit: [] });
    for (const m of a.materials) if (m.emissiveMap) m.emissiveIntensity = 1;
    const act = new HeldAct(() => 1);
    let acting = act.acting;
    for (let t = 0; t < seconds; t += 0.1) acting = act.update(0.1, held);
    a.play('Lifted', 0);
    a.setFace(acting.face);
    a.update(0);
    a.root.position.set((i - 2) * 0.1, 2, 0);
    a.root.rotation.set(acting.pitch, 0, acting.roll);
    world.scene.add(a.root);
    if (acting.mood !== name) throw new Error(`expected ${name}, got ${acting.mood}`);
  });
  const cam = world.camera;
  cam.position.set(0, 2.035, 0.42);
  cam.lookAt(0, 2.035, 0);
  cam.updateProjectionMatrix();
  return CASES.map((c) => c[0]);
}, species);
await page.waitForTimeout(3000);
await page.evaluate((moods) => {
  const c = document.createElement('canvas');
  c.width = innerWidth; c.height = innerHeight;
  c.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:99999';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const V = window.__cafe.world.camera.position.constructor;
  ctx.font = '20px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  moods.forEach((m, i) => { const v = new V((i - 2) * 0.1, 1.985, 0).project(window.__cafe.world.camera); ctx.fillText(m, (v.x + 1) / 2 * c.width, (1 - v.y) / 2 * c.height); });
}, moods);
await page.screenshot({ path: 'artifacts/held-faces.png', clip: { x: 0, y: 300, width: 1100, height: 400 } });
console.log('artifacts/held-faces.png');
await browser.close();
