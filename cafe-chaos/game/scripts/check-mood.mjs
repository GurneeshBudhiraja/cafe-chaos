/**
 * Phase 2 check: the night mood. With the viewer seated at the emulated
 * table and the café placed, checks that:
 * 1. the passthrough dimmer has faded in to its level, centred on the head;
 * 2. the café carries its lamps (point lights with halos), the shadow-
 *    casting key light and the light spill on the table;
 * 3. the renderer is set up for the look (filmic tone mapping, soft shadow
 *    maps), with no console errors.
 * Then saves headset-view screenshots: seated, the gate lamps and their
 * spill, the lanterns over the counter, and a low look along the table.
 *
 * Usage: dev server running, then `node scripts/check-mood.mjs`.
 * Output: artifacts/mood-*.png, and a pass/fail line.
 */

import { startHeadset } from './lib/headset.mjs';

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
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed, null, { timeout: 15000 });
    // The dimming fades in over a few seconds of game time (real time here).
    await h.page.waitForFunction(() => window.__cafe.mood.dimmer.level > 0.5, null, { timeout: 20000 });
    await h.pause(600);
  },
});
const { page } = h;

const state = await page.evaluate(() => {
  const { world, system, lights, mood } = window.__cafe;
  const V = world.camera.position.constructor;
  const head = world.camera.getWorldPosition(new V());
  const dome = mood.dimmer.mesh.getWorldPosition(new V());
  return {
    dim: +mood.dimmer.level.toFixed(3),
    domeVisible: mood.dimmer.mesh.visible,
    domeOffset: +dome.distanceTo(head).toFixed(3),
    lamps: lights.lamps.length,
    halos: system.cafe.children.filter((c) => c.name === 'Halo').length,
    keyShadow: lights.key.castShadow,
    spill: !!lights.spill.parent && lights.spill.receiveShadow,
    shadowMap: world.renderer.shadowMap.enabled,
    toneMapping: world.renderer.toneMapping,
    envIntensity: +world.scene.environmentIntensity.toFixed(2),
    casters: (() => { let n = 0; system.cafe.traverse((o) => { if (o.isMesh && o.castShadow) n++; }); return n; })(),
  };
});
check('the passthrough has dimmed around the head', state.dim >= 0.5 && state.domeVisible && state.domeOffset < 0.01, `level ${state.dim}, dome ${state.domeOffset} m from the head`);
check('the café carries its lamps, key light and spill', state.lamps === 6 && state.halos === 5 && state.keyShadow && state.spill, `${state.lamps} lamps, ${state.halos} halos, key shadows ${state.keyShadow}, spill ${state.spill}`);
check('the renderer is set for the look', state.shadowMap && state.toneMapping === 4 && state.envIntensity < 0.5 && state.casters > 30, `shadow maps ${state.shadowMap}, tone mapping ${state.toneMapping} (4 = ACES), environment ${state.envIntensity}, ${state.casters} shadow casters`);

await h.head(SEAT, { x: LOOK.x, y: LOOK.y + 0.1, z: LOOK.z }, 400);
await h.pause(300);
await h.screenshot('artifacts/mood-1-seated.png');
// The gate lamps (the café's right, toward -z here) and their spill on the table.
await h.head({ x: -1.0, y: 1.02, z: -0.02 }, { x: -1.38, y: 0.8, z: 0.0 }, 600);
await h.pause(300);
await h.screenshot('artifacts/mood-2-gate.png');
// The lanterns over the counter at the back.
await h.head({ x: -1.15, y: 1.05, z: 0.3 }, { x: -1.6, y: 0.9, z: 0.28 }, 600);
await h.pause(300);
await h.screenshot('artifacts/mood-3-counter.png');
// Low along the table from the front right: the spill and the shadow on the table.
await h.head({ x: -0.9, y: 0.95, z: -0.2 }, { x: -1.4, y: 0.8, z: 0.3 }, 600);
await h.pause(300);
await h.screenshot('artifacts/mood-4-low.png');

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; errors ${errors.length}; ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
process.exit(results.every((r) => r.ok) && errors.length === 0 ? 0 : 1);
