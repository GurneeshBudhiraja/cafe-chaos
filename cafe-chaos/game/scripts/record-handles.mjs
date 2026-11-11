/**
 * The handles in use, recorded as the headset shows it (Quest 3 field of
 * view, no captions): the viewer sits at the table, the café pops up with
 * its grab pill and corner brackets; the right hand pinches the pill and
 * carries the café nearer; pinches the front-right bracket, pulls it out
 * to grow the café and swings it to turn it, then eases it back; and the
 * viewer leans round to the café's side, the pill moving to the edge now
 * facing them, and back.
 *
 * Usage: dev server running (`npm run dev`), then `npm run record:handles`.
 * Output: artifacts/handles.mp4
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const TABLE = { x: -1.3, y: 0.79, z: 0.28 };
const LAP = { left: [-0.7, 0.85, 0.42], right: [-0.7, 0.85, 0.14] };
const Q = { x: 0, y: 0, z: 0, w: 1 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
/** The pinch point relative to the right hand's pose (measured in prepare). */
let pinchOffset = [0, 0, 0];
let page;

const h = await startHeadset({
  record: 'handles',
  maxSpeedUp: 30,
  async prepare(h) {
    page = h.page;
    await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z });
    for (const hand of ['left', 'right']) await handTo(hand, LAP[hand]);
    await pinch(1);
    await frames(3);
    pinchOffset = add(await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray()), LAP.right, -1);
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
/** Move the right hand so its pinch point travels from `from` to `to` over `ms`, eased, a pose per frame. */
async function reach(ms, from, to) {
  const real = ms * h.speedUp;
  const t0 = performance.now();
  for (;;) {
    const t = Math.min(1, (performance.now() - t0) / real);
    await handTo('right', add(lerp(from, to, ease(t)), pinchOffset, -1));
    if (t >= 1) return;
    await frames(1);
  }
}
/** Swing the pinch point round `centre` from bearing `a0` to `a1` at radius `r`, over `ms`. */
async function swing(ms, centre, r, y, a0, a1) {
  const real = ms * h.speedUp;
  const t0 = performance.now();
  for (;;) {
    const t = Math.min(1, (performance.now() - t0) / real);
    const a = a0 + (a1 - a0) * ease(t);
    await handTo('right', add([centre[0] + Math.sin(a) * r, y, centre[2] + Math.cos(a) * r], pinchOffset, -1));
    if (t >= 1) return;
    await frames(1);
  }
}
const world = () =>
  page.evaluate(() => {
    const { system, handles } = window.__cafe;
    const V = system.cafe.position.constructor;
    return { cafe: system.cafe.position.toArray(), pill: handles.pill.group.getWorldPosition(new V()).toArray(), corner: handles.brackets[0].group.getWorldPosition(new V()).toArray() };
  });

// 1. Seated; the café pops up with its pill and brackets, the room dims and the lamps come up.
await pause(6500);

// 2. The pill: reach, pinch, carry the café nearer and a little to the right, set it down.
let w = await world();
const pillAt = add(w.pill, [0, 0.012, 0]);
await reach(1400, LAP.right, add(pillAt, [0, 0.08, 0.02]));
await reach(500, add(pillAt, [0, 0.08, 0.02]), pillAt);
await pause(300);
await pinch(1);
await pause(400);
const lifted = add(pillAt, [0.1, 0.08, -0.1]);
await reach(2000, pillAt, lifted);
await pause(500);
const down = [lifted[0], pillAt[1], lifted[2]];
await reach(1400, lifted, down);
await pause(300);
await pinch(0);
await pause(400);
let rest = add(down, [0, 0.08, 0.03]);
await reach(700, down, rest);
await pause(800);

// 3. The front-right bracket: pull it out to grow the café, swing it to turn, ease back a little.
w = await world();
const cornerAt = add(w.corner, [0, 0.012, 0]);
const centre = [w.cafe[0], cornerAt[1], w.cafe[2]];
const r0 = Math.hypot(cornerAt[0] - centre[0], cornerAt[2] - centre[2]);
const a0 = Math.atan2(cornerAt[0] - centre[0], cornerAt[2] - centre[2]);
await reach(1200, rest, add(cornerAt, [0, 0.06, 0]));
await reach(500, add(cornerAt, [0, 0.06, 0]), cornerAt);
await pause(300);
await pinch(1);
await pause(400);
const pulled = [centre[0] + Math.sin(a0) * r0 * 1.3, cornerAt[1], centre[2] + Math.cos(a0) * r0 * 1.3];
await reach(2000, cornerAt, pulled);
await pause(500);
const a1 = a0 + (22 * Math.PI) / 180;
await swing(2000, centre, r0 * 1.3, cornerAt[1], a0, a1);
await pause(500);
const eased = [centre[0] + Math.sin(a1) * r0 * 1.15, cornerAt[1], centre[2] + Math.cos(a1) * r0 * 1.15];
await reach(1200, [centre[0] + Math.sin(a1) * r0 * 1.3, cornerAt[1], centre[2] + Math.cos(a1) * r0 * 1.3], eased);
await pause(300);
await pinch(0);
await pause(400);
await reach(1000, eased, LAP.right);
await pause(800);

// 4. Round to the café's side: the pill moves to the edge now facing the viewer; then back.
w = await world();
const c = w.cafe;
await h.head({ x: c[0] + 0.15, y: c[1] + 0.42, z: c[2] - 0.75 }, { x: c[0], y: c[1] + 0.05, z: c[2] }, 2200);
await pause(2000);
await h.head(SEAT, { x: c[0], y: c[1] + 0.1, z: c[2] }, 2000);
await pause(2500);

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; speed-up x${h.speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
