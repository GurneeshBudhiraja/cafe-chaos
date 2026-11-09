/**
 * Dock check: the signboard of buttons beside the café, and the themed
 * hands. With the viewer seated and the café placed, checks that:
 * 1. the dock shows beside the café (to the player's right, at the base,
 *    its own size) and the hands are drawn as the café's hands;
 * 2. a fingertip poke on Bigger, Smaller and Turn steps the café's size
 *    and turn (one step per poke, growing from the base, no repeat while
 *    the finger stays), and the tile lights under the finger;
 * 3. pinching the Move handle and dragging carries the café;
 * 4. Reset puts the café back at its first size, without restarting the
 *    night.
 * Screenshots: the dock from the seat, a hand over a tile, the café after.
 *
 * Usage: dev server running, then `node scripts/check-dock.mjs`.
 * Output: artifacts/dock-*.png, and a pass/fail line.
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
    const { hold, system, dock, world, mood } = window.__cafe;
    const c = system.cafe;
    const V = c.position.constructor;
    const tiles = dock.dock.tiles.map((t) => ({
      action: t.action,
      at: t.mesh.getWorldPosition(new V()).toArray(),
      normal: new V(0, 0, 1).transformDirection(t.mesh.matrixWorld).toArray(),
      glow: t.mesh.material.emissiveIntensity,
    }));
    const right = world.input.xr.visualAdapters.hand.right.visual;
    const skinned = right?.model.getObjectByProperty('type', 'SkinnedMesh');
    return {
      pos: c.position.toArray(),
      yaw: c.rotation.y,
      scale: c.scale.x,
      placements: system.placements,
      holding: [...hold.holding],
      presses: { ...dock.presses },
      dockVisible: dock.dock.group.visible,
      dockAt: dock.dock.group.getWorldPosition(new V()).toArray(),
      dockScale: dock.dock.group.scale.x,
      tiles,
      tip: { left: dock.tips.left.point.toArray(), right: dock.tips.right.point.toArray() },
      pinch: hold.pinch.right.point.toArray(),
      handVisual: right?.constructor.name ?? null,
      handMaterial: skinned?.material?.type ?? null,
      handGlow: skinned?.material?.emissiveIntensity ?? null,
      dim: mood.dimmer.level,
    };
  });

const Q = { x: 0, y: 0, z: 0, w: 1 };
const AWAY = { left: [-0.3, 0.9, 0.6], right: [-0.3, 0.9, -0.1] };
const handTo = (hand, p) => send('set_transform', { device: `hand-${hand}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const pinch = (hand, value) => send('set_select_value', { device: `hand-${hand}`, value });
const tipOffset = { right: [0, 0, 0] };
const pinchOffset = { right: [0, 0, 0] };
// Calibrate: the fingertip (open hand) and the pinch point (pinched) relative to the hand's pose.
await handTo('right', AWAY.right);
await handTo('left', AWAY.left);
await frames(3);
let s = await state();
tipOffset.right = add(s.tip.right, AWAY.right, -1);
await pinch('right', 1);
await frames(3);
s = await state();
pinchOffset.right = add(s.pinch, AWAY.right, -1);
await pinch('right', 0);
await frames(2);
const tipTo = (p) => handTo('right', add(p, tipOffset.right, -1));
const pinchTo = (p) => handTo('right', add(p, pinchOffset.right, -1));
/** Poke the tile: approach from 5 cm out to 3 mm through its face, hold, then draw well back (past where the dock holds still). */
async function poke(action, { stay = false } = {}) {
  const t = (await state()).tiles.find((t) => t.action === action);
  for (const d of [0.05, 0.03, 0.015, 0.004, -0.003]) {
    await tipTo(add(t.at, t.normal, d));
    await frames(1);
  }
  await frames(2);
  if (stay) return t;
  await tipTo(add(t.at, t.normal, 0.12));
  await frames(2);
  return t;
}
const settle = async () => {
  await page.waitForFunction(() => {
    const { dock, system } = window.__cafe;
    return Math.abs(dock.scaleTarget - system.cafe.scale.x) < 1e-4 && Math.abs(dock.yawTarget - system.cafe.rotation.y) < 1e-4 && !system.arriving;
  }, null, { timeout: 20000 });
  await frames(1);
};

