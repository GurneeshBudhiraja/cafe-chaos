/**
 * Local check for the Blender tool wheel (not part of the app): opens a note,
 * picks up the pen, double-taps to open the wheel, and photographs it through
 * a narrower lens (a zoom): the whole wheel, each icon, a segment aimed at
 * (raised), and the picked tool's clay rim. Also prints the model's parts.
 *
 * Usage: dev server running, then node scripts/check-tool-wheel-model.mjs
 * Output: artifacts/tool-wheel-model/*.png and a summary.
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

// Screenshots only: drop the recorder's video, which needs Playwright's ffmpeg.
const launch = chromium.launch.bind(chromium);
chromium.launch = async (options) => {
  const browser = await launch(options);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = ({ recordVideo, ...rest } = {}) => newContext(rest);
  return browser;
};

const OUT = 'artifacts/tool-wheel-model';
mkdirSync(OUT, { recursive: true });
const WHEEL_ITEMS = ['pen', 'marker', 'highlighter', 'eraser', 'lasso', 'undo', 'redo'];
const AIM_REACH = 0.06;
const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const FACING_DEG = 90;
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
const CLASSROOM_ORIGIN = { x: -1.045, z: 0.28 };

const rec = await startHeadsetRecording({
  size: { width: 1032, height: 800 },
  fovDeg: 96,
  captions: false,
  async prepare(r) {
    await r.page.evaluate(([o, y, h]) => window.__metaNotes.demo.showClassroom(o, y, h), [CLASSROOM_ORIGIN, FACING_DEG, TABLE_HEIGHT_M]);
    await r.moveHead(SEAT);
    await r.moveHand(HAND_REST);
    await r.turnHead(FACING_DEG, 0, 100);
    await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
    await r.pause(800);
  },
});
const { page, pause } = rec;
const setFov = (deg) => page.evaluate((f) => (window.IWER_DEVICE.fovy = (f * Math.PI) / 180), deg);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const aimPoint = (name) =>
  page.evaluate(([index, count, reach]) => {
    const system = window.__metaNotes.world.getSystems().find((s) => s.constructor.name === 'ToolWheelSystem');
    const local = system.aimOrigin.clone();
    if (index >= 0) {
      const angle = Math.PI / 2 - (index * Math.PI * 2) / count;
      local.x += Math.cos(angle) * reach;
      local.y += Math.sin(angle) * reach;
    }
    const p = system.surface.localToWorld(local);
    return { x: p.x, y: p.y, z: p.z };
  }, [name ? WHEEL_ITEMS.indexOf(name) : -1, WHEEL_ITEMS.length, AIM_REACH]);
/** Look at a point on the wheel (wheel metres from its centre), from `back` metres in front of it. */
const lookAtWheelPoint = async (x, y, back) => {
  const t = await page.evaluate(async ([x, y, back]) => {
    const system = window.__metaNotes.world.getSystems().find((s) => s.constructor.name === 'ToolWheelSystem');
    const w = system.wheel; w.updateWorldMatrix(true, false);
    const V = w.position.constructor;
    const target = w.localToWorld(new V(x, y, 0.01));
    const eye = w.localToWorld(new V(x * 0.6, y * 0.6 - 0.05, back / w.scale.x));
    await window.__rec.moveHead({ x: eye.x, y: eye.y, z: eye.z });
    return { x: target.x, y: target.y, z: target.z };
  }, [x, y, back]);
  await rec.lookAt(t, 300);
  await pause(400);
};

await rec.tap('dock-new');
await pause(1600);
const tablet = await page.evaluate(() => { const p = window.__metaNotes.world.getSceneObject('tablet').position; return { x: p.x, y: p.y, z: p.z }; });
await rec.lookAt({ ...tablet, x: tablet.x - 0.02 }, 800);
await rec.pickUpPen(1200);
await rec.penWrite(layoutLine('Notes', { u: 0.1, v: 0.2, size: 0.0028, seed: 3 }).strokes);
await rec.moveNibTo(await page.evaluate(() => { const n = window.__metaNotes.world.globals['metaNotes.pen'].nib; return { x: n.x, y: n.y + 0.04, z: n.z }; }), 400);
await rec.penTap(2);
await pause(500);

const info = await page.evaluate(() => {
  const system = window.__metaNotes.world.getSystems().find((s) => s.constructor.name === 'ToolWheelSystem');
  const w = system.wheel;
  let triangles = 0; const materials = new Set();
  w.traverse((o) => { if (o.isMesh && o.name !== 'AimDot' && o.name !== 'HubLabel') { triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; materials.add(o.material.name); } });
  const seg = w.getObjectByName('Segment-marker');
  return { open: window.__metaNotes.world.globals['metaNotes.tools'].wheelOpen, triangles,
    materials: [...materials].filter(Boolean).sort(), markerParts: seg?.children.map((c) => c.name),
    hasLabelAnchor: !!w.getObjectByName('LabelAnchor'), hasCurrentInk: !!w.getObjectByName('CurrentInk') };
});

// The classroom's demo lights don't exist on a headset (only the environment lights the models): off for the photos.
await page.evaluate(() => window.__metaNotes.world.scene.getObjectByName('DemoClassroom')?.traverse((o) => { if (o.isLight) o.visible = false; }));
// The headset view, then the whole wheel through a zoom lens.
const centre = await page.evaluate(() => { const s = window.__metaNotes.world.getSystems().find((x) => x.constructor.name === 'ToolWheelSystem'); const p = s.wheel.position; return { x: p.x, y: p.y, z: p.z }; });
await rec.lookAt(centre, 400);
await shot('1-open-headset-view');
await setFov(34);
await lookAtWheelPoint(0, 0, 0.36);
await shot('2-whole-wheel');
// Each icon, close.
for (let i = 0; i < WHEEL_ITEMS.length; i++) {
  const a = Math.PI / 2 - (i * Math.PI * 2) / WHEEL_ITEMS.length;
  await setFov(22);
  await lookAtWheelPoint(Math.cos(a) * 0.071, Math.sin(a) * 0.071, 0.2);
  await shot(`3-icon-${i + 1}-${WHEEL_ITEMS[i]}`);
}
// Aim at Highlighter (it rises and is named on the hub), then pick it (its clay rim).
await setFov(34);
await rec.moveNibTo(await aimPoint('highlighter'), 500);
await lookAtWheelPoint(0, 0, 0.36);
await shot('4-aim-highlighter');
await rec.penTap(1);
await pause(300);
await rec.moveNibTo(await aimPoint(null), 400);
await pause(300);
await lookAtWheelPoint(0, 0, 0.36);
await shot('5-highlighter-picked');
const picked = await page.evaluate(() => window.__metaNotes.world.globals['metaNotes.tools'].tool);

console.log(JSON.stringify({ ...info, picked }, null, 1));
const errors = rec.logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror'));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await page.context().close();
await page.context().browser()?.close();
process.exit(0);
