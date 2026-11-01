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
const WHEEL_SCALE = 0.85;
/** The options ring (tool-options-ring.ts): its radius (wheel asset metres) and spacing. */
const OPTIONS_RADIUS = 0.118;
const OPTIONS_SPACING_DEG = 22;
/** How far to slide the nib over the page to aim at a segment (metres; the hub is the first 3.9 cm). */
const AIM_REACH = 0.06;
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
      strokes: window.__metaNotes.session.active?.pages[0].strokes.length ?? 0,
    };
  });

/** World point for the nib to aim in direction `angleDeg` (null: the hub), sliding `reach` metres over the page. */
const aimToward = (angleDeg, reach) =>
  page.evaluate(
    ([deg, distance]) => {
      const { world } = window.__metaNotes;
      const system = world.getSystems().find((s) => s.constructor.name === 'ToolWheelSystem');
      const local = system.aimOrigin.clone();
      if (deg !== null) {
        local.x += Math.cos((deg * Math.PI) / 180) * distance;
        local.y += Math.sin((deg * Math.PI) / 180) * distance;
      }
      const p = system.surface.localToWorld(local);
      return { x: p.x, y: p.y, z: p.z };
    },
    [angleDeg, reach],
  );
/** Aim at wheel item `name` (null: the hub). */
const aimPoint = (name) => aimToward(name ? 90 - (WHEEL_ITEMS.indexOf(name) * 360) / WHEEL_ITEMS.length : null, AIM_REACH);
const OPTIONS_REACH = OPTIONS_RADIUS * WHEEL_SCALE;
/** Aim at colour `index` of `count` on the options ring (above the wheel). */
const aimSwatch = (index, count) => aimToward(90 + ((count - 1) / 2 - index) * OPTIONS_SPACING_DEG, OPTIONS_REACH);
/** Aim at a size on the options ring (below the wheel). */
const aimSize = (size) => aimToward(270 - (1 - ['fine', 'medium', 'bold'].indexOf(size)) * OPTIONS_SPACING_DEG, OPTIONS_REACH);
/** The newest stroke on the page. */
const lastStroke = () =>
  page.evaluate(() => {
    const strokes = window.__metaNotes.session.active.pages[0].strokes;
    const s = strokes[strokes.length - 1];
    return { tool: s.tool, color: s.color, width: s.width };
  });
/** Lift the nib off the page (as when pausing to change tools). */
const liftPen = async () =>
  rec.moveNibTo(
    await page.evaluate(() => {
      const n = window.__metaNotes.world.globals['metaNotes.pen'].nib;
      return { x: n.x, y: n.y + 0.04, z: n.z };
    }),
    400,
  );
/** Open the wheel with a double-tap (unless it is open), aim at each target in turn and tap to pick it. */
const pickOnWheel = async (...targets) => {
  if (!(await state()).wheelOpen) await rec.penTap(2);
  for (const target of targets) {
    await rec.moveNibTo(await target(), 450);
    await rec.penTap(1);
  }
};