// 1. The dock beside the café; the hands themed.
const start = await state();
{
  const c = start.pos;
  // The café's right (its +x) and front (its +z) in world, from its yaw.
  const rightDir = [Math.cos(start.yaw), 0, -Math.sin(start.yaw)];
  const frontDir = [Math.sin(start.yaw), 0, Math.cos(start.yaw)];
  const d = add(start.dockAt, c, -1);
  const right = d[0] * rightDir[0] + d[2] * rightDir[2];
  const front = d[0] * frontDir[0] + d[2] * frontDir[2];
  check('the dock stands in front of the café\'s front-right corner, at its base', start.dockVisible && right > 0.2 && right < 0.46 && front > 0.33 && front < 0.45 && d[1] > 0.02 && d[1] < 0.07 && start.dockScale === 1, `${right.toFixed(3)} m right, ${front.toFixed(3)} m forward, ${d[1].toFixed(3)} m up, scale ${start.dockScale}`);
  check('the dock has its five tiles', start.tiles.map((t) => t.action).join(',') === 'move,turn,smaller,bigger,reset', start.tiles.map((t) => t.action).join(','));
  check('the hands are the café\'s hands', start.handVisual === 'CafeHand' && start.handMaterial === 'MeshStandardMaterial', `${start.handVisual}, ${start.handMaterial}, glow ${start.handGlow}`);
  await h.head({ x: start.dockAt[0] + 0.3, y: start.dockAt[1] + 0.28, z: start.dockAt[2] + 0.1 }, { x: start.dockAt[0], y: start.dockAt[1], z: start.dockAt[2] }, 300);
  await page.screenshot({ path: 'artifacts/dock-1-board.png' });
}

// 2. Pokes.
{
  const t = await poke('bigger', { stay: true });
  const mid = await state();
  const tile = mid.tiles.find((x) => x.action === 'bigger');
  check('a poked tile lights up', tile.glow > 0.5, `glow ${tile.glow.toFixed(2)}`);
  check('the dock holds still under the finger', mid.dockAt.every((v, i) => near(v, start.dockAt[i], 0.002)), `moved ${fmt(add(mid.dockAt, start.dockAt, -1))}`);
  await page.screenshot({ path: 'artifacts/dock-2-hand.png' });
  await frames(3);
  const held = await state();
  check('a finger left on the tile presses once', held.presses.bigger === 1, `${held.presses.bigger} press(es)`);
  await tipTo(add(t.at, t.normal, 0.12));
  await settle();
  s = await state();
  check('Bigger grows the café a step from its base', near(s.scale, start.scale * 1.2, 0.005) && near(s.pos[1], start.pos[1], 0.001), `scale ${s.scale.toFixed(3)}, y ${s.pos[1].toFixed(3)}`);
  await poke('bigger');
  await settle();
  s = await state();
  check('a second poke grows it another step', near(s.scale, start.scale * 1.44, 0.005), `scale ${s.scale.toFixed(3)}`);
  await poke('smaller');
  await settle();
  s = await state();
  check('Smaller shrinks it a step', near(s.scale, start.scale * 1.2, 0.005), `scale ${s.scale.toFixed(3)}`);
  await poke('turn');
  await settle();
  s = await state();
  check('Turn turns it 22.5 degrees', near(s.yaw - start.yaw, (22.5 * Math.PI) / 180, 0.005), `turned ${(((s.yaw - start.yaw) * 180) / Math.PI).toFixed(1)} degrees`);
}

// 3. The Move handle.
{
  const before = await state();
  const t = before.tiles.find((x) => x.action === 'move');
  const at = add(t.at, t.normal, 0.01);
  await pinchTo(at);
  await frames(2);
  await pinch('right', 1);
  await frames(2);
  const lift = [0.08, 0.06, -0.06];
  for (let i = 1; i <= 4; i++) {
    await pinchTo(add(at, lift, i / 4));
    await frames(1);
  }
  await frames(2);
  s = await state();
  check('pinching the Move handle carries the café', s.holding.length === 1 && s.pos.every((v, i) => near(v, before.pos[i] + lift[i], 0.008)), `holding ${JSON.stringify(s.holding)}, at ${fmt(s.pos)} (wanted ${fmt(add(before.pos, lift))})`);
  await pinch('right', 0);
  await frames(2);
  await handTo('right', AWAY.right);
  await frames(2);
  s = await state();
  check('the dock follows the café', s.dockAt.every((v, i) => near(v - s.pos[i], before.dockAt[i] - before.pos[i], 0.01)), `dock offset ${fmt(add(s.dockAt, s.pos, -1))}`);
  await h.head(SEAT, { x: s.pos[0], y: s.pos[1], z: s.pos[2] }, 300);
  await page.screenshot({ path: 'artifacts/dock-3-after.png' });
}

// 4. Reset.
{
  const before = await state();
  await poke('reset');
  await page.waitForFunction(() => !window.__cafe.system.arriving, null, { timeout: 10000 });
  await settle();
  s = await state();
  check('Reset puts it back at its first size and turn', near(s.scale, start.scale, 0.001) && near(s.yaw, start.yaw, 0.01) && s.pos.every((v, i) => near(v, start.pos[i], 0.01)), `scale ${s.scale.toFixed(3)}, yaw ${s.yaw.toFixed(3)}, at ${fmt(s.pos)}`);
  check('Reset keeps the night', s.placements === before.placements && s.dim > 0.3, `placements ${s.placements}, dim ${s.dim.toFixed(2)}`);
}

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.join(' | ') || 'clean');
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
