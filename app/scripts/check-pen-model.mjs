/**
 * Local check for the Blender pen (not part of the app): opens a note on the
 * classroom desk, photographs the pen lying beside the tablet and close up,
 * then picks it up and writes, photographing it in the hand.
 *
 * Usage: dev server running, then node scripts/check-pen-model.mjs
 * Output: artifacts/pen-model/*.png and a summary.
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

const OUT = 'artifacts/pen-model';
mkdirSync(OUT, { recursive: true });
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
const setFov = (deg) => page.evaluate((f) => (window.IWER_DEVICE.fovy = (f * Math.PI) / 180), deg);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
/** The classroom's demo lights: off for close-ups, so materials look as on a headset (only the environment lights them). */
const demoLights = (on) =>
  page.evaluate((v) => window.__metaNotes.world.scene.getObjectByName('DemoClassroom')?.traverse((o) => { if (o.isLight) o.visible = v; }), on);
const restShadowVisible = () => page.evaluate(() => window.__metaNotes.world.scene.getObjectByName('PenRestShadow')?.visible ?? null);

/** Head at `eye` (pen space: x along the pen, nib at +x; y up when at rest... see below), looking at a pen-space point. */
const viewFromPen = async (eye, target) => {
  const t = await page.evaluate(
    async ([eye, target]) => {
      const { world } = window.__metaNotes;
      const V = world.camera.position.constructor;
      const pen = world.scene.getObjectByName('Stylus');
      pen.updateWorldMatrix(true, false);
      const e = pen.localToWorld(new V(...eye));
      const t = pen.localToWorld(new V(...target));
      await window.__rec.moveHead({ x: e.x, y: e.y, z: e.z });
      return { x: t.x, y: t.y, z: t.z };
    },
    [eye, target],
  );
  await rec.lookAt(t, 400);
  await pause(500);
};
/** Head at a world offset from the pen's centre (metres), looking at the pen's nib or centre. */
const viewPenFrom = async (offset, look = 'centre') => {
  const t = await page.evaluate(
    async ([offset, look]) => {
      const { world } = window.__metaNotes;
      const V = world.camera.position.constructor;
      const pen = world.scene.getObjectByName('Stylus');
      const centre = pen.getWorldPosition(new V());
      const target = look === 'nib' ? world.scene.getObjectByName('NibTip').getWorldPosition(new V()) : centre;
      const e = centre.clone().add(new V(...offset));
      await window.__rec.moveHead({ x: e.x, y: e.y, z: e.z });
      return { x: target.x, y: target.y, z: target.z };
    },
    [offset, look],
  );
  await rec.lookAt(t, 400);
  await pause(500);
};

await rec.tap('dock-new');
await pause(1600);
await page.evaluate(() => (window.__metaNotes.world.getSceneObject('note-bar').visible = false));
await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: { x: 0, y: -2, z: 0 } }));

const stats = await page.evaluate(() => {
  const pen = window.__metaNotes.world.scene.getObjectByName('Stylus');
  let triangles = 0;
  const materials = new Set();
  pen.traverse((o) => {
    if (o.isMesh) {
      triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      materials.add(o.material.name);
    }
  });
  const tip = pen.getObjectByName('NibTip');
  return { triangles, materials: [...materials], nibTipX: tip?.position.x };
});

// Seated view: the pen beside the tablet.
await setFov(96);
await viewPenFrom([-0.05, 0.42, 0.32]);
await shot('1-seated');
// Close-ups through a narrower lens (a zoom), lit as on a headset.
await setFov(30);
await demoLights(false);
const shadowAtRest = await restShadowVisible();
// The pen at rest: lying along the desk, nib away from the viewer. Look from the side and a little above.
await viewFromPen([0.0, 0.16, 0.12], [0.0, 0, 0]);
await shot('2-rest-side');
await viewFromPen([0.12, 0.06, 0.06], [0.06, 0, 0]);
await shot('3-band-ferrule-nib');
await viewFromPen([-0.12, 0.06, 0.06], [-0.065, 0, 0]);
await shot('4-tail-seam');

// In the hand: pick it up and write, then photograph the pen held over the page.
await setFov(96);
await demoLights(true);
await page.evaluate(() => (window.__metaNotes.world.getSceneObject('note-bar').visible = true));
await viewPenFrom([-0.3, 0.42, 0.3]);
await rec.moveHand(HAND_REST);
await pause(300);
await rec.pickUpPen(1400);
await rec.penWrite(layoutLine('ceramic', { u: 0.25, v: 0.3, size: 0.003, seed: 9 }).strokes);
const held = await page.evaluate(() => window.__metaNotes.world.globals['metaNotes.pen'].held);
const shadowWhileHeld = await restShadowVisible();
await shot('5-writing-headset-view');
await setFov(30);
await demoLights(false);
await viewPenFrom([0.06, 0.16, 0.14], 'nib');
await shot('6-in-hand-close');
await setFov(96);
await rec.putDownPen();
await rec.moveHand(HAND_REST);
await pause(800);
const shadowAfterPutDown = await restShadowVisible();
const strokes = await page.evaluate(() => {
  const pages = window.__metaNotes.session.active?.pages;
  return pages ? pages.reduce((n, p) => n + p.strokes.length, 0) : null;
});

console.log(JSON.stringify({ ...stats, heldWhileWriting: held, strokes, shadowAtRest, shadowWhileHeld, shadowAfterPutDown }, null, 1));
const errors = rec.logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror'));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await page.context().close();
await page.context().browser()?.close();
process.exit(0);
