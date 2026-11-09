/**
 * The dock in use, recorded as the headset shows it (Quest 3 field of
 * view, no captions): the viewer sits at the table, the café pops up with
 * its dock, and the right hand reaches out and pokes Bigger twice, Turn,
 * then Smaller; pinches the Move handle and carries the café nearer; and
 * pokes Reset to put it back. A last look over the café.
 *
 * Usage: dev server running (`npm run dev`), then `npm run record:dock`.
 * Output: artifacts/dock.mp4
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const TABLE = { x: -1.3, y: 0.79, z: 0.28 };
const LAP = { left: [-0.7, 0.85, 0.42], right: [-0.7, 0.85, 0.14] };
const Q = { x: 0, y: 0, z: 0, w: 1 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
/** The fingertip and the pinch point relative to the right hand's pose (measured in prepare). */
const offset = { tip: [0, 0, 0], pinch: [0, 0, 0] };
let page;

const h = await startHeadset({
  record: 'dock',
  maxSpeedUp: 30,
  async prepare(h) {
    page = h.page;
    await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z });
    for (const hand of ['left', 'right']) await handTo(hand, LAP[hand]);
    await frames(3);
    offset.tip = add(await page.evaluate(() => window.__cafe.dock.tips.right.point.toArray()), LAP.right, -1);
    await pinch(1);
    await frames(3);
    offset.pinch = add(await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray()), LAP.right, -1);
    await pinch(0);
    await page.evaluate((timeScale) => {
      window.__cafe.system.timeScale = timeScale;
      window.__cafe.system.replace();
    }, 1 / h.speedUp);
  },
});
const { pause } = h;

function send(m, p) {
  return page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
}
function frames(n) {
  return page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const info = window.__cafe.world.renderer.info.render;
        const target = info.frame + n;
        const t = setInterval(() => {
          if (info.frame >= target) {
            clearInterval(t);
            resolve();
          }
        }, 8);
      }),
    n,
  );
}
function handTo(hand, p) {
  return send('set_transform', { device: `hand-${hand}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
}
function pinch(value) {
  return send('set_select_value', { device: 'hand-right', value });
}
/** Move the right hand so that its fingertip (`by` 'tip') or pinch point ('pinch') travels from `from` to `to` over `ms`, eased. */
async function reach(ms, from, to, by = 'tip') {
  const real = ms * h.speedUp;
  const t0 = performance.now();
  for (;;) {
    const t = Math.min(1, (performance.now() - t0) / real);
    await handTo('right', add(lerp(from, to, ease(t)), offset[by], -1));
    if (t >= 1) return;
    await frames(1);
  }
}
const tile = (action) =>
  page.evaluate((action) => {
    const t = window.__cafe.dock.dock.tiles.find((t) => t.action === action);
    const V = t.mesh.position.constructor;
    return { at: t.mesh.getWorldPosition(new V()).toArray(), normal: new V(0, 0, 1).transformDirection(t.mesh.matrixWorld).toArray() };
  }, action);
const cafeAt = () => page.evaluate(() => window.__cafe.system.cafe.position.toArray());
/** Where the fingertip rests between pokes: 9 cm out from the tile. */
let rest = null;
/** Poke a tile: come to 9 cm in front of it, press through its face, draw back to 9 cm. */
async function poke(action, ms = 700) {
  const t = await tile(action);
  const out = add(t.at, t.normal, 0.09);
  const inn = add(t.at, t.normal, -0.003);
  await reach(ms, rest ?? LAP.right, out);
  await reach(450, out, inn);
  await pause(150);
  await reach(400, inn, out);
  rest = out;
}

// 1. Seated; the café pops up with its dock, the room dims and the lamps come up.
await pause(6500);

// 2. Bigger, twice; Turn; Smaller.
await poke('bigger', 1300);
await pause(700);
await poke('bigger');
await pause(900);
await poke('turn');
await pause(1100);
await poke('smaller');
await pause(900);

// 3. The Move handle: pinch it and carry the café nearer, set it down.
{
  const t = await tile('move');
  const at = add(t.at, t.normal, 0.012);
  await reach(900, rest, at, 'pinch');
  await pause(300);
  await pinch(1);
  await pause(350);
  const lifted = add(at, [0.1, 0.07, -0.08]);
  await reach(1800, at, lifted, 'pinch');
  await pause(500);
  const down = [lifted[0], at[1], lifted[2]];
  await reach(1300, lifted, down, 'pinch');
  await pause(300);
  await pinch(0);
  await pause(400);
  rest = add(down, [0, 0.06, 0.04]);
  await reach(700, down, rest, 'pinch');
}
await pause(900);

// 4. Reset, and the hand goes back to the lap.
await poke('reset', 1000);
await pause(400);
await reach(1000, rest, LAP.right);
await pause(1500);

// 5. A look over the café, and back to the seat.
const c = await cafeAt();
await h.head({ x: c[0] + 0.45, y: c[1] + 0.32, z: c[2] - 0.12 }, { x: c[0], y: c[1] + 0.05, z: c[2] }, 1800);
await pause(1800);
await h.head(SEAT, { x: c[0], y: c[1] + 0.1, z: c[2] }, 1600);
await pause(2200);

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; speed-up x${h.speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
