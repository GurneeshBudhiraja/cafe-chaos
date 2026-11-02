/**
 * The knife demo as a user would do it, recorded as the headset shows it
 * (Quest 3 field of view, no captions), hands only, no controllers:
 *
 * 1. Standing at the table, look down: a knife on the floor.
 * 2. Crouch, reach down and pinch its handle: it comes up in the hand.
 * 3. Stand up, turning it into a proper grip, blade forward, edge down.
 * 4. Over the apple on the board, slice down through it: it falls in two.
 * 5. Set the knife down on the board and let go.
 *
 * Usage: dev server running (`npm run dev`), then `npm run record`.
 * Output: artifacts/knife.mp4
 */

import { startHeadset } from './lib/headset.mjs';

/** Quaternion for a turn of `deg` degrees about a unit axis. */
const turnAbout = (axis, deg) => {
  const r = (deg * Math.PI) / 360;
  return { x: axis[0] * Math.sin(r), y: axis[1] * Math.sin(r), z: axis[2] * Math.sin(r), w: Math.cos(r) };
};
/** The open right hand, palm down, fingers pointing ahead (a hand reaching to pick something up). */
const PALM_DOWN = turnAbout([1, 0, 0], -90);

const STAND = { x: 0.03, y: 1.6, z: 0.02 };
const BOARD_TOP = 0.74 + 0.022;
/** The lowest point of the knife's edge, below the knife's origin (metres). */
const EDGE_DEPTH = 0.036;
/** Cutting, the blade points ahead and a little left (degrees of yaw; 90 is straight ahead). */
const CUT_YAW = 122;
/** From the knife's origin to the middle of its edge, along the blade (metres). */
const EDGE_MIDDLE = 0.15;

const h = await startHeadset({
  record: 'knife',
  async prepare(h) {
    await h.head(STAND, { x: 0.05, y: 0.55, z: -0.6 });
    await h.hand({ x: 0.26, y: 0.84, z: 0.02 }, PALM_DOWN);
    await h.pause(1200);
  },
});
const { pause } = h;
const knife = await h.objectPosition('Knife');
const apple = await h.objectPosition('Apple');
// Along the cutting blade (unit vector, in plan), to place its edge's middle on the apple.
const yaw = (CUT_YAW * Math.PI) / 180;
const blade = { x: Math.cos(yaw), z: -Math.sin(yaw) };
const bladeOver = (centre, along, y) => ({ x: centre.x - blade.x * along, y, z: centre.z - blade.z * along });

// --- 1. At the table: an apple on the board. Then down at the floor: the knife.
await pause(1300);
await h.head(STAND, { x: knife.x - 0.05, y: 0.05, z: knife.z - 0.08 }, 1100);
await pause(500);

// --- 2. Crouch beside it, reach down and pinch the handle.
const CROUCH = { x: 0.2, y: 0.95, z: 0.14 };
// The hand reaches as the body goes down (so it never passes the face).
await Promise.all([
  h.head(CROUCH, { x: knife.x - 0.03, y: 0.0, z: knife.z - 0.03 }, 1500),
  h.hand({ x: knife.x + 0.02, y: 0.16, z: knife.z + 0.06 }, PALM_DOWN, 1300),
]);
await h.hand({ x: knife.x, y: knife.y + 0.028, z: knife.z }, PALM_DOWN, 650);
await pause(200);
await h.pinch(1);
await h.noteHold('Knife');
await pause(350);

// --- 3. Up it comes; stand, turning it into a cutting grip.
await h.carry({ x: knife.x - 0.02, y: 0.2, z: knife.z - 0.01 }, { yaw: 180, pitch: 0, roll: -65 }, 500);
const ready = bladeOver(apple, EDGE_MIDDLE - 0.06, 1.1);
ready.x += 0.06;
ready.z += 0.12;
await Promise.all([
  h.head({ x: 0.04, y: 1.5, z: -0.12 }, { x: 0.04, y: 0.95, z: -0.5 }, 1500),
  h.carry(ready, { yaw: CUT_YAW, pitch: 14, roll: 0 }, 1500),
]);
// A look at the blade: the wrist turns it to the light and back.
await h.carry({ ...ready, y: ready.y + 0.02 }, { yaw: CUT_YAW - 25, pitch: 6, roll: -40 }, 650);
await h.carry(ready, { yaw: CUT_YAW, pitch: 8, roll: 0 }, 600);
await pause(250);

// --- 4. Over the apple, then slice down through it.
// Lean in over the board, as you do to cut.
await h.head({ x: 0.05, y: 1.22, z: -0.28 }, { x: apple.x, y: apple.y, z: apple.z + 0.02 }, 1000);
// The edge's middle over the apple, a few centimetres above its top.
const over = bladeOver(apple, EDGE_MIDDLE + 0.03, apple.y + 0.04 + 0.03 + EDGE_DEPTH);
await h.carry(over, { yaw: CUT_YAW, pitch: 4, roll: 0 }, 900);
await pause(350);
// Down to the board, pushing forward along the blade as a knife does.
await h.carry(bladeOver(apple, EDGE_MIDDLE - 0.02, BOARD_TOP + EDGE_DEPTH + 0.002), { yaw: CUT_YAW, pitch: 0, roll: 0 }, 700);
await pause(900);
// Lift the knife off: the two halves on the board.
await h.carry(bladeOver({ x: apple.x + 0.05, z: apple.z + 0.06 }, EDGE_MIDDLE, BOARD_TOP + 0.17), { yaw: CUT_YAW, pitch: 10, roll: 0 }, 650);
await pause(1400);

// --- 5. Lay it along the front of the board and let go.
await h.carry({ x: apple.x + 0.06, y: BOARD_TOP + 0.04, z: apple.z + 0.095 }, { yaw: 180, pitch: 0, roll: -70 }, 1000);
await pause(150);
await h.pinch(0);
// The hand drops back to the side; a last look at the board.
await h.hand({ x: apple.x + 0.16, y: BOARD_TOP + 0.12, z: apple.z + 0.3 }, PALM_DOWN, 450);
await h.hand({ x: 0.26, y: 0.84, z: 0.0 }, PALM_DOWN, 600);
await h.head({ x: 0.05, y: 1.28, z: -0.24 }, { x: apple.x, y: apple.y - 0.02, z: apple.z + 0.02 }, 800);
await pause(1600);

const cut = await h.page.evaluate(() => !!window.__knife.world.scene.getObjectByName('AppleHalfA'));
const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; speed-up x${h.speedUp.toFixed(2)}; apple cut: ${cut}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
