/**
 * Checks sticky notes in the headset view (IWER, Quest 3 field of view)
 * and saves screenshots of each step in artifacts/stickies/.
 *
 * Seated at the classroom desk, a new note open and the pen in hand:
 * - pinch the mint stack on the pad with the left hand: a mint sticky note
 *   peels off and floats up in front;
 * - write on it with the pen: its strokes go to the sticky note's own page.
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

const errors = await rec.finish('stickies');
console.log(`errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
