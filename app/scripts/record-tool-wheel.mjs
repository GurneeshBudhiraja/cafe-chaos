/**
 * Records the tool wheel as the headset shows it (Quest 3 field of view,
 * no captions), seated at the classroom desk with the pen already in hand,
 * so the video is only the tool wheel:
 *
 * 1. Double-tap the pen: the wheel opens; pick Marker, then Clay and Bold
 *    from the ring, and write a heading.
 * 2. Pinch with the free hand: pick the Highlighter, let go; highlight the
 *    heading (the highlight sits under the ink).
 * 3. Back to the Pen; write a line.
 * 4. The Eraser: its ring shows over the line; rub it out; Undo brings it back.
 * 5. The Lasso: loop the heading, drag it lower; Delete it from the ring;
 *    Undo brings it back.
 *
 * Usage: dev server running, then `npm run record:tool-wheel`.
 * Output: artifacts/tool-wheel-demo.mp4
 */

import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';
import { toolWheelDriver } from './lib/tool-wheel-driver.mjs';

/** Seated at the emulated room's desk-height table, facing it (see record-desk.mjs). */
const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const FACING_DEG = 90;
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
const CLASSROOM_ORIGIN = { x: -1.045, z: 0.28 };
/** Holds on each wheel pick before tapping, so the aim reads on video (ms of video). */
const DWELL_MS = 500;

/** The tablet's centre (world). */
const tabletCentre = (page) =>
  page.evaluate(() => {
    const p = window.__metaNotes.world.getSceneObject('tablet').position;
    return { x: p.x, y: p.y, z: p.z };
  });

/** Off camera: seat, open a new note on the desk, pick up the pen, write the date. */
async function prepare(r) {
  await r.page.evaluate(
    ([origin, yaw, height]) => window.__metaNotes.demo.showClassroom(origin, yaw, height),
    [CLASSROOM_ORIGIN, FACING_DEG, TABLE_HEIGHT_M],
  );
  await r.moveHead(SEAT);
  await r.moveHand(HAND_REST);
  await r.turnHead(FACING_DEG, 0, 100);
  await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
  await r.pause(600);
  await r.tap('dock-new');
  await r.pause(1200);
  const tablet = await tabletCentre(r.page);
  await r.lookAt({ ...tablet, x: tablet.x - 0.02 }, 300);
  await r.pickUpPen(800);
  await r.penWrite(layoutLine('Biology', { u: 0.07, v: 0.14, size: 0.003, seed: 2 }).strokes, 0.2);
  await toolWheelDriver(r).liftPen(200);
}

const rec = await startHeadsetRecording({ size: { width: 1032, height: 800 }, fovDeg: 96, captions: false, prepare });
const { page, pause, fps, speedUp } = rec;
const wheel = toolWheelDriver(rec);
const { aimPoint, aimSwatch, aimSize, aimDelete, overPage, liftPen, pickOnWheel } = wheel;
const tablet = await tabletCentre(page);
const atTablet = { ...tablet, x: tablet.x - 0.02 };
const picks = { aimMs: 500, dwellMs: DWELL_MS };

/** Glance between the page and the open wheel, as one does when choosing. */
async function glanceAtWheel() {
  const centre = await page.evaluate(() => {
    const system = window.__metaNotes.world.getSystems().find((s) => s.constructor.name === 'ToolWheelSystem');
    return system.wheel.position;
  });
  await rec.lookAt({ x: (centre.x + atTablet.x) / 2, y: (centre.y + atTablet.y) / 2, z: (centre.z + atTablet.z) / 2 }, 500);
}

await pause(1000);

// --- 1. Double-tap: the wheel. Marker, Clay, Bold; write a heading.
await rec.penTap(2);
await glanceAtWheel();
await pause(700);
await pickOnWheel([() => aimPoint('marker'), () => aimSwatch(2, 5), () => aimSize('bold')], picks);
await pause(500);
await rec.lookAt(atTablet, 500);
await rec.penWrite(layoutLine('Mitosis', { u: 0.08, v: 0.3, size: 0.0045, seed: 7 }).strokes);
await liftPen();
await pause(500);

// --- 2. The free hand: pinch to open, aim at the Highlighter, let go; highlight the heading.
const freeHand = await page.evaluate((t) => ({ x: t.x + 0.06, y: t.y + 0.2, z: t.z - 0.22 }), tablet);
await rec.moveLeftHand(freeHand);
await pause(400);
await rec.leftPinch(1);
await glanceAtWheel();
await rec.moveNibTo(await aimPoint('highlighter'), 500);
await pause(DWELL_MS);
await rec.leftPinch(0);
await pause(300);
await rec.moveNibTo(await aimPoint(null), 300);
await rec.penTap(1);
await rec.moveLeftHand({ x: -0.3, y: 0.75, z: 0.15 });
await rec.lookAt(atTablet, 500);
await rec.penWrite([[[0.07, 0.31], [0.33, 0.31]]], 0.07);
await liftPen();
await pause(500);

// --- 3. Back to the Pen; write a line.
await pickOnWheel([() => aimPoint('pen'), () => aimPoint(null)], picks);
await rec.penWrite(layoutLine('4 stages', { u: 0.08, v: 0.5, size: 0.003, seed: 12 }).strokes);
await liftPen();
await pause(500);

// --- 4. The Eraser: its ring over the line, rub it out; Undo brings it back.
await pickOnWheel([() => aimPoint('eraser'), () => aimSize('bold'), () => aimPoint(null)], picks);
await rec.moveNibTo(await overPage(0.12, 0.5, 0.012), 600);
await pause(800);
await rec.penWrite([[[0.06, 0.49], [0.3, 0.5]]], 0.06);
await liftPen();
await pause(700);
await pickOnWheel([() => aimPoint('undo'), () => aimPoint(null)], picks);
await pause(900);

// --- 5. The Lasso: loop the heading and drag it lower; Delete it; Undo.
await pickOnWheel([() => aimPoint('lasso'), () => aimPoint(null)], picks);
const loop = [];
for (let i = 0; i <= 28; i++) {
  const a = (i / 28) * Math.PI * 2;
  loop.push([0.2 + Math.cos(a) * 0.16, 0.3 + Math.sin(a) * 0.09]);
}
await rec.penWrite([loop], 0.1);
await liftPen();
await pause(800);
await rec.penWrite([[[0.2, 0.3], [0.45, 0.66]]], 0.06);
await liftPen();
await pause(900);
await pickOnWheel([aimDelete], picks);
await pause(400);
await pickOnWheel([() => aimPoint(null)], picks);
await pause(800);
await pickOnWheel([() => aimPoint('undo'), () => aimPoint(null)], picks);
await pause(1500);

const errors = await rec.finish('tool-wheel-demo');
console.log(`${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
