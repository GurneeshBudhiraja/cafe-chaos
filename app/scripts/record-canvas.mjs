/**
 * The infinite canvas, start to end, as the headset shows it (Quest 3 field
 * of view, no captions), seated at the classroom desk:
 *
 * 1. New note: a dotted canvas on the desk, straight away. Pick up the pen
 *    and write a heading and a line.
 * 2. With the pen in hand, the free hand pinches the page and slides it:
 *    the canvas pans to empty space on the right; write there.
 * 3. Pen down. Both hands pinch the page and push together: zoom out to see
 *    both parts; the readout shows the zoom. Pull apart over the new part:
 *    zoom in close.
 * 4. Tap the zoom readout: the view glides back home.
 * 5. Type: the floating page pans by hand too; type in a box out on the
 *    canvas. Back to Write: the tablet shows the view where you left it.
 *
 * Usage: dev server running, then `npm run record:canvas`. Output: artifacts/canvas.mp4
 */

import { handGrab } from './lib/hand-grab.mjs';
import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

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
const grab = handGrab(rec);

const worldOf = (name) =>
  page.evaluate((n) => {
    const object = window.__metaNotes.world.scene.getObjectByName(n);
    const p = object.getWorldPosition(new object.position.constructor());
    return { x: p.x, y: p.y, z: p.z };
  }, name);
const pagePoint = (u, v) => page.evaluate(([a, b]) => window.__metaNotes.demo.pagePoint(a, b), [u, v]);
/** Type as Meta's keyboard does: one input event per key, at a typing pace. */
async function typeText(text) {
  for (const char of text) {
    await page.evaluate((c) => {
      const field = document.activeElement;
      if (field?.tagName !== 'TEXTAREA') return;
      field.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: c, bubbles: true }));
    }, char);
    await pause(110);
  }
}
/** Pinch the page with one hand at page point `from` and slide it to `to`. */
async function slide(hand, from, to, ms) {
  await grab.move(hand, await pagePoint(...from), 500);
  await grab.pinch(hand, 1);
  await pause(200);
  await grab.move(hand, await pagePoint(...to), ms);
  await pause(200);
  await grab.pinch(hand, 0);
}
/** Both hands pinch the page at their `from` points and move to their `to` points together. */
async function twoHands(leftFrom, rightFrom, leftTo, rightTo, ms) {
  await Promise.all([grab.move('left', await pagePoint(...leftFrom), 600), grab.move('right', await pagePoint(...rightFrom), 600)]);
  await grab.pinch('left', 1);
  await grab.pinch('right', 1);
  await pause(250);
  const [l, r] = [await pagePoint(...leftTo), await pagePoint(...rightTo)];
  await Promise.all([grab.move('left', l, ms), grab.move('right', r, ms)]);
  await pause(250);
  await grab.pinch('left', 0);
  await grab.pinch('right', 0);
}

// --- 1. New note (straight to the page); write a heading and a line.
await pause(800);
await rec.point('dock-new');
await pause(400);
await rec.tap('dock-new');
await rec.moveHand(HAND_REST);
await page.waitForFunction(() => window.__metaNotes.world.getSceneObject('tablet').position.y < 1.2, null, { timeout: 60000 });
await pause(1000);
const tablet = await worldOf('Tablet');
await rec.moveHead(LEANING_IN);
await rec.lookAt({ ...tablet, y: tablet.y - 0.1 }, 1200);
// The hands' pinch points, measured where a pinch takes nothing.
await grab.measure('left');
await rec.pickUpPen(1200);
await rec.penWrite(layoutLine('Mitosis', { u: 0.08, v: 0.16, size: 0.0036, seed: 2 }).strokes);
await rec.penWrite(layoutLine('one cell, two', { u: 0.1, v: 0.36, size: 0.0026, seed: 6 }).strokes);
await pause(400);

