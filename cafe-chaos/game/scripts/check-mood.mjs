/**
 * Phase 2 check: the night mood. With the viewer seated at the emulated
 * table and the café placed, checks that:
 * 1. the passthrough dimmer has faded in to its level, centred on the head,
 *    and the lamps have come up with it;
 * 2. the café carries its lamps (point lights with halos), the shadow-
 *    casting house light and the light spill on the table;
 * 3. the renderer is set up for the look (filmic tone mapping, soft shadow
 *    maps), with no console errors;
 * 4. the frame budget holds: the furniture is batched and the shadow map
 *    is only redrawn when the café moves;
 * 5. the theme is loaded, set to loop, and was asked to play when the
 *    session began.
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
    await h.page.waitForFunction(() => window.__cafe.mood.dimmer.level > 0.3 && window.__cafe.mood.lampsUp > 0.99, null, { timeout: 20000 });
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
    lampsUp: +mood.lampsUp.toFixed(2),
    lit: lights.lamps.every((l) => l.intensity > 0.03),
    lamps: lights.lamps.length,
    halos: system.cafe.children.filter((c) => c.name === 'Halo').length,
    houseShadow: lights.house.castShadow,
    spill: !!lights.spill.parent && lights.spill.receiveShadow,
    shadowMap: world.renderer.shadowMap.enabled,
    toneMapping: world.renderer.toneMapping,
    envIntensity: +world.scene.environmentIntensity.toFixed(2),
    casters: (() => { let n = 0; system.cafe.traverse((o) => { if (o.isMesh && o.castShadow) n++; }); return n; })(),
  };
});
check('the passthrough has dimmed around the head and the lamps are up', state.dim >= 0.3 && state.domeVisible && state.domeOffset < 0.01 && state.lampsUp === 1 && state.lit, `level ${state.dim}, dome ${state.domeOffset} m from the head, lamps up ${state.lampsUp}, all lit ${state.lit}`);
check('the café carries its lamps, house light and spill', state.lamps === 5 && state.halos === 5 && state.houseShadow && state.spill, `${state.lamps} lamps, ${state.halos} halos, house light shadows ${state.houseShadow}, spill ${state.spill}`);
check('the renderer is set for the look', state.shadowMap && state.toneMapping === 4 && state.envIntensity < 0.8 && state.casters > 20, `shadow maps ${state.shadowMap}, tone mapping ${state.toneMapping} (4 = ACES), environment ${state.envIntensity}, ${state.casters} shadow casters`);

// The frame budget: the furniture is batched, and with the café still the shadow map is not redrawn.
{
  const still = await page.evaluate(async () => {
    const { world, system, budget } = window.__cafe;
    const frame = () => world.renderer.info.render.frame;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const wait = async (n) => { const f = frame(); while (frame() < f + n) await sleep(8); };
    await wait(5);
    const before = budget.shadowDraws;
    await wait(4);
    const idle = budget.shadowDraws - before;
    // Nudge the café: the map must follow.
    system.cafe.position.x += 0.01;
    await wait(3);
    const moved = budget.shadowDraws - before - idle;
    system.cafe.position.x -= 0.01;
    await wait(5);
    return { idle, moved, batch: system.batch, calls: world.renderer.info.render.calls };
  });
  check('the furniture is batched and the shadow map rests while the café is still', still.batch.merged > 40 && still.batch.batches < 15 && still.idle === 0 && still.moved > 0, `${still.batch.merged} meshes in ${still.batch.batches} batches, ${still.calls} draw calls a frame (both eyes), shadow redraws: ${still.idle} still, ${still.moved} after a move`);
}

// The theme: the track is there, set to loop quietly, and was asked to play when the session began.
{
  const theme = await page.evaluate(async () => {
    const { theme } = window.__cafe;
    const a = theme.audio;
    for (let i = 0; i < 100 && a.readyState < 1; i++) await new Promise((r) => setTimeout(r, 100));
    return { src: a.src, loop: a.loop, duration: a.duration, asked: theme.asked, started: theme.started, volume: a.volume, error: a.error ? a.error.message : null };
  });
  check('the theme is loaded, looping, and was asked to play at the start', /audio\/theme\.mp3$/.test(theme.src) && theme.loop && theme.duration > 100 && theme.asked >= 1 && !theme.error && theme.volume <= 0.051,
    `${theme.src.split('/').slice(-2).join('/')}, ${theme.duration.toFixed(0)} s, loop ${theme.loop}, asked to play ${theme.asked} time(s), playing ${theme.started} (the emulator's browser may hold sound back), volume ${theme.volume.toFixed(2)}`);
}

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
