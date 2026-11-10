/**
 * Handles check: the grab pill and the corner brackets, and the surface
 * finder. With the viewer seated and the café placed, checks that:
 * 1. the pill lies outside the edge of the base facing the viewer, the
 *    four brackets wrap the corners, all their own size, and the pill
 *    moves to another edge when the viewer moves round the café;
 * 2. pinching the pill and dragging carries the café;
 * 3. pinching a bracket and pulling it out grows the café in place, and
 *    swinging it round turns it; it keeps both once let go;
 * 4. the surface finder takes any flat surface that is not the floor
 *    within reach (a couch, an unlabelled box) and refuses the floor, a
 *    too-low or too-far surface, and one behind the viewer.
 * Screenshots: the seated view with the handles, a corner being pulled,
 * and the pill on the side after the viewer moves round.
 *
 * Usage: dev server running, then `node scripts/check-handles.mjs`.
 * Output: artifacts/handles-*.png, and a pass/fail line.
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
const fmt = (a) => `[${a.map((v) => v.toFixed(3)).join(', ')}]`;
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

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
    const { hold, system, handles } = window.__cafe;
    const c = system.cafe;
    const V = c.position.constructor;
    const at = (g) => g.getWorldPosition(new V()).toArray();
    return {
      pos: c.position.toArray(),
      yaw: c.rotation.y,
      scale: c.scale.x,
      holding: [...hold.holding],
      side: handles.side,
      drag: handles.drag ? handles.drag.corner : null,
      taken: { ...handles.taken },
      pill: at(handles.pill.group),
      pillShow: handles.pill.show,
      pillVisible: handles.pill.group.visible,
      brackets: handles.brackets.map((b) => at(b.group)),
      bracketShow: handles.brackets.map((b) => b.show),
      pillScale: handles.pill.group.scale.x,
      pinch: hold.pinch.right.point.toArray(),
      bounds: { min: hold.bounds.min.toArray(), max: hold.bounds.max.toArray() },
    };
  });
/** A café-space point to world, from the café's pose. */
const toWorld = (s, local) => {
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const x = local[0] * s.scale;
  const z = local[2] * s.scale;
  return [s.pos[0] + x * c + z * sn, s.pos[1] + local[1] * s.scale, s.pos[2] - x * sn + z * c];
};

