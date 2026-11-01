/**
 * The full demo, as the headset shows it (Quest 3 field of view, no
 * captions), with the Blender assets: seated at the classroom desk.
 *
 * 1. Only the dock at launch; New note: the tablet lands on the desk, the
 *    pen and the sticky-note pad beside it.
 * 2. Lean in, pick up the pen (its nib shadow shows) and write a heading.
 * 3. The tool wheel (double-tap the pen): Marker in clay, bold; a line.
 *    The free hand's pinch: the Highlighter, over the heading. Back to the pen.
 * 4. The eraser rubs a line out; Undo brings it back.
 * 5. The lasso: loop the marker line and drag it lower.
 * 6. Sticky notes: peel a yellow one off the pad, write on it, stick it on
 *    the desk; peel a pink one, carry it over the bin (it opens) and drop it.
 * 7. Put the pen down and close the page with X: the dock comes back, and
 *    the sticky note stays on the desk.
 *
 * Usage: dev server running, then `npm run record:demo`. Output: artifacts/demo.mp4
 */

import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';
import { toolWheelDriver } from './lib/tool-wheel-driver.mjs';

const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
/** Leaning in over the desk to write, the head about 45 cm from the page. */
const LEANING_IN = { x: -1.1, y: 1.17, z: 0.3 };
const FACING_DEG = 90;
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
/** The free left hand, resting low and out of view. */
const LEFT_REST = { x: -0.95, y: 0.8, z: 0.55 };
const CLASSROOM_ORIGIN = { x: -1.045, z: 0.28 };
/** Holds on each wheel pick before tapping, so the aim reads on video (ms of video). */
const picks = { aimMs: 500, dwellMs: 450 };

async function prepare(r) {
  await r.page.evaluate(
    ([origin, yaw, height]) => window.__metaNotes.demo.showClassroom(origin, yaw, height),
    [CLASSROOM_ORIGIN, FACING_DEG, TABLE_HEIGHT_M],
  );
  await r.moveHead(SEAT);
  await r.moveHand(HAND_REST);
  await r.moveLeftHand(LEFT_REST);
  await r.turnHead(FACING_DEG, 0, 100);
  // An empty room: no sticky notes from earlier runs.
  await r.page.evaluate(() => {
    const board = window.__metaNotes.world.globals['metaNotes.stickies'];
    for (const sticky of board.all()) board.remove(sticky.id);
  });
  await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
  await r.pause(800);
}

const rec = await startHeadsetRecording({ size: { width: 1032, height: 800 }, fovDeg: 96, captions: false, prepare });
const { page, pause, fps, speedUp } = rec;
const { aimPoint, aimSwatch, aimSize, overPage, liftPen, pickOnWheel } = toolWheelDriver(rec);

const worldOf = (name, lift = 0) =>
  page.evaluate(
    ([n, l]) => {
      const object = window.__metaNotes.world.scene.getObjectByName(n);
      const p = object.getWorldPosition(new object.position.constructor());
      return { x: p.x, y: p.y + l, z: p.z };
    },
    [name, lift],
  );
const stickyIds = () => page.evaluate(() => window.__metaNotes.world.globals['metaNotes.stickies'].all().map((s) => s.id));
const binMouth = () =>
  page.evaluate(() => {
    const bin = window.__metaNotes.world.getSystems().find((x) => x.constructor.name === 'StickySystem').bin.bin;
    return { x: bin.position.x, y: bin.position.y + 0.11 * bin.scale.y, z: bin.position.z };
  });
/** Rest the right hand, pointing down out of the way. */
const restRight = async () => {
  await rec.moveHand(HAND_REST);
  await page.evaluate(([x, z]) => window.IWER_DEVICE.remote.dispatch('look_at', { device: 'hand-right', target: { x, y: 0, z } }), [
    SEAT.x - 0.2,
    SEAT.z + 0.3,
  ]);
};

// --- 1. The dock, then New note: the tablet lands on the desk.
await restRight();
await pause(1600);
await rec.tap('dock-new');
await restRight();
await page.waitForFunction(() => window.__metaNotes.world.getSceneObject('tablet').position.y < 1.2, null, { timeout: 60000 });
await pause(1200);
const tablet = await worldOf('Tablet');
const atTablet = { ...tablet, y: tablet.y - 0.1 };
await rec.moveHead(LEANING_IN);
await rec.lookAt(atTablet, 1400);
await pause(900);

// --- 2. Pick up the pen and write a heading.
await rec.pickUpPen(1300);
await pause(400);
await rec.penWrite(layoutLine('Biology', { u: 0.07, v: 0.14, size: 0.0032, seed: 2 }).strokes);
await liftPen();
await pause(400);

