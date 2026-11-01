/**
 * Local check for the Blender tablet (not part of the app): opens a note on
 * the classroom desk, photographs the tablet from the seat and close up
 * (front corner, short edge, top edge, back), then picks up the pen and
 * writes, to show ink and the pen still work on the new model.
 *
 * Usage: dev server running, then node scripts/check-tablet-model.mjs
 * Output: artifacts/tablet-model/*.png and a summary.
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

const OUT = 'artifacts/tablet-model';
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

/**
 * Put the head at a point given in the tablet's own space (x across, y up
 * the page, z out of the page, metres) and look at another tablet-space point.
 */
const viewFromTablet = async (eye, target) => {
  const t = await page.evaluate(
    async ([eye, target]) => {
      const { world } = window.__metaNotes;
      const V = world.camera.position.constructor;
      const tablet = world.getSceneObject('tablet');
      tablet.updateWorldMatrix(true, false);
      const e = tablet.localToWorld(new V(...eye));
      const t = tablet.localToWorld(new V(...target));
      await window.__rec.moveHead({ x: e.x, y: e.y, z: e.z });
      return { x: t.x, y: t.y, z: t.z };
    },
    [eye, target],
  );
  await rec.lookAt(t, 400);
  await pause(500);
};
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
/** The emulated lens: 96 degrees is the headset's real view; a narrower one is a zoom for close-ups. */
const setFov = (deg) => page.evaluate((f) => (window.IWER_DEVICE.fovy = (f * Math.PI) / 180), deg);
const headDistance = (target) =>
  page.evaluate((t) => {
    const { world } = window.__metaNotes;
    const tablet = world.getSceneObject('tablet');
    const head = world.camera.getWorldPosition(new (world.camera.position.constructor)());
    return +tablet.localToWorld(new (world.camera.position.constructor)(...t)).distanceTo(head).toFixed(3);
  }, target);

await rec.tap('dock-new');
await pause(1600);
/**
 * The classroom backdrop brings its own demo lights; on a headset only the environment lights the
 * models (the room is passthrough video). Close-ups switch them off so materials look as on a headset;
 * the wide views keep them so the room is visible.
 */
const demoLights = (on) =>
  page.evaluate((v) => window.__metaNotes.world.scene.getObjectByName('DemoClassroom')?.traverse((o) => { if (o.isLight) o.visible = v; }), on);
// The note bar stands behind the top edge: hide it for the photos (shown again before writing).
await page.evaluate(() => (window.__metaNotes.world.getSceneObject('note-bar').visible = false));
// Hand out of the way for the photos.
await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: { x: 0, y: -2, z: 0 } }));

const stats = await page.evaluate(async () => {
  const { world } = window.__metaNotes;
  const tablet = world.getSceneObject('tablet');
  let triangles = 0;
  const names = [];
  tablet.traverse((o) => {
    if (o.name) names.push(o.name);
    if (o.isMesh) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  const page = tablet.getObjectByName('WritingSurface');
  return { triangles, names, pageMaterial: page?.material?.type, pageHasPaper: !!page?.material?.map };
});

// Seated, looking down at the desk.
await viewFromTablet([0, -0.42, 0.33], [0, 0.02, 0]);
await shot('1-seated');
// Close-ups through a narrower lens (a zoom), so the materials can be judged, lit as on a headset.
await setFov(34);
await demoLights(false);
// Low and close at the near-right corner: brushed metal, polished edge, glass.
await viewFromTablet([0.3, -0.26, 0.07], [0.16, -0.11, 0]);
console.log('corner distance m', await headDistance([0.16, -0.11, 0]));
await shot('2-corner-close');
// The right short edge, from the side: speaker holes and the edge.
await viewFromTablet([0.34, -0.02, 0.05], [0.196, 0.06, -0.004]);
await shot('3-short-edge');
// The top edge from behind and above: the pen strip and front camera.
await viewFromTablet([0.05, 0.3, 0.12], [0, 0.151, -0.003]);
await shot('4-top-edge');
// The back: flip the tablet over for this photo only, then put it back.
await page.evaluate(() => {
  const tablet = window.__metaNotes.world.getSceneObject('tablet');
  window.__savedQuat = tablet.quaternion.clone();
  const shadow = tablet.getObjectByName('DeskShadow');
  if (shadow) shadow.visible = false;
  tablet.rotateX(Math.PI);
  tablet.position.y += 0.009;
});
await viewFromTablet([-0.1, 0.38, -0.32], [0.1, 0.0, -0.009]);
await shot('5-back');
await page.evaluate(() => {
  const tablet = window.__metaNotes.world.getSceneObject('tablet');
  tablet.quaternion.copy(window.__savedQuat);
  const shadow = tablet.getObjectByName('DeskShadow');
  if (shadow) shadow.visible = true;
  tablet.position.y -= 0.009;
});

await page.evaluate(() => (window.__metaNotes.world.getSceneObject('note-bar').visible = true));
// Write with the pen at the headset's real view: ink must still land on the new page.
await setFov(96);
await demoLights(true);
await viewFromTablet([0, -0.4, 0.34], [-0.02, 0.03, 0]);
await rec.moveHand(HAND_REST);
await pause(300);
await rec.pickUpPen(1400);
await rec.penWrite(layoutLine('Real glass', { u: 0.12, v: 0.2, size: 0.003, seed: 3 }).strokes);
await pause(300);
await shot('6-writing');
await rec.putDownPen();
await rec.moveHand(HAND_REST);
await pause(400);
const strokes = await page.evaluate(() => window.__metaNotes.session.active?.pages?.[0]?.strokes?.length ?? window.__metaNotes.session.active?.strokes?.length ?? null);
await setFov(34);
await demoLights(false);
await viewFromTablet([0.02, -0.2, 0.22], [-0.02, 0.06, 0]);
await shot('7-ink-close');

console.log(JSON.stringify({ ...stats, strokes }, null, 1));
const errors = rec.logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror'));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await page.context().close();
await page.context().browser()?.close();
process.exit(0);