const Q = { x: 0, y: 0, z: 0, w: 1 };
const AWAY = { left: [-0.3, 0.9, 0.6], right: [-0.3, 0.9, -0.1] };
const handTo = (hand, p) => send('set_transform', { device: `hand-${hand}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const pinch = (value) => send('set_select_value', { device: 'hand-right', value });
let pinchOffset = [0, 0, 0];
await handTo('right', AWAY.right);
await handTo('left', AWAY.left);
await pinch(1);
await frames(3);
pinchOffset = add((await state()).pinch, AWAY.right, -1);
await pinch(0);
await frames(2);
const pinchTo = (p) => handTo('right', add(p, pinchOffset, -1));
/** Move the pinch point from `from` to `to` in a few steps. */
async function drag(from, to, steps = 5) {
  for (let i = 1; i <= steps; i++) {
    await pinchTo(add(from, add(to, from, -1), i / steps));
    await frames(1);
  }
  await frames(2);
}

// 1. Where the handles are.
const start = await state();
{
  const b = start.bounds;
  const wantPill = toWorld(start, [0, 0, b.max[2]]);
  const d = dist(start.pill, wantPill);
  check('the pill lies outside the edge facing the viewer', start.pillVisible && start.side === 'front' && d > 0.03 && d < 0.06 && start.pillScale === 1, `side ${start.side}, ${(d * 100).toFixed(1)} cm out from the front edge`);
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => toWorld(start, [sx > 0 ? b.max[0] : b.min[0], 0, sz > 0 ? b.max[2] : b.min[2]]));
  const gaps = start.brackets.map((p, i) => dist(p, corners[i]));
  check('a bracket wraps each corner', gaps.every((g) => g > 0.012 && g < 0.025), `vertex gaps ${gaps.map((g) => (g * 100).toFixed(1)).join(', ')} cm`);
  check('the handles rest well lit', start.pillShow > 0.7 && start.pillShow < 0.9 && start.bracketShow.every((s) => s > 0.7 && s < 0.9), `pill ${start.pillShow.toFixed(2)}, brackets ${start.bracketShow.map((s) => s.toFixed(2)).join(', ')}`);
  await page.screenshot({ path: 'artifacts/handles-1-seated.png' });
  // Move round to the café's right side (its +x), looking at it.
  const rightSide = toWorld(start, [b.max[0] + 0.5, 0.4, 0]);
  await h.head({ x: rightSide[0], y: rightSide[1], z: rightSide[2] }, { x: start.pos[0], y: start.pos[1], z: start.pos[2] }, 400);
  await frames(3);
  const s = await state();
  const wantRight = toWorld(start, [b.max[0], 0, 0]);
  check('the pill moves to the edge now facing the viewer', s.side === 'right' && dist(s.pill, wantRight) < 0.06, `side ${s.side}, ${(dist(s.pill, wantRight) * 100).toFixed(1)} cm out from the right edge`);
  await page.screenshot({ path: 'artifacts/handles-3-side.png' });
  await h.head(SEAT, LOOK, 400);
  await frames(3);
  const back = await state();
  check('and back to the front with the viewer', back.side === 'front', `side ${back.side}`);
}

// 2. The pill carries.
{
  const before = await state();
  const at = add(before.pill, [0, 0.01, 0]);
  await pinchTo(add(at, [0, 0.04, 0]));
  await frames(2);
  const hovering = await state();
  check('the pill brightens as a hand nears', hovering.pillShow > 0.75, `show ${hovering.pillShow.toFixed(2)}`);
  await pinchTo(at);
  await frames(1);
  await pinch(1);
  await frames(2);
  const lift = [0.08, 0.07, -0.1];
  await drag(at, add(at, lift));
  const s = await state();
  check('pinching the pill carries the café', s.holding.length === 1 && s.taken.pill === 1 && s.pos.every((v, i) => near(v, before.pos[i] + lift[i], 0.008)), `holding ${JSON.stringify(s.holding)}, at ${fmt(s.pos)} (wanted ${fmt(add(before.pos, lift))})`);
  check('the pill comes along, fully lit', dist(s.pill, add(before.pill, lift)) < 0.01 && s.pillShow > 0.95, `pill moved ${fmt(add(s.pill, before.pill, -1))}, show ${s.pillShow.toFixed(2)}`);
  await pinch(0);
  await frames(2);
  await handTo('right', AWAY.right);
  await frames(2);
}

// 3. A corner resizes and turns.
{
  const before = await state();
  const corner = before.brackets[0]; // front-right
  const at = add(corner, [0, 0.01, 0]);
  await pinchTo(add(at, [0, 0.05, 0]));
  await frames(1);
  await pinchTo(at);
  await frames(1);
  await pinch(1);
  await frames(2);
  const centre = [before.pos[0], at[1], before.pos[2]];
  const r0 = add(at, centre, -1);
  // Pull out to 1.3 times the distance from the centre.
  await drag(at, add(centre, r0, 1.3));
  await page.screenshot({ path: 'artifacts/handles-2-corner.png' });
  let s = await state();
  check('pulling a corner out grows the café in place', s.drag === 0 && s.taken.corner === 1 && near(s.scale, before.scale * 1.3, 0.02) && near(s.yaw, before.yaw, 0.01) && s.pos.every((v, i) => near(v, before.pos[i], 0.002)), `scale ${s.scale.toFixed(3)}, yaw ${s.yaw.toFixed(3)}, at ${fmt(s.pos)}`);
  // Swing it 20 degrees round the centre.
  const turn = (20 * Math.PI) / 180;
  const a0 = Math.atan2(r0[0], r0[2]);
  const r = Math.hypot(r0[0], r0[2]) * 1.3;
  const swung = [centre[0] + Math.sin(a0 + turn) * r, at[1], centre[2] + Math.cos(a0 + turn) * r];
  await drag(add(centre, r0, 1.3), swung);
  s = await state();
  const d = Math.atan2(Math.sin(s.yaw - before.yaw), Math.cos(s.yaw - before.yaw));
  check('swinging the corner turns the café', near(d, turn, 0.02) && near(s.scale, before.scale * 1.3, 0.02), `turned ${((d * 180) / Math.PI).toFixed(1)} degrees, scale ${s.scale.toFixed(3)}`);
  const bracketAfter = s.brackets[0];
  check('the bracket stays under the fingers', dist(bracketAfter, [swung[0], bracketAfter[1], swung[2]]) < 0.03, `${(dist(bracketAfter, [swung[0], bracketAfter[1], swung[2]]) * 100).toFixed(1)} cm from the pinch`);
  await pinch(0);
  await frames(2);
  await handTo('right', AWAY.right);
  await frames(2);
  const after = await state();
  check('it keeps the size and turn once let go', after.drag === null && near(after.scale, before.scale * 1.3, 0.02) && near(after.yaw, s.yaw, 0.001), `scale ${after.scale.toFixed(3)}, yaw ${after.yaw.toFixed(3)}`);
}

// 4. The surface finder, on made-up surfaces.
{
  const verdicts = await page.evaluate(() => {
    const { world, findSurfaceSpot } = window.__cafe;
    const V = world.camera.position.constructor;
    const Obj = world.camera.constructor; // any Object3D will do as the plane's posed mesh
    const head = new V(0, 1.2, 0);
    const yaw = 0; // facing -Z
    const square = (half) => [{ x: -half, y: 0, z: -half }, { x: half, y: 0, z: -half }, { x: half, y: 0, z: half }, { x: -half, y: 0, z: half }];
    const surface = (label, height, ahead, half = 0.6) => {
      const object = new Obj();
      object.position.set(0, height, -ahead);
      object.updateMatrixWorld(true);
      return { object, plane: { orientation: 'horizontal', semanticLabel: label, polygon: square(half) } };
    };
    const tryOne = (s) => findSurfaceSpot([s], head, yaw, new V());
    return {
      couch: tryOne(surface('couch', 0.45, 0.7)),
      box: tryOne(surface(undefined, 0.3, 0.6)),
      table: tryOne(surface('table', 0.75, 0.5)),
      floor: tryOne(surface('floor', 0.0, 0.6)),
      lowUnlabelled: tryOne(surface(undefined, 0.15, 0.6)),
      far: tryOne(surface('table', 0.75, 2.0, 0.3)),
      behind: tryOne(surface('table', 0.75, -0.8, 0.3)),
      wall: tryOne(surface('wall face', 0.75, 0.6)),
    };
  });
  check('any flat surface that is not the floor will do', verdicts.couch && verdicts.box && verdicts.table, `couch ${verdicts.couch}, unlabelled box ${verdicts.box}, table ${verdicts.table}`);
  check('the floor, too-low, too-far, behind and wall surfaces are refused', !verdicts.floor && !verdicts.lowUnlabelled && !verdicts.far && !verdicts.behind && !verdicts.wall, `floor ${verdicts.floor}, low ${verdicts.lowUnlabelled}, far ${verdicts.far}, behind ${verdicts.behind}, wall ${verdicts.wall}`);
}

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.join(' | ') || 'clean');
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
