/**
 * Checks sticky notes in the headset view (IWER, Quest 3 field of view)
 * and saves screenshots of each step in artifacts/stickies/.
 *
 * Seated at the classroom desk, a new note open and the pen in hand:
 * - pinch the mint stack on the pad with the left hand: a mint sticky note
 *   peels off and floats up in front;
 * - write on it with the pen: its strokes go to the sticky note's own page;
 * - pinch it with the left hand and carry it: brought to the desk it lies
 *   flat on it, face up; let go and it stays; carried to the wall ahead it
 *   sticks flat to the wall, upright; carried into mid-air it floats.
 *
 * Each step asserts the app's state; a failure stops the check with a
 * reason. Usage: dev server running, then `npm run check:stickies`.
 */

import { mkdirSync } from 'node:fs';
import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

const SHOTS = 'artifacts/stickies';
const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
/** Leaning in over the desk, as when writing. */
const LEANING_IN = { x: -1.1, y: 1.17, z: 0.3 };
const FACING_DEG = 90;
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
const LEFT_REST = { x: -0.95, y: 0.8, z: 0.55 };
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
  await r.pause(600);
  // Start from an empty room: no sticky notes from earlier runs.
  await r.page.evaluate(async () => {
    const board = window.__metaNotes.world.globals['metaNotes.stickies'];
    for (const sticky of board.all()) board.remove(sticky.id);
  });
}

const rec = await startHeadsetRecording({ size: { width: 1032, height: 800 }, fovDeg: 96, captions: false, prepare });
const { page, pause } = rec;

const stickies = () =>
  page.evaluate(() =>
    window.__metaNotes.world.globals['metaNotes.stickies'].all().map((s) => ({ id: s.id, kind: s.kind, strokes: s.page.strokes.length })),
  );
const worldOf = (name, lift = 0) =>
  page.evaluate(
    ([n, l]) => {
      const object = window.__metaNotes.world.scene.getObjectByName(n);
      const p = object.getWorldPosition(new object.position.constructor());
      return { x: p.x, y: p.y + l, z: p.z };
    },
    [name, lift],
  );
const shot = async (name) => {
  await pause(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
function expect(condition, message, s) {
  if (!condition) {
    console.log(rec.logs.filter((l) => l.includes('MetaNotes') || l.includes('error')).slice(-12).join('\n'));
    throw new Error(`${message}: ${JSON.stringify(s)}`);
  }
  console.log(`ok - ${message}`);
}

// --- A new note on the desk; lean in; the pen in hand.
await rec.tap('dock-new');
await page.waitForFunction(() => window.__metaNotes.world.getSceneObject('tablet').position.y < 1.2, null, { timeout: 60000 });
const tablet = await worldOf('Tablet');
await rec.moveHead(LEANING_IN);
await rec.lookAt({ ...tablet, x: tablet.x + 0.02, y: tablet.y - 0.1, z: tablet.z + 0.06 }, 400);
await rec.moveLeftHand(LEFT_REST);
await rec.pickUpPen(1000);
await shot('1-pad-beside-tablet');

// --- Pinch the mint stack with the left hand: a mint sticky note peels off.
const mint = await worldOf('StickyPad-mint', 0.01);
await rec.leftPinchAt(mint, 700);
await pause(800);
let list = await stickies();
expect(list.length === 1 && list[0].kind === 'mint', 'pinching the mint stack peels off a mint sticky note', list);
await rec.leftPinch(0);
await rec.moveLeftHand(LEFT_REST);
await shot('2-sticky-peeled-off');

// --- Write on it with the pen.
const stickyName = `Sticky:${list[0].id}`;
await rec.penWrite(layoutLine('Buy milk', { u: 0.1, v: 0.35, size: 0.012, seed: 5 }).strokes, 0.06, stickyName);
await rec.penWrite(layoutLine('+ eggs', { u: 0.1, v: 0.65, size: 0.012, seed: 9 }).strokes, 0.06, stickyName);
list = await stickies();
expect(list[0].strokes > 4, `the pen writes on the sticky note (${list[0].strokes} strokes on its own page)`, list);
const tabletStrokes = await page.evaluate(() => window.__metaNotes.session.active.pages[0].strokes.length);
expect(tabletStrokes === 0, 'the tablet page stays empty', { tabletStrokes });
await rec.lookAt(await worldOf(stickyName), 400);
await shot('3-written-on-sticky');

// --- Phase 2: carry it. Onto the desk, right of the tablet: flat, face up.
/** A sticky note's pose: its position and the direction its face points. */
const pose = (name) =>
  page.evaluate((n) => {
    const object = window.__metaNotes.world.scene.getObjectByName(n);
    const p = object.getWorldPosition(new object.position.constructor());
    const face = new object.position.constructor(0, 0, 1).transformDirection(object.matrixWorld);
    return { position: p.toArray().map((v) => +v.toFixed(3)), face: face.toArray().map((v) => +v.toFixed(2)) };
  }, name);
const carrying = () =>
  page.evaluate(() => !!window.__metaNotes.world.getSystems().find((x) => x.constructor.name === 'StickySystem').carry);
const top = await worldOf(stickyName);
await rec.leftPinchAt({ ...top, y: top.y + 0.04 }, 700);
expect(await carrying(), 'pinching the sticky note picks it up', {});
const onDesk = { x: tablet.x - 0.02, y: tablet.y + 0.05, z: tablet.z - 0.33 };
await rec.moveLeftPinchTo(onDesk, 900);
let p = await pose(stickyName);
expect(p.face[1] > 0.95 && Math.abs(p.position[1] - 0.79) < 0.02, 'over the desk it lies flat on it, face up', p);
await rec.lookAt({ ...onDesk, y: onDesk.y - 0.05 }, 400);
await shot('4-carried-onto-desk');
await rec.leftPinch(0);
expect(!(await carrying()), 'letting go puts it down', {});
await rec.moveLeftHand(LEFT_REST);
await pause(400);
p = await pose(stickyName);
expect(p.face[1] > 0.95, 'it stays on the desk', p);
await shot('5-stuck-on-desk');

// --- To the wall ahead: flat on it, upright, facing back into the room.
const desk = await worldOf(stickyName);
await rec.leftPinchAt({ ...desk, y: desk.y + 0.005 }, 600);
expect(await carrying(), 'picked up again from the desk', {});
await rec.moveLeftPinchTo({ x: -2.86, y: 1.35, z: 0.25 }, 1200);
p = await pose(stickyName);
expect(p.face[0] > 0.95 && Math.abs(p.position[0] + 2.94) < 0.02, 'near the wall it sticks flat to it, facing back into the room', p);
await rec.leftPinch(0);
await rec.lookAt({ x: -2.94, y: 1.3, z: 0.25 }, 600);
await shot('6-stuck-on-wall');

// --- And into mid-air: it floats where it is let go, facing you.
const wall = await worldOf(stickyName);
await rec.leftPinchAt({ ...wall, x: wall.x + 0.005 }, 600);
const midAir = { x: tablet.x + 0.12, y: tablet.y + 0.3, z: tablet.z + 0.15 };
await rec.moveLeftPinchTo(midAir, 1200);
await rec.leftPinch(0);
await rec.moveLeftHand(LEFT_REST);
p = await pose(stickyName);
expect(p.face[0] > 0.3 && p.position[1] > tablet.y + 0.2, 'let go in mid-air, it floats there facing you', p);
await rec.lookAt(await worldOf(stickyName), 500);
await shot('7-floating');

const errors = await rec.finish('stickies');
console.log(`errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
