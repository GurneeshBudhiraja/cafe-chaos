/**
 * Checks the tool wheel in the headset view (IWER, Quest 3 field of view)
 * and saves screenshots of each step in artifacts/tool-wheel/.
 *
 * Seated at the classroom desk (as in record-desk.mjs): open a new note,
 * pick up the pen, write, then:
 * - double-tap the pen: the wheel opens in front of the nib;
 * - move the nib toward Marker: it is aimed at (raised, named on the hub);
 * - tap: Marker becomes the current tool (its clay rim);
 * - aim at the hub and tap: the wheel closes; the pen is still in hand;
 * - pinch with the free (left) hand: it opens; aim at Highlighter and let
 *   go: Highlighter is picked; pinch and let go over the hub: it closes.
 *
 * Each step asserts the app's state, so a failure stops the check with a
 * reason. Usage: dev server running, then `node scripts/check-tool-wheel.mjs`.
 * Also writes artifacts/tool-wheel.mp4 (the whole run, headset view).
 */

import { mkdirSync } from 'node:fs';
import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

const SHOTS = 'artifacts/tool-wheel';
const WHEEL_ITEMS = ['pen', 'marker', 'highlighter', 'eraser', 'lasso', 'undo', 'redo'];
/** How far from the aim origin to move the nib to aim at a segment (wheel asset metres; ring is 0.046 to 0.1). */
const AIM_REACH = 0.075;
/** Seated at the emulated room's desk-height table, facing it (see record-desk.mjs). */
const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const FACING_DEG = 90;
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
const CLASSROOM_ORIGIN = { x: -1.045, z: 0.28 };

mkdirSync(SHOTS, { recursive: true });

async function prepare(r) {
  await r.page.evaluate(
    ([origin, yaw, height]) => window.__metaNotes.demo.showClassroom(origin, yaw, height),
    [CLASSROOM_ORIGIN, FACING_DEG, TABLE_HEIGHT_M],
  );
  await r.moveHead(SEAT);
  await r.moveHand(HAND_REST);
  await r.turnHead(FACING_DEG, 0, 100);
  await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
  await r.pause(800);
}

const rec = await startHeadsetRecording({ size: { width: 1032, height: 800 }, fovDeg: 96, captions: false, prepare });
const { page, pause } = rec;

/** The app's state this check reads. */
const state = () =>
  page.evaluate(() => {
    const { world } = window.__metaNotes;
    const tools = world.globals['metaNotes.tools'];
    const pen = world.globals['metaNotes.pen'];
    const wheel = world.getSystems().find((s) => s.constructor.name === 'ToolWheelSystem');
    return {
      tool: tools?.tool,
      wheelOpen: tools?.wheelOpen,
      penHeld: pen?.held,
      hovered: wheel?.hovered ?? null,
      wheelVisible: wheel?.wheel?.visible,
    };
  });

/** World point for the nib to aim at item `name` (or the hub for null), on the open wheel. */
const aimPoint = (name) =>
  page.evaluate(
    ([index, count, reach]) => {
      const { world } = window.__metaNotes;
      const system = world.getSystems().find((s) => s.constructor.name === 'ToolWheelSystem');
      const local = system.aimOrigin.clone();
      if (index >= 0) {
        const angle = Math.PI / 2 - (index * Math.PI * 2) / count;
        local.x += Math.cos(angle) * reach;
        local.y += Math.sin(angle) * reach;
      }
      const p = system.wheel.localToWorld(local);
      return { x: p.x, y: p.y, z: p.z };
    },
    [name ? WHEEL_ITEMS.indexOf(name) : -1, WHEEL_ITEMS.length, AIM_REACH],
  );

const shot = async (name) => {
  await pause(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

function expect(condition, message, s) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(s)}`);
  console.log(`ok - ${message}`);
}

// --- Open a new note on the desk, pick up the pen and write a little.
await rec.tap('dock-new');
await pause(1600);
const tablet = await page.evaluate(() => {
  const p = window.__metaNotes.world.getSceneObject('tablet').position;
  return { x: p.x, y: p.y, z: p.z };
});
await rec.lookAt({ ...tablet, x: tablet.x - 0.02 }, 800);
await rec.pickUpPen(1200);
await rec.penWrite(layoutLine('Notes', { u: 0.1, v: 0.2, size: 0.0028, seed: 3 }).strokes);
await pause(300);

// --- Double-tap the pen: the wheel opens in front of the nib.
await rec.penTap(2);
let s = await state();
expect(s.wheelOpen && s.penHeld, 'double-tap opens the wheel, pen still in hand', s);
await shot('1-double-tap-opens');

// --- Aim at Marker, then tap to pick it.
await rec.moveNibTo(await aimPoint('marker'), 500);
s = await state();
expect(WHEEL_ITEMS[s.hovered] === 'marker', 'moving the nib aims at Marker', s);
await shot('2-aim-marker');
await rec.penTap(1);
s = await state();
expect(s.tool === 'marker' && s.wheelOpen, 'a tap picks Marker; the wheel stays open', s);
await shot('3-marker-picked');

// --- Back to the hub and tap: the wheel closes.
await rec.moveNibTo(await aimPoint(null), 400);
await rec.penTap(1);
await pause(400);
s = await state();
expect(!s.wheelOpen && s.penHeld && s.tool === 'marker', 'a tap on the hub closes the wheel; pen still held', s);
await shot('4-hub-closes');

// --- The free left hand: pinch to open, aim at Highlighter, let go to pick.
const leftInView = await page.evaluate((t) => ({ x: t.x + 0.05, y: t.y + 0.22, z: t.z - 0.25 }), tablet);
await rec.moveLeftHand(leftInView);
await rec.leftPinch(1);
s = await state();
expect(s.wheelOpen, 'a free-hand pinch opens the wheel', s);
await rec.moveNibTo(await aimPoint('highlighter'), 500);
await shot('5-free-hand-aim-highlighter');
await rec.leftPinch(0);
s = await state();
expect(s.tool === 'highlighter' && s.wheelOpen, 'letting go of the pinch picks Highlighter', s);
await shot('6-highlighter-picked');
await rec.moveNibTo(await aimPoint(null), 400);
await rec.leftPinch(1);
await rec.leftPinch(0);
await pause(400);
s = await state();
expect(!s.wheelOpen && s.penHeld, 'pinch and let go over the hub closes the wheel', s);

// --- Writing again works, and putting the pen down still lets go.
await rec.putDownPen();
s = await state();
expect(!s.penHeld, 'opening the fingers for a moment puts the pen down', s);
await shot('7-pen-down');

const errors = await rec.finish('tool-wheel');
console.log(`errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
