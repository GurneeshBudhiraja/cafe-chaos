/**
 * Local check for the desk keyboard (not part of the app): opens a note on
 * the classroom desk, lays the keyboard in front of the tablet
 * (demo.showKeyboard), screenshots it from the seat and close up, presses a
 * few keys, and measures its triangles and draw calls.
 *
 * Usage: dev server running, then node scripts/check-desk-keyboard.mjs
 * Output: artifacts/desk-keyboard/*.png and a summary.
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

const OUT = 'artifacts/desk-keyboard';
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

/** Put the head `back` metres behind and `up` above a point on the keyboard, looking at it. */
const viewKeyboard = async (back, up, along = 0) => {
  const target = await page.evaluate(
    async ([back, up, along]) => {
      const { world } = window.__metaNotes;
      const V = world.camera.position.constructor;
      const kb = world.scene.getObjectByName('DemoDeskKeyboard');
      const focus = kb.localToWorld(new V(along, 0.01, 0));
      const toward = new V(0, 0, 1).transformDirection(kb.matrixWorld).setY(0).normalize();
      const head = focus.clone().addScaledVector(toward, back).setY(focus.y + up);
      await window.__rec.moveHead({ x: head.x, y: head.y, z: head.z });
      return { x: focus.x, y: focus.y, z: focus.z };
    },
    [back, up, along],
  );
  await rec.lookAt(target, 500);
  await pause(500);
};

const measure = () =>
  page.evaluate(async () => {
    const { world } = window.__metaNotes;
    const kb = world.scene.getObjectByName('DemoDeskKeyboard');
    let triangles = 0;
    kb.traverse((o) => {
      if (o.isMesh && o.visible && !o.isBatchedMesh) {
        const g = o.geometry;
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
      if (o.isBatchedMesh) triangles += o.geometry.index.count / 3;
    });
    const calls = async () => {
      const r = world.renderer;
      const before = r.info.render.frame;
      while (r.info.render.frame === before) await new Promise((res) => requestAnimationFrame(res));
      return r.info.render.calls;
    };
    const withKb = await calls();
    kb.visible = false;
    const withoutKb = await calls();
    kb.visible = true;
    const keyPos = (code) => +kb.getObjectByName(`Key_${code}`).position.y.toFixed(5);
    return { triangles, drawCallsPerEye: withKb - withoutKb, keyQRestY: keyPos('KeyQ') };
  });

const keyY = (code) =>
  page.evaluate((c) => +window.__metaNotes.world.scene.getObjectByName(`Key_${c}`).position.y.toFixed(5), code);

await rec.tap('dock-new');
await pause(1600);
// Typing mode will slide the tablet back to make room (phase 4): do that here, with its bar.
await page.evaluate(() => {
  const { world } = window.__metaNotes;
  const tablet = world.getSceneObject('tablet');
  const bar = world.getSceneObject('note-bar');
  tablet.updateWorldMatrix(true, false);
  const away = new (world.camera.position.constructor)(0, 1, 0).transformDirection(tablet.matrixWorld).setY(0).normalize();
  tablet.position.addScaledVector(away, 0.1);
  bar?.position.addScaledVector(away, 0.1);
});
await page.evaluate(() => window.__metaNotes.demo.showKeyboard());
await pause(400);

// Seated view: the tablet and the keyboard on the desk, as a set.
await viewKeyboard(0.32, 0.4);
await page.screenshot({ path: `${OUT}/1-seated-view.png` });
// Close up: the legends.
await viewKeyboard(0.12, 0.16, -0.05);
await page.screenshot({ path: `${OUT}/2-close-left.png` });
await viewKeyboard(0.12, 0.16, 0.06);
await page.screenshot({ path: `${OUT}/3-close-right.png` });

const stats = await measure();
// Press Q, Space and Return and hold them down.
const restQ = await keyY('KeyQ');
await page.evaluate(() => ['KeyQ', 'Space', 'Enter'].forEach((c) => window.__metaNotes.demo.pressKey(c)));
await page.waitForTimeout(400);
const downQ = await keyY('KeyQ');
await viewKeyboard(0.1, 0.06, -0.02);
await page.screenshot({ path: `${OUT}/4-pressed-low-angle.png` });
await page.evaluate(() => ['KeyQ', 'Space', 'Enter'].forEach((c) => window.__metaNotes.demo.releaseKey(c)));
await page.waitForTimeout(40);
const midQ = await keyY('KeyQ');
await page.waitForTimeout(400);
const upQ = await keyY('KeyQ');
await page.screenshot({ path: `${OUT}/5-released-low-angle.png` });

console.log(JSON.stringify({ ...stats, restQ, downQ, travelMm: +((restQ - downQ) * 1000).toFixed(2), midQ, upQ }, null, 1));
const errors = rec.logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror'));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await page.context().close();
await page.context().browser()?.close();
process.exit(0);
