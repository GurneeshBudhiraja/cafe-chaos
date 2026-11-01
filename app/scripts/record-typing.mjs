/**
 * Typing mode, start to end, as the headset shows it (Quest 3 field of
 * view, no captions), seated at the classroom desk:
 *
 * 1. New note: the tablet lands on the desk. Pick up the pen and handwrite
 *    a heading; put the pen down.
 * 2. Type on the note bar: the tablet goes away, the page rises and floats
 *    ahead with the toolbar under it, and the keyboard appears on the desk.
 *    The caret waits just below the handwriting.
 * 3. Type on the desk keyboard with the fingertips: a heading (the H2
 *    button), a sentence, a numbered list (its button), a checklist.
 * 4. Select words with a ray drag and make them bold; tick the checklist's box.
 * 5. Resize the page from a corner, move it by the grab bar.
 * 6. Tap the top right of the page: a second text box; type in it.
 * 7. Write on the note bar: the page flies back to the tablet with its
 *    handwriting and its text; the keyboard goes.
 *
 * Usage: dev server running, then `npm run record:typing`. Output: artifacts/typing.mp4
 */

import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';
import { keyboardDriver } from './lib/keyboard-driver.mjs';

const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LEANING_IN = { x: -1.1, y: 1.17, z: 0.3 };
const FACING_DEG = 90;
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
const LEFT_REST = { x: -0.95, y: 0.8, z: 0.55 };
const CLASSROOM_ORIGIN = { x: -1.045, z: 0.28 };

async function prepare(r) {
  await r.page.evaluate(
    ([origin, yaw, height]) => window.__metaNotes.demo.showClassroom(origin, yaw, height),
    [CLASSROOM_ORIGIN, FACING_DEG, TABLE_HEIGHT_M],
  );
  await r.moveHead(SEAT);
  await r.moveHand(HAND_REST);
  await r.moveLeftHand(LEFT_REST);
  await r.turnHead(FACING_DEG, 0, 100);
  await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
  await r.pause(1500);
}

const rec = await startHeadsetRecording({ size: { width: 1032, height: 800 }, fovDeg: 96, captions: false, prepare });
const { page, pause, fps, speedUp } = rec;
const desk = keyboardDriver(rec);

const worldOf = (name) =>
  page.evaluate((n) => {
    const object = window.__metaNotes.world.scene.getObjectByName(n);
    const p = object.getWorldPosition(new object.position.constructor());
    return { x: p.x, y: p.y, z: p.z };
  }, name);
const pagePoint = (u, v) => page.evaluate(([a, b]) => window.__metaNotes.demo.pagePoint(a, b), [u, v]);
/** World point of a character offset in a block of the first text frame (mid-line). */
const textPoint = (frameIndex, block, offset) =>
  page.evaluate(([f, b, o]) => {
    const typing = window.__metaNotes.world.globals['metaNotes.typing'];
    const frame = typing.editor.frames[f];
    const at = typing.layout.caretAt(frame, { block: b, offset: o });
    return window.__metaNotes.demo.pagePoint(frame.x + at.x / 1000, frame.y + (at.line.top + at.line.height / 2) / 750);
  }, [frameIndex, block, offset]);
const blocks = () =>
  page.evaluate(() => window.__metaNotes.session.active.pages[0].frames[0].blocks.map((b) => b.runs.map((r) => r.text).join('')));
/** Pinch with the right hand's ray at a world point (a tap). */
async function rayTap(point) {
  await page.evaluate((p) => window.IWER_DEVICE.remote.dispatch('look_at', { device: 'hand-right', target: p }), point);
  await pause(450);
  await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_select_value', { device: 'hand-right', value: 1 }));
  await pause(220);
  await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_select_value', { device: 'hand-right', value: 0 }));
  await pause(300);
}
/** Tap a toolbar button with the ray, then bring the hands back over the keys. */
async function toolbar(id) {
  await rec.point(id);
  await pause(350);
  await rec.tap(id);
  await pause(250);
  await desk.ready();
}
/** Look between the floating page and the keyboard, so both are in view while typing. */
async function lookWhileTyping(ms = 700) {
  const centre = await pagePoint(0.5, 0.62);
  const keyboard = await worldOf('DeskKeyboard');
  await rec.lookAt({ x: (centre.x * 2 + keyboard.x) / 3, y: (centre.y * 2 + keyboard.y) / 3, z: (centre.z * 2 + keyboard.z) / 3 }, ms);
}

