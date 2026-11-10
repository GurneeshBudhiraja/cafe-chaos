/**
 * Performance probe: with the viewer seated and the café placed, counts
 * what a frame draws (draw calls, triangles, lights, shadow casters,
 * shader programs, textures) and times frames in the emulator with parts
 * of the look switched off in turn. The emulator renders in software, so
 * the times are not the headset's, but how much each part costs relative
 * to the others is a fair guide to where the fragment work goes.
 *
 * Usage: dev server running, then `node scripts/probe-perf.mjs`.
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed, null, { timeout: 15000 });
    await h.page.waitForFunction(() => window.__cafe.mood.dimmer.level > 0.3 && window.__cafe.mood.lampsUp > 0.99, null, { timeout: 20000 });
    await h.pause(600);
  },
});
const { page } = h;

const counts = await page.evaluate(() => {
  const { world, system } = window.__cafe;
  const r = world.renderer;
  let meshes = 0, casters = 0, receivers = 0, tris = 0, lights = 0;
  const materials = new Set();
  world.scene.traverse((o) => {
    if (o.isLight) lights++;
    if (!o.isMesh || !o.visible) return;
    meshes++;
    if (o.castShadow) casters++;
    if (o.receiveShadow) receivers++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });
  const size = r.getDrawingBufferSize(new (world.camera.position.constructor)());
  return {
    calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs.length,
    textures: r.info.memory.textures, geometries: r.info.memory.geometries,
    meshes, casters, receivers, sceneTriangles: Math.round(tris), lights, materials: materials.size,
    shadowAuto: r.shadowMap.autoUpdate, shadowType: r.shadowMap.type, pixelRatio: r.getPixelRatio(),
    cafePieces: system.pieces.length,
  };
});
console.log('counts', JSON.stringify(counts, null, 1));

/** Mean milliseconds per frame over `n` frames. */
const time = (n = 12) => page.evaluate(async (n) => {
  const r = window.__cafe.world.renderer;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const f0 = r.info.render.frame;
  while (r.info.render.frame === f0) await sleep(4);
  const start = r.info.render.frame, t0 = performance.now();
  while (r.info.render.frame < start + n) await sleep(4);
  return (performance.now() - t0) / (r.info.render.frame - start);
}, n);

const variants = {
  baseline: () => {},
  'shadow map frozen (no shadow pass)': () => { window.__cafe.world.renderer.shadowMap.autoUpdate = false; },
  'shadows off entirely': () => { const l = window.__cafe.lights; l.house.castShadow = false; },
  'lamps off (6 point lights)': () => { for (const l of window.__cafe.lights.lamps) l.visible = false; },
  'spill off': () => { window.__cafe.lights.spill.visible = false; },
  'dimmer off': () => { window.__cafe.mood.dimmer.mesh.visible = false; },
  'café off (everything)': () => { window.__cafe.system.cafe.visible = false; },
};
const undo = {
  'shadow map frozen (no shadow pass)': () => { window.__cafe.world.renderer.shadowMap.autoUpdate = true; },
  'shadows off entirely': () => { window.__cafe.lights.house.castShadow = true; },
  'lamps off (6 point lights)': () => { for (const l of window.__cafe.lights.lamps) l.visible = true; },
  'spill off': () => { window.__cafe.lights.spill.visible = true; },
  'dimmer off': () => {},
  'café off (everything)': () => { window.__cafe.system.cafe.visible = true; },
};
for (const [name, apply] of Object.entries(variants)) {
  await page.evaluate(apply);
  await time(3); // let programs recompile
  const ms = await time();
  console.log(`${ms.toFixed(0).padStart(5)} ms/frame  ${name}`);
  if (undo[name]) await page.evaluate(undo[name]);
}
await h.finish?.();
process.exit(0);