// --- 3. The tool wheel: Marker, clay, bold; a line. Then the Highlighter (free hand), back to the pen.
await pickOnWheel([() => aimPoint('marker'), () => aimSwatch(2, 5), () => aimSize('bold')], picks);
await pause(400);
await rec.penWrite(layoutLine('Mitosis', { u: 0.08, v: 0.3, size: 0.0045, seed: 7 }).strokes);
await liftPen();
await pause(300);
await rec.moveLeftHand({ x: tablet.x + 0.12, y: tablet.y + 0.15, z: tablet.z + 0.2 });
await pause(300);
await rec.leftPinch(1);
await rec.moveNibTo(await aimPoint('highlighter'), 500);
await pause(450);
await rec.leftPinch(0);
await rec.moveNibTo(await aimPoint(null), 300);
await rec.penTap(1);
await rec.moveLeftHand(LEFT_REST);
await rec.penWrite([[[0.07, 0.15], [0.3, 0.15]]], 0.07);
await liftPen();
await pickOnWheel([() => aimPoint('pen'), () => aimPoint(null)], picks);
await rec.penWrite(layoutLine('4 stages', { u: 0.08, v: 0.5, size: 0.003, seed: 12 }).strokes);
await liftPen();
await pause(400);

// --- 4. The eraser rubs a line out; Undo brings it back.
await pickOnWheel([() => aimPoint('eraser'), () => aimSize('bold'), () => aimPoint(null)], picks);
await rec.moveNibTo(await overPage(0.12, 0.5, 0.012), 500);
await pause(500);
await rec.penWrite([[[0.06, 0.49], [0.3, 0.5]]], 0.06);
await liftPen();
await pause(500);
await pickOnWheel([() => aimPoint('undo'), () => aimPoint(null)], picks);
await pause(700);

// --- 5. The lasso: loop the marker line and drag it lower.
await pickOnWheel([() => aimPoint('lasso'), () => aimPoint(null)], picks);
const loop = [];
for (let i = 0; i <= 28; i++) {
  const a = (i / 28) * Math.PI * 2;
  loop.push([0.2 + Math.cos(a) * 0.16, 0.3 + Math.sin(a) * 0.08]);
}
await rec.penWrite([loop], 0.1);
await liftPen();
await pause(500);
await rec.penWrite([[[0.2, 0.3], [0.42, 0.68]]], 0.06);
await liftPen();
await pause(700);
await pickOnWheel([() => aimPoint('pen'), () => aimPoint(null)], picks);

// --- 6. Sticky notes: a yellow one to write on and stick on the desk; a pink one into the bin.
await rec.leftPinchAt(await worldOf('StickyPad-classic', 0.01), 800);
await pause(600);
await rec.leftPinch(0);
await rec.moveLeftHand(LEFT_REST);
const [yellowId] = await stickyIds();
const yellow = `Sticky:${yellowId}`;
await rec.lookAt(await worldOf(yellow), 700);
await rec.penWrite(layoutLine('Quiz Fri', { u: 0.1, v: 0.4, size: 0.012, seed: 5 }).strokes, 0.06, yellow);
await rec.penWrite(layoutLine('ch. 5', { u: 0.1, v: 0.68, size: 0.012, seed: 9 }).strokes, 0.06, yellow);
await liftPen();
await pause(500);
// Carry it onto the desk, right of the tablet.
await rec.leftPinchAt(await worldOf(yellow), 600);
const onDesk = { x: tablet.x - 0.02, y: tablet.y + 0.05, z: tablet.z - 0.32 };
await rec.lookAt({ ...onDesk, x: onDesk.x + 0.05, y: onDesk.y - 0.12 }, 700);
await rec.moveLeftPinchTo(onDesk, 1300);
await rec.leftPinch(0);
await rec.moveLeftHand(LEFT_REST);
await pause(900);
await rec.lookAt(atTablet, 700);
// A pink one, thrown away.
await rec.leftPinchAt(await worldOf('StickyPad-blush', 0.01), 800);
await pause(500);
await rec.leftPinch(0);
await rec.moveLeftHand(LEFT_REST);
const pinkId = (await stickyIds()).find((id) => id !== yellowId);
await rec.leftPinchAt(await worldOf(`Sticky:${pinkId}`), 600);
await pause(500);
await rec.moveLeftPinchTo(await binMouth(), 1300);
await pause(700);
await rec.leftPinch(0);
await rec.moveLeftHand(LEFT_REST);
await pause(1200);

// --- 7. Pen down; close the page: the dock returns, the sticky note stays on the desk.
await rec.putDownPen();
await restRight();
await pause(600);
await rec.point('note-bar-close');
await pause(400);
await rec.tap('note-bar-close');
const noteOpen = () => page.evaluate(() => window.__metaNotes.world.globals['metaNotes.noteView'].isOpen);
if (await noteOpen()) {
  await pause(400);
  await rec.tap('note-bar-close');
}
await restRight();
await pause(1200);
await rec.lookAt({ ...onDesk, y: onDesk.y - 0.15 }, 1200);
await pause(1600);
await rec.turnHead(FACING_DEG, 0, 1400);
await pause(1800);

const errors = await rec.finish('demo');
console.log(`${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