// --- 1. A new note; handwrite a heading.
await pause(1200);
await rec.tap('dock-new');
await rec.moveHand(HAND_REST);
await page.waitForFunction(() => window.__metaNotes.world.getSceneObject('tablet').position.y < 1.2, null, { timeout: 60000 });
await pause(1000);
const tablet = await worldOf('Tablet');
await rec.moveHead(LEANING_IN);
await rec.lookAt({ ...tablet, y: tablet.y - 0.1 }, 1200);
await rec.pickUpPen(1200);
await rec.penWrite(layoutLine('Biology', { u: 0.07, v: 0.13, size: 0.0034, seed: 2 }).strokes);
await pause(300);
await rec.putDownPen();
await rec.moveHand(HAND_REST);
await pause(600);

// --- 2. Type mode: the page floats ahead; the keyboard comes out on the desk.
await rec.lookAt(await rec.objectCenter('note-bar-mode-type'), 700);
await rec.point('note-bar-mode-type');
await pause(500);
await rec.tap('note-bar-mode-type');
await rec.moveHand(HAND_REST);
await pause(900);
await rec.lookAt(await pagePoint(0.5, 0.5), 900);
await pause(1200);
await lookWhileTyping(900);
await pause(500);

// --- 3. Type with the fingertips: a heading, a sentence, a numbered list, a checklist.
await desk.ready();
await desk.type('Mitosis');
await toolbar('tool-heading');
await desk.type('\nCells divide in four stages.\n');
await toolbar('tool-numbered');
await desk.type('Prophase\nMetaphase\nAnaphase\nTelophase\n\n');
await toolbar('tool-checklist');
await desk.type('Review chapter 5');
await rec.moveHand(HAND_REST);
await rec.moveLeftHand(LEFT_REST);
await pause(800);

// --- 4. Select "four stages" with a ray drag; Bold. Tick the checklist's box.
const lines = await blocks();
const sentence = lines.findIndex((text) => text.startsWith('Cells divide'));
const from = lines[sentence].indexOf('four');
await rec.lookAt(await pagePoint(0.45, 0.5), 700);
await rec.rayDrag(await textPoint(0, sentence, from), await textPoint(0, sentence, from + 'four stages'.length), 1200);
await pause(500);
await rec.point('tool-bold');
await pause(400);
await rec.tap('tool-bold');
await pause(700);
const check = lines.findIndex((text) => text.startsWith('Review'));
const box = await page.evaluate((b) => {
  const typing = window.__metaNotes.world.globals['metaNotes.typing'];
  const frame = typing.editor.frames[0];
  const marker = typing.layout.layoutFrame(frame).blocks[b].marker.box;
  return window.__metaNotes.demo.pagePoint(frame.x + (marker.x + marker.size / 2) / 1000, frame.y + (marker.y + marker.size / 2) / 750);
}, check);
await rayTap(box);
await pause(900);

// --- 5. Resize from the corner; move by the grab bar.
const corner = await worldOf('TypeResizeRight');
const centre = await pagePoint(0.5, 0.5);
const out = 0.22;
await rec.rayDrag(corner, { x: corner.x + (corner.x - centre.x) * out, y: corner.y + (corner.y - centre.y) * out, z: corner.z + (corner.z - centre.z) * out }, 1300);
await pause(500);
await rec.lookAt(await pagePoint(0.5, 0.5), 600);
const grab = await rec.objectCenter('type-toolbar-grab');
await rec.point('type-toolbar-grab');
await pause(400);
await rec.rayDrag(grab, { x: grab.x, y: grab.y + 0.05, z: grab.z + 0.06 }, 1300);
await rec.moveHand(HAND_REST);
await pause(500);
await rec.lookAt(await pagePoint(0.5, 0.55), 700);
await pause(600);

// --- 6. A second text box, top right.
await rayTap(await pagePoint(0.62, 0.1));
await rec.moveHand(HAND_REST);
await lookWhileTyping(700);
await desk.ready();
await desk.type('Quiz on Friday');
await rec.moveHand(HAND_REST);
await rec.moveLeftHand(LEFT_REST);
await rec.lookAt(await pagePoint(0.5, 0.45), 800);
await pause(1600);

// --- 7. Back to Write: the page returns to the tablet, text and handwriting together.
await rec.point('note-bar-mode-write');
await pause(450);
await rec.tap('note-bar-mode-write');
await rec.moveHand(HAND_REST);
await pause(700);
await rec.lookAt({ ...tablet, y: tablet.y - 0.08 }, 1200);
await pause(2500);

const errors = await rec.finish('typing');
console.log(`${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
