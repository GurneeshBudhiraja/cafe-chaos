/**
 * Phase 1 check: the café appears on the table as soon as the session
 * starts.
 *
 * Sits the viewer at the emulated living room's desk-height table (as the
 * model size tests did), enters the session, and checks that the café:
 * 1. was placed on a detected table (plane detection), at table height;
 * 2. stands about 35 cm out from the eyes, its front toward the viewer;
 * 3. holds the whole layout: the shell, the bench, 10 tables, the bar and
 *    the quiet corner (29 seats), the tables bare (the baristas bring the food), with no console errors.
 * Then saves headset-view screenshots from a few viewpoints.
 *
 * Usage: dev server running, then `node scripts/check-placement.mjs`.
 * Output: artifacts/placement-*.png, and a pass/fail line.
 */

import { startHeadset } from './lib/headset.mjs';

/** The emulated living room's table is to the viewer's left; sit facing it. */
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: { x: -1.0, y: 0.98, z: 0.43 } }));
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-left', position: { x: -0.65, y: 0.7, z: 0.58 } }));
    // The session began before the viewer was seated: place again from here, as a real start would.
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed, null, { timeout: 15000 });
    await h.pause(1200);
  },
});
const { page } = h;

const state = await page.evaluate(() => {
  const { world, system } = window.__cafe;
  const V = world.camera.position.constructor;
  const head = world.camera.getWorldPosition(new V());
  const cafe = system.cafe;
  const at = cafe.getWorldPosition(new V());
  // The café's front (+Z) should point at the viewer.
  const front = new V(0, 0, 1).applyQuaternion(cafe.getWorldQuaternion(world.camera.quaternion.clone()));
  const toHead = head.clone().sub(at).setY(0).normalize();
  const models = system.pieces.map((p) => p.name);
  return {
    placed: system.placed,
    onDesk: system.onDesk,
    at: at.toArray().map((n) => +n.toFixed(3)),
    reach: +Math.hypot(at.x - head.x, at.z - head.z).toFixed(3),
    facing: +front.setY(0).normalize().dot(toHead).toFixed(3),
    scale: +cafe.scale.x.toFixed(3),
    shells: models.filter((m) => m === 'cafe-shell').length,
    benches: models.filter((m) => m === 'waiting-bench').length,
    tables: models.filter((m) => m.startsWith('table-')).length,
    bars: models.filter((m) => m === 'bar-2').length,
    corners: models.filter((m) => m === 'quiet-corner').length,
    meals: cafe.getObjectsByProperty('name', 'meal').length,
    seats: system.seats.length,
    visible: cafe.visible,
  };
});
check('the café is placed on a detected table', state.placed && state.onDesk && state.visible, `placed ${state.placed}, on desk ${state.onDesk}, at ${state.at.join(', ')}`);
check('it stands at table height', Math.abs(state.at[1] - LOOK.y) < 0.03, `y ${state.at[1]} (table ${LOOK.y})`);
// About 35 cm out when the table allows; the emulated table is small, so the edge margin moves the café toward its middle.
check('within reach, facing the viewer', state.reach > 0.25 && state.reach < 0.6 && state.facing > 0.95, `reach ${state.reach} m, facing ${state.facing}`);
check('the layout is complete', state.shells === 1 && state.benches === 1 && state.tables === 10 && state.bars === 1 && state.corners === 1 && state.seats === 29 && state.meals === 0 && state.scale === 1, `${state.shells} shell, ${state.benches} bench, ${state.tables} tables, ${state.bars} bar, ${state.corners} quiet corner, ${state.seats} seats, ${state.meals} meals, scale ${state.scale}`);

// Screenshots: the seated view, a lean over the front row, the gate side, the bar on the left wall, the quiet corner at the back right.
await h.head(SEAT, { x: LOOK.x, y: LOOK.y + 0.1, z: LOOK.z }, 400);
await h.pause(300);
await h.screenshot('artifacts/placement-1-seated.png');
await h.head({ x: -1.0, y: 1.1, z: 0.3 }, { x: -1.3, y: 0.8, z: 0.28 }, 600);
await h.pause(300);
await h.screenshot('artifacts/placement-2-lean.png');
await h.head({ x: -0.95, y: 1.1, z: 0.05 }, { x: -1.3, y: 0.82, z: 0.2 }, 600);
await h.pause(300);
await h.screenshot('artifacts/placement-3-gate.png');
await h.head({ x: -1.08, y: 1.1, z: 0.64 }, { x: -1.31, y: 0.82, z: 0.62 }, 600);
await h.pause(300);
await h.screenshot('artifacts/placement-4-bar.png');
await h.head({ x: -1.3, y: 1.08, z: -0.12 }, { x: -1.62, y: 0.81, z: 0.09 }, 600);
await h.pause(300);
await h.screenshot('artifacts/placement-5-corner.png');

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; errors ${errors.length}; ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
process.exit(results.every((r) => r.ok) && errors.length === 0 ? 0 : 1);