/** A full headset view, and a close-up of its middle (where the wheel is looked at). */
const shot = async (name) => {
  await pause(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  const { width, height } = page.viewportSize();
  const w = 420;
  const h = 300;
  await page.screenshot({ path: `${SHOTS}/${name}-closeup.png`, clip: { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h } });
};
/** Look at the open wheel, as one would to pick from it. */
const lookAtWheel = async () => {
  const centre = await page.evaluate(() => {
    const system = window.__metaNotes.world.getSystems().find((s) => s.constructor.name === 'ToolWheelSystem');
    const p = system.wheel.position;
    return { x: p.x, y: p.y, z: p.z };
  });
  await rec.lookAt(centre, 500);
};

function expect(condition, message, s) {
  if (!condition) {
    console.log(rec.logs.filter((l) => l.includes('MetaNotes:pen') || l.includes('error')).slice(-12).join('\n'));
    throw new Error(`${message}: ${JSON.stringify(s)}`);
  }
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

// --- Lift the pen off the page, as one does to change tools, and double-tap it.
const nibNow = await page.evaluate(() => {
  const n = window.__metaNotes.world.globals['metaNotes.pen'].nib;
  return { x: n.x, y: n.y + 0.04, z: n.z };
});
await rec.moveNibTo(nibNow, 400);
await rec.penTap(2);
let s = await state();
expect(s.wheelOpen && s.penHeld, 'double-tap opens the wheel, pen still in hand', s);
await lookAtWheel();
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

// --- Open it again, then just write: touching the page puts the wheel away and inks.
await rec.penTap(2);
s = await state();
expect(s.wheelOpen, 'double-tap opens the wheel again', s);
const strokesBefore = s.strokes;
await rec.penWrite(layoutLine('ok', { u: 0.4, v: 0.3, size: 0.0028, seed: 4 }).strokes);
s = await state();
expect(!s.wheelOpen && s.strokes > strokesBefore, 'writing again closes the wheel and inks', s);
await liftPen();

// --- The free left hand: pinch to open, aim at Highlighter, let go to pick.
const leftInView = await page.evaluate((t) => ({ x: t.x + 0.05, y: t.y + 0.22, z: t.z - 0.25 }), tablet);
await rec.moveLeftHand(leftInView);
await rec.leftPinch(1);
s = await state();
expect(s.wheelOpen, 'a free-hand pinch opens the wheel', s);
await lookAtWheel();
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

// --- Phase 2: the options ring. Marker in Clay, bold; then write.
await liftPen();
await rec.penTap(2);
await lookAtWheel();
await rec.moveNibTo(await aimPoint('marker'), 450);
await rec.penTap(1);
await rec.moveNibTo(await aimSwatch(2, 5), 450);
s = await state();
await shot('8-options-ring-aim-clay');
await rec.penTap(1);
await rec.moveNibTo(await aimSize('bold'), 450);
await rec.penTap(1);
await shot('9-marker-clay-bold-chosen');
s = await state();
expect(s.tool === 'marker' && s.wheelOpen, 'marker, then Clay and Bold from the ring; the wheel stays open', s);
await rec.penWrite(layoutLine('Cells', { u: 0.1, v: 0.42, size: 0.004, seed: 6 }).strokes);
let stroke = await lastStroke();
expect(stroke.tool === 'marker' && stroke.color === '#d4704f' && stroke.width === 0.015, 'the marker writes in clay, bold', stroke);

// --- Highlighter in Pink over the marker writing, then back to the pen.
await liftPen();
await pickOnWheel(() => aimPoint('highlighter'), () => aimSwatch(1, 4));
await rec.penWrite([[[0.08, 0.425], [0.3, 0.425]]]);
stroke = await lastStroke();
expect(stroke.tool === 'highlighter' && stroke.color === '#f0a3b8', 'the highlighter draws in pink', stroke);
await liftPen();
await pickOnWheel(() => aimPoint('pen'));
await rec.penWrite(layoutLine('divide', { u: 0.1, v: 0.55, size: 0.003, seed: 8 }).strokes);
stroke = await lastStroke();
expect(stroke.tool === 'pen' && stroke.color === '#1f1c19', 'the pen keeps its own ink colour', stroke);
await liftPen();
await rec.lookAt(tablet, 600);
await shot('10-page-marker-highlighter-pen');
// Lean in over the page, as one does to read it, for a close look at the ink.
const page40 = await page.evaluate(() => {
  const s = window.__metaNotes.world.scene.getObjectByName('WritingSurface');
  const { width, height } = s.geometry.parameters;
  const p = s.localToWorld(new s.position.constructor((0.2 - 0.5) * width, (0.5 - 0.48) * height, 0));
  return { x: p.x, y: p.y, z: p.z };
});
await rec.moveHead({ x: page40.x + 0.12, y: page40.y + 0.3, z: page40.z });
await rec.lookAt(page40, 400);
await shot('11-ink-close');
await rec.moveHead(SEAT);
await rec.lookAt(tablet, 400);

// --- Phase 3: the eraser, undo and redo.
/** World point over page point (u, v), `lift` metres above the page. */
const overPage = (u, v, lift) =>
  page.evaluate(
    ([pu, pv, l]) => {
      const s = window.__metaNotes.world.scene.getObjectByName('WritingSurface');
      const { width, height } = s.geometry.parameters;
      const p = s.localToWorld(new s.position.constructor((pu - 0.5) * width, (0.5 - pv) * height, l));
      return { x: p.x, y: p.y, z: p.z };
    },
    [u, v, lift],
  );
/** Lean in over page point (u, v) for a close look, then sit back. */
const closeLook = async (name, u = 0.2, v = 0.48) => {
  const at = await overPage(u, v, 0);
  await rec.moveHead({ x: at.x + 0.12, y: at.y + 0.3, z: at.z });
  await rec.lookAt(at, 400);
  await shot(name);
  await rec.moveHead(SEAT);
  await rec.lookAt(tablet, 400);
};
await liftPen();
await pickOnWheel(() => aimPoint('eraser'), () => aimSize('bold'), () => aimPoint(null));
s = await state();
expect(s.tool === 'eraser' && !s.wheelOpen, 'the eraser is picked, bold; the hub closes the wheel', s);
await rec.moveNibTo(await overPage(0.18, 0.42, 0.012), 500);
const ring = await page.evaluate(() => window.__metaNotes.world.scene.getObjectByName('EraserCursor')?.visible);
expect(ring === true, 'the eraser ring shows under the hovering nib', { ring });
await closeLook('12-eraser-ring', 0.18, 0.42);
const beforeErase = (await state()).strokes;
await rec.penWrite([[[0.08, 0.41], [0.32, 0.41]]], 0.06);
s = await state();
expect(s.strokes < beforeErase, `rubbing across "Cells" erases it (${beforeErase} -> ${s.strokes} strokes)`, s);
await liftPen();
await closeLook('13-cells-erased');

// Undo brings it back; redo erases it again; undo once more.
await pickOnWheel(() => aimPoint('undo'), () => aimPoint(null));
s = await state();
expect(s.strokes === beforeErase && !s.wheelOpen, 'undo brings the erased strokes back', s);
await closeLook('14-undo-brings-back');
await liftPen();
await pickOnWheel(() => aimPoint('redo'));
s = await state();
expect(s.strokes < beforeErase, 'redo erases them again', s);
await pickOnWheel(() => aimPoint('undo'), () => aimPoint('pen'), () => aimPoint(null));
s = await state();
expect(s.strokes === beforeErase && s.tool === 'pen' && !s.wheelOpen, 'undo restores them; back to the pen', s);

// Undo also takes back the last thing written.
const beforeWrite = s.strokes;
await rec.penWrite([[[0.6, 0.7], [0.7, 0.75]]]);
await liftPen();
await pickOnWheel(() => aimPoint('undo'), () => aimPoint(null));
s = await state();
expect(s.strokes === beforeWrite && !s.wheelOpen, 'undo takes back a stroke just written', { ...s, beforeWrite });

// --- Phase 4: the lasso. Loop around "Cells", drag it lower, undo; delete it, undo.
/** The lasso's selection and where the first selected stroke starts (page units). */
const selection = () =>
  page.evaluate(() => {
    const { world, session } = window.__metaNotes;
    const ink = world.getSystems().find((x) => x.constructor.name === 'InkSystem');
    const lasso = [...ink.tablets.values()][0].lasso;
    const first = session.active.pages[0].strokes.find((st) => lasso.ids.has(st.id));
    return { count: lasso.ids.size, ids: [...lasso.ids], at: first ? [first.points[0], first.points[1]] : null };
  });
const strokeStart = (id) =>
  page.evaluate((i) => {
    const st = window.__metaNotes.session.active.pages[0].strokes.find((x) => x.id === i);
    return st ? [st.points[0], st.points[1]] : null;
  }, id);
await liftPen();
await pickOnWheel(() => aimPoint('lasso'), () => aimPoint(null));
s = await state();
expect(s.tool === 'lasso' && !s.wheelOpen, 'the lasso is picked', s);
// A loose loop around "Cells" (and its highlight), clear of the writing below it.
const loop = [];
for (let i = 0; i <= 28; i++) {
  const a = (i / 28) * Math.PI * 2;
  loop.push([0.2 + Math.cos(a) * 0.15, 0.415 + Math.sin(a) * 0.075]);
}
await rec.penWrite([loop], 0.08);
let sel = await selection();
expect(sel.count > 0, `the loop selects the strokes inside it (${sel.count})`, sel);
await liftPen();
await closeLook('15-lasso-selected', 0.2, 0.45);
const firstId = sel.ids[0];
const startBefore = await strokeStart(firstId);
await rec.penWrite([[[0.2, 0.42], [0.45, 0.7]]], 0.06);
const startAfter = await strokeStart(firstId);
const moved = [startAfter[0] - startBefore[0], startAfter[1] - startBefore[1]];
expect(Math.abs(moved[0] - 0.25) < 0.03 && Math.abs(moved[1] - 0.28) < 0.03, `dragging inside the box moves it (${moved.map((m) => m.toFixed(3))})`, { moved });
sel = await selection();
expect(sel.count > 0, 'the moved strokes stay selected', sel);
await liftPen();
await closeLook('16-lasso-moved', 0.4, 0.62);
await pickOnWheel(() => aimPoint('undo'), () => aimPoint(null));
const startUndone = await strokeStart(firstId);
expect(Math.abs(startUndone[0] - startBefore[0]) < 1e-9 && Math.abs(startUndone[1] - startBefore[1]) < 1e-9, 'undo puts the moved strokes back', { startUndone, startBefore });
// Delete, from the lasso's options ring (below the wheel).
const beforeDelete = (await state()).strokes;
sel = await selection();
await liftPen();
await rec.penTap(2);
await lookAtWheel();
await rec.moveNibTo(await aimToward(270, OPTIONS_REACH), 450);
await shot('17-lasso-delete-option');
await rec.penTap(1);
await rec.moveNibTo(await aimPoint(null), 300);
await rec.penTap(1);
s = await state();
expect(s.strokes === beforeDelete - sel.count && !s.wheelOpen, `Delete removes the selection (${beforeDelete} -> ${s.strokes})`, s);
await closeLook('18-lasso-deleted', 0.2, 0.45);
await pickOnWheel(() => aimPoint('undo'), () => aimPoint('pen'), () => aimPoint(null));
s = await state();
expect(s.strokes === beforeDelete && s.tool === 'pen', 'undo brings the deleted strokes back; back to the pen', s);

// --- Writing again works, and putting the pen down still lets go.
await rec.putDownPen();
s = await state();
expect(!s.penHeld, 'opening the fingers for a moment puts the pen down', s);
await shot('7-pen-down');

const errors = await rec.finish('tool-wheel');
console.log(`errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
