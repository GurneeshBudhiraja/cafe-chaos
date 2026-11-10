/**
 * Hold check: moving, resizing and turning the café by hand. With the
 * viewer seated at the emulated table and the café placed, the emulated
 * hands pinch it and the script checks that:
 * 1. one hand's pinch over the café carries it (the café moves exactly
 *    with the pinch, keeps its size and turn, and stays put on release);
 * 2. a pinch away from the café takes nothing;
 * 3. two hands resize it by their spread and turn it by their line, the
 *    point between them staying under the hands;
 * 4. the café counts as moved by hand once carried.
 * Screenshots: the café lifted mid-carry, and after being enlarged.
 * (The grab is on the café itself, well away from its handles; the
 * handles have their own check, check-handles.mjs.)
 *
 * Usage: dev server running, then `node scripts/check-hold.mjs`.
 * Output: artifacts/hold-*.png, and a pass/fail line.
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const nearV = (a, b, tol) => a.every((v, i) => near(v, b[i], tol));
const add = (a, b) => a.map((v, i) => v + b[i]);
const fmt = (a) => `[${a.map((v) => v.toFixed(3)).join(', ')}]`;

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 15000 });
    await h.page.waitForFunction(() => window.__cafe.mood.lampsUp > 0.99, null, { timeout: 20000 });
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
/** Wait `n` rendered frames. */
const frames = (n) =>
  page.evaluate(
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
const state = () =>
  page.evaluate(() => {
    const { hold, system } = window.__cafe;
    const c = system.cafe;
    return {
      pos: c.position.toArray(),
      yaw: c.rotation.y,
      scale: c.scale.x,
      holding: [...hold.holding],
      moved: system.movedByHand,
      point: { left: hold.pinch.left.point.toArray(), right: hold.pinch.right.point.toArray() },
      gap: { left: hold.pinch.left.gap, right: hold.pinch.right.gap },
    };
  });

// The emulated hands: a fixed orientation, so the pinch point sits at a
// constant offset from the hand's pose. Measured once, pinched, well away
// from the café.
const Q = { x: 0, y: 0, z: 0, w: 1 };
const offset = { left: [0, 0, 0], right: [0, 0, 0] };
const AWAY = { left: [-0.3, 0.9, 0.6], right: [-0.3, 0.9, -0.1] };
const handTo = (hand, p) => send('set_transform', { device: `hand-${hand}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const pinch = (hand, value) => send('set_select_value', { device: `hand-${hand}`, value });
/** Put the hand so that, pinched, its pinch point is at `p` (world). */
const pinchPointTo = (hand, p) => handTo(hand, p.map((v, i) => v - offset[hand][i]));
for (const hand of ['left', 'right']) {
  await handTo(hand, AWAY[hand]);
  await pinch(hand, 1);
}
await frames(3);
{
  const s = await state();
  for (const hand of ['left', 'right']) offset[hand] = s.point[hand].map((v, i) => v - AWAY[hand][i]);
  check('a pinch away from the café takes nothing', s.holding.length === 0 && !s.moved, `holding ${JSON.stringify(s.holding)}, gaps ${s.gap.left.toFixed(3)} / ${s.gap.right.toFixed(3)}`);
}
for (const hand of ['left', 'right']) await pinch(hand, 0);
await frames(3);
const rest = await state();

// 1. One hand: pinch over the front of the café and carry it.
const start = rest.pos;
const grabAt = add(start, [0.0, 0.12, 0.08]); // over the café room, clear of the pill and brackets, a hand's height up
await pinchPointTo('right', grabAt);
await frames(2);
await pinch('right', 1);
await frames(2);
const lift = [0.1, 0.08, -0.12];
const steps = 5;
for (let i = 1; i <= steps; i++) {
  await pinchPointTo('right', add(grabAt, lift.map((v) => (v * i) / steps)));
  await frames(1);
}
await frames(2);
{
  const s = await state();
  check('one hand carries the café with the pinch', s.holding.length === 1 && nearV(s.pos, add(start, lift), 0.006), `moved to ${fmt(s.pos)}, wanted ${fmt(add(start, lift))}`);
  check('carrying keeps its size and turn', near(s.scale, rest.scale, 0.001) && near(s.yaw, rest.yaw, 0.001), `scale ${s.scale.toFixed(3)}, yaw ${s.yaw.toFixed(3)}`);
  await page.screenshot({ path: 'artifacts/hold-1-carry.png' });
}
await pinch('right', 0);
await frames(2);
await handTo('right', AWAY.right);
await frames(2);
const down = await state();
check('it stays where it was put down', down.holding.length === 0 && nearV(down.pos, add(start, lift), 0.006) && down.moved, `at ${fmt(down.pos)}, moved by hand ${down.moved}`);

// 2. Two hands: either side of the café along the table (world z), symmetric about its origin.
const c = down.pos;
const grip = (dz, turn = 0) => {
  const dx = Math.sin(turn) * dz;
  const dzz = Math.cos(turn) * dz;
  return { left: [c[0] + dx, c[1] + 0.1, c[2] + dzz], right: [c[0] - dx, c[1] + 0.1, c[2] - dzz] };
};
let g = grip(0.2);
await pinchPointTo('left', g.left);
await pinchPointTo('right', g.right);
await frames(2);
await pinch('left', 1);
await pinch('right', 1);
await frames(2);
for (let i = 1; i <= steps; i++) {
  g = grip(0.2 + (0.06 * i) / steps);
  await pinchPointTo('left', g.left);
  await pinchPointTo('right', g.right);
  await frames(1);
}
await frames(2);
{
  const s = await state();
  check('two hands resize it by their spread', s.holding.length === 2 && near(s.scale, down.scale * 1.3, 0.02), `scale ${s.scale.toFixed(3)} (wanted ${(down.scale * 1.3).toFixed(3)})`);
  check('resizing keeps the point between the hands put', nearV(s.pos, c, 0.008) && near(s.yaw, down.yaw, 0.01), `at ${fmt(s.pos)} (was ${fmt(c)}), yaw ${s.yaw.toFixed(3)}`);
}
const turn = (20 * Math.PI) / 180;
for (let i = 1; i <= steps; i++) {
  g = grip(0.26, (turn * i) / steps);
  await pinchPointTo('left', g.left);
  await pinchPointTo('right', g.right);
  await frames(1);
}
await frames(2);
{
  const s = await state();
  const d = Math.atan2(Math.sin(s.yaw - down.yaw), Math.cos(s.yaw - down.yaw));
  check('two hands turn it by their line', near(Math.abs(d), turn, 0.02) && near(s.scale, down.scale * 1.3, 0.02), `turned ${((d * 180) / Math.PI).toFixed(1)} degrees, scale ${s.scale.toFixed(3)}`);
}
await pinch('left', 0);
await pinch('right', 0);
await frames(2);
await handTo('left', AWAY.left);
await handTo('right', AWAY.right);
await frames(3);
{
  const s = await state();
  check('it keeps its new size and turn once let go', s.holding.length === 0 && near(s.scale, down.scale * 1.3, 0.02), `scale ${s.scale.toFixed(3)}`);
  await h.head(SEAT, { x: s.pos[0], y: s.pos[1], z: s.pos[2] }, 300);
  await page.screenshot({ path: 'artifacts/hold-2-resized.png' });
}

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.join(' | ') || 'clean');
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
