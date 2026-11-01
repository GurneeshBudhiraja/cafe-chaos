/**
 * Local check for the tablet's edge glow (not part of the app): opens a note
 * on the classroom desk, then moves the right hand to rest, near each edge
 * and a corner, over the page and away again; holds the pen near the edge;
 * and sets the "grabbed" state that phase 2 will drive. Screenshots each step
 * and prints the glow's state.
 *
 * Usage: dev server running, then node scripts/check-edge-glow.mjs
 * Output: artifacts/edge-glow/*.png and a table.
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

// Screenshots only: drop the recorder's video, which needs Playwright's ffmpeg.
const launch = chromium.launch.bind(chromium);
chromium.launch = async (options) => {
  const browser = await launch(options);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = ({ recordVideo, ...rest } = {}) => newContext(rest);
  return browser;
};

const MACRO = process.env.MACRO === '1';
const OUT = MACRO ? 'artifacts/edge-glow-macro' : 'artifacts/edge-glow';
mkdirSync(OUT, { recursive: true });
const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const FACING_DEG = 90;
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
const CLASSROOM_ORIGIN = { x: -1.045, z: 0.28 };
/** The tablet's half size with its bezel (metres, tablet space). */
const HALF_W = 0.196;
const HALF_H = 0.151;

const rec = await startHeadsetRecording({
  size: { width: 1032, height: 800 },
  fovDeg: 96,
  captions: false,
  async prepare(r) {
    await r.page.evaluate(
      ([o, y, h]) => window.__metaNotes.demo.showClassroom(o, y, h),
      [CLASSROOM_ORIGIN, FACING_DEG, TABLE_HEIGHT_M],
    );
    await r.moveHead(SEAT);
    await r.moveHand(HAND_REST);
    await r.turnHead(FACING_DEG, 0, 100);
    await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
    await r.pause(800);
  },
});
const { page, pause } = rec;

/** Move the open right hand so its pinch point sits at (x, y, z) in tablet space. */
const pinchAt = (x, y, z) =>
  page.evaluate(
    async ([x, y, z]) => {
      const { world } = window.__metaNotes;
      const V = world.camera.position.constructor;
      const tablet = world.getSceneObject('tablet');
      const target = tablet.localToWorld(new V(x, y, z));
      for (let i = 0; i < 3; i++) {
        const offset = (await window.__rec.pinchPoint()).sub(await window.__rec.handPosition());
        await window.__rec.moveHandTo(target.clone().sub(offset), 250, window.__rec.grip);
        await new Promise((r) => setTimeout(r, 200));
      }
    },
    [x, y, z],
  );

const glowState = () =>
  page.evaluate(() => {
    const { world } = window.__metaNotes;
    const system = world.getSystems().find((s) => s.constructor.name === 'TabletEdgeSystem');
    const u = system?.material?.uniforms;
    if (!u) return { found: false };
    const f = u.uFocus.value.clone().applyMatrix4(system.ring.matrix);
    return {
      found: true,
      visible: system.ring.visible,
      near: +u.uNear.value.toFixed(3),
      grab: +u.uGrab.value.toFixed(3),
      focus: `${f.x.toFixed(3)}, ${f.y.toFixed(3)}`,
    };
  });

const results = [];
const shot = async (name, note = '') => {
  await pause(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  results.push({ name, note, ...(await glowState()) });
};

if (MACRO) await page.evaluate(() => (window.__macro = true));
await rec.tap('dock-new');
await pause(1600);
// Sit close and look down at the tablet, as at a desk.
const look = await page.evaluate(async () => {
  const { world } = window.__metaNotes;
  const V = world.camera.position.constructor;
  const tablet = world.getSceneObject('tablet');
  const centre = tablet.localToWorld(new V(0.03, 0, 0));
  const head = world.camera.getWorldPosition(new V());
  const toward = centre.clone().sub(head).setY(0).normalize();
  const [back, up] = window.__macro ? [0.12, 0.22] : [0.3, 0.42];
  const seat = centre.clone().addScaledVector(toward, -back).setY(centre.y + up);
  await window.__rec.moveHead({ x: seat.x, y: seat.y, z: seat.z });
  return { x: centre.x, y: centre.y, z: centre.z };
});
await rec.lookAt(look, 600);
// A relaxed hand pose, pointing down at the desk (the grip the checks keep).
await page.evaluate(async (t) => {
  await window.IWER_DEVICE.remote.dispatch('look_at', { device: 'hand-right', target: { x: t.x, y: t.y - 0.3, z: t.z } });
  window.__rec.grip = (await window.IWER_DEVICE.remote.dispatch('get_transform', { device: 'hand-right' })).orientation;
}, look);

await rec.moveHand(HAND_REST);
await shot('1-rest', 'hand at rest, far');
await pinchAt(HALF_W + 0.02, 0, 0.03);
await shot('2-near-right-edge', '2 cm out, 3 cm up from the right edge');
await pinchAt(-HALF_W - 0.02, -0.05, 0.02);
await shot('3-near-left-edge');
await pinchAt(0.08, HALF_H + 0.02, 0.02);
await shot('4-near-far-edge');
await pinchAt(-0.1, -HALF_H - 0.02, 0.02);
await shot('5-near-near-edge');
await pinchAt(HALF_W + 0.012, -HALF_H - 0.012, 0.02);
await shot('6-near-corner', 'just off the near-right corner');
await pinchAt(0.05, 0.02, 0.03);
await shot('7-over-page', 'over the page: writing, not grabbing');
await pinchAt(HALF_W + 0.2, 0, 0.15);
await shot('8-moved-away', 'faded out');
await pinchAt(HALF_W + 0.07, 0, 0.02);
await shot('9-at-7cm', 'just outside the 6 cm range');

// Holding the pen near the edge: no glow.
await rec.moveHand(HAND_REST);
await pause(300);
await rec.pickUpPen(1400);
await page.evaluate(async () => {
  const { world } = window.__metaNotes;
  const V = world.camera.position.constructor;
  const tablet = world.getSceneObject('tablet');
  const pen = world.globals['metaNotes.pen'];
  const target = tablet.localToWorld(new V(0.196 + 0.02, 0.05, 0.03));
  for (let i = 0; i < 3; i++) {
    const offset = (await window.__rec.pinchPoint()).sub(await window.__rec.handPosition());
    await window.__rec.moveHandTo(target.clone().sub(offset), 250, window.__rec.grip);
  }
  return pen.held;
});
await shot('10-pen-held-near-edge', 'pen in hand near the right edge');
await rec.putDownPen();
await rec.moveHand(HAND_REST);
await pause(300);

// Phase 2's grab: the whole rim, faint clay. Then release.
await page.evaluate(() => (window.__metaNotes.world.globals['metaNotes.tabletEdge'].grabbed = true));
await shot('11-grabbed', 'whole rim, faint clay');
await page.evaluate(() => (window.__metaNotes.world.globals['metaNotes.tabletEdge'].grabbed = false));
await page.waitForTimeout(80);
results.push({ name: '12-released-80ms', note: 'fading', ...(await glowState()) });
await shot('13-released', 'faded out');

console.table(results);
const errors = rec.logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror'));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await page.context().close();
await page.context().browser()?.close();
process.exit(0);