// --- 2. The free hand slides the page: the canvas pans; write in the new space.
await slide('left', [0.75, 0.55], [0.2, 0.55], 1400);
await grab.move('left', LEFT_REST, 600);
await pause(400);
const strokesBefore = await page.evaluate(() => window.__metaNotes.session.active.pages[0].strokes.length);
await rec.penWrite(layoutLine('Meiosis', { u: 0.2, v: 0.2, size: 0.0036, seed: 9 }).strokes);
await rec.penWrite(layoutLine('four cells', { u: 0.22, v: 0.4, size: 0.0026, seed: 11 }).strokes);
await pause(400);
await rec.putDownPen();
await rec.moveHand(HAND_REST);
// Aim the right hand's ray up, off the page, so the measuring pinch draws nothing.
await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('look_at', { device: 'hand-right', target: { x: -1.6, y: 2.6, z: 0.6 } }));
await grab.measure('right');
await pause(400);

// --- 3. Both hands: push together to zoom out and see both; pull apart over "Meiosis" to zoom in.
await twoHands([0.3, 0.55], [0.7, 0.55], [0.4, 0.55], [0.6, 0.55], 1400);
await grab.move('left', LEFT_REST, 500);
await rec.moveHand(HAND_REST);
await pause(900);
await rec.lookAt(await rec.objectCenter('note-bar-zoom'), 700);
await pause(700);
await rec.lookAt({ ...tablet, y: tablet.y - 0.1 }, 700);
// Where "Meiosis" and its line are on the page now (they were written after the pan).
const meiosis = await page.evaluate((from) => {
  const { session } = window.__metaNotes;
  const strokes = session.active.pages[0].strokes.slice(from);
  const xs = strokes.flatMap((s) => s.points.filter((_, i) => i % 2 === 0));
  const ys = strokes.flatMap((s) => s.points.filter((_, i) => i % 2 === 1));
  const view = session.getView();
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { u: (cx - view.x) * view.zoom + 0.5, v: (cy - view.y) * view.zoom + 0.5 };
}, strokesBefore);
const near = (du) => [Math.min(0.95, Math.max(0.05, meiosis.u + du)), Math.min(0.9, Math.max(0.1, meiosis.v))];
await twoHands(near(-0.06), near(0.06), near(-0.2), near(0.2), 1500);
await grab.move('left', LEFT_REST, 500);
await rec.moveHand(HAND_REST);
await pause(1200);

// --- 4. The zoom readout: back home.
await rec.point('note-bar-zoom');
await pause(450);
await rec.tap('note-bar-zoom');
await rec.moveHand(HAND_REST);
await pause(1500);

// --- 5. Type mode: the floating page pans by hand too; type out on the canvas; back to Write.
await rec.point('note-bar-mode-type');
await pause(400);
await rec.tap('note-bar-mode-type');
await rec.moveHand(HAND_REST);
await pause(1000);
await rec.lookAt(await pagePoint(0.5, 0.5), 900);
await pause(600);
await slide('left', [0.3, 0.7], [0.3, 0.35], 1300);
await grab.move('left', LEFT_REST, 500);
await pause(400);
// Tap low on the page (empty canvas now) and type there.
const spot = await pagePoint(0.12, 0.62);
await page.evaluate((p) => window.IWER_DEVICE.remote.dispatch('look_at', { device: 'hand-right', target: p }), spot);
await pause(450);
await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_select_value', { device: 'hand-right', value: 1 }));
await pause(220);
await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_select_value', { device: 'hand-right', value: 0 }));
await pause(300);
await rec.moveHand(HAND_REST);
await typeText('Both start from one cell.');
await pause(1200);
await rec.point('note-bar-mode-write');
await pause(400);
await rec.tap('note-bar-mode-write');
await rec.moveHand(HAND_REST);
await pause(800);
await rec.lookAt({ ...tablet, y: tablet.y - 0.1 }, 1200);
await pause(2500);

const errors = await rec.finish('canvas');
console.log(`${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
