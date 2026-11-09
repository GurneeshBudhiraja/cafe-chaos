/**
 * Holding the café, recorded as the headset shows it (Quest 3 field of
 * view, no captions): the viewer sits at the table, the café pops up and
 * the lamps come up; then the right hand reaches in, pinches the café,
 * lifts it, carries it nearer and sets it down; then both hands take it,
 * spread to enlarge it, turn it, and ease it back a little; and a last
 * look over the café where it was left.
 *
 * The emulated hands move frame by frame (one pose per rendered frame), so
 * the motion stays smooth however slowly the page renders; the video is
 * sped up to true pace, and the game's clock slowed to match.
 *
 * Usage: dev server running (`npm run dev`), then `npm run record:hold`.
 * Output: artifacts/hold.mp4
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const TABLE = { x: -1.3, y: 0.79, z: 0.28 };
/** Hands in the lap, behind the eyes, out of the shots. */
const LAP = { left: [-0.7, 0.85, 0.42], right: [-0.7, 0.85, 0.14] };
const Q = { x: 0, y: 0, z: 0, w: 1 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
/** Where each hand's pinch point sits relative to its pose (measured in prepare). */
const offset = { left: [0, 0, 0], right: [0, 0, 0] };
/** The emulator page, set as soon as the headset is up (prepare runs before startHeadset returns). */
let page;

const h = await startHeadset({
  record: 'hold',
  maxSpeedUp: 30,
  async prepare(h) {
    page = h.page;
    await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z });
    for (const hand of ['left', 'right']) await handTo(hand, LAP[hand]);
    // Where each hand's pinch point sits relative to its pose, measured pinched, before the café is down.
    for (const hand of ['left', 'right']) await pinch(hand, 1);
    await frames(3);
    const points = await h.page.evaluate(() => ({ left: window.__cafe.hold.pinch.left.point.toArray(), right: window.__cafe.hold.pinch.right.point.toArray() }));
    for (const hand of ['left', 'right']) offset[hand] = points[hand].map((v, i) => v - LAP[hand][i]);
    for (const hand of ['left', 'right']) await pinch(hand, 0);
    await h.page.evaluate((timeScale) => {
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
function pinch(hand, value) {
  return send('set_select_value', { device: `hand-${hand}`, value });
}
/** Put the hand so that its pinch point is at `p` (world). */
function pinchAt(hand, p) {
  return handTo(hand, p.map((v, i) => v - offset[hand][i]));
}
/** Over `ms` of playback time, move each hand's pinch point from `from` to `to`, eased, a pose per frame. */
async function reach(ms, from, to) {
  const real = ms * h.speedUp;
  const t0 = performance.now();
  for (;;) {
    const t = Math.min(1, (performance.now() - t0) / real);
    const e = ease(t);
    for (const hand of Object.keys(to)) await pinchAt(hand, lerp(from[hand], to[hand], e));
    if (t >= 1) return;
    await frames(1);
  }
}
const cafeAt = () => page.evaluate(() => window.__cafe.system.cafe.position.toArray());

// 1. Seated; the café pops up on the table, the room dims and the lamps come up.
await pause(6500);

// 2. One hand: in from the lap to over the garden in front of the room, pinch, lift and carry it nearer, set it down.
let c = await cafeAt();
const over = [c[0] + 0.14, c[1] + 0.1, c[2] - 0.02];
await reach(1300, { right: LAP.right }, { right: over });
await pause(500);
await pinch('right', 1);
await pause(400);
const lifted = [over[0] + 0.1, over[1] + 0.09, over[2] - 0.1];
await reach(2000, { right: over }, { right: lifted });
await pause(600);
const down = [lifted[0], over[1], lifted[2]];
await reach(1600, { right: lifted }, { right: down });
await pause(300);
await pinch('right', 0);
await pause(300);
await reach(1000, { right: down }, { right: LAP.right });
await pause(900);

// 3. Two hands: either side of the café, pinch, spread to enlarge, turn, ease back a little, let go.
c = await cafeAt();
const grip = (half, turn) => {
  const dx = Math.sin(turn) * half;
  const dz = Math.cos(turn) * half;
  return { left: [c[0] + dx, c[1] + 0.1, c[2] + dz], right: [c[0] - dx, c[1] + 0.1, c[2] - dz] };
};
await reach(1400, LAP, grip(0.2, 0));
await pause(500);
await pinch('left', 1);
await pinch('right', 1);
await pause(400);
await reach(2200, grip(0.2, 0), grip(0.27, 0));
await pause(500);
await reach(2200, grip(0.27, 0), grip(0.27, (25 * Math.PI) / 180));
await pause(500);
await reach(1600, grip(0.27, (25 * Math.PI) / 180), grip(0.23, (25 * Math.PI) / 180));
await pause(300);
await pinch('left', 0);
await pinch('right', 0);
await pause(300);
await reach(1000, grip(0.23, (25 * Math.PI) / 180), LAP);
await pause(800);

// 4. A look over the café where it was left, and back to the seat.
c = await cafeAt();
await h.head({ x: c[0] + 0.45, y: c[1] + 0.3, z: c[2] - 0.15 }, { x: c[0], y: c[1] + 0.05, z: c[2] }, 1800);
await pause(2000);
await h.head(SEAT, { x: c[0], y: c[1] + 0.1, z: c[2] }, 1600);
await pause(2500);

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; speed-up x${h.speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
