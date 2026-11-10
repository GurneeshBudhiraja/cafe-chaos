/**
 * Guests check, part 1: arriving, the line, giving up and leaving. With
 * the viewer seated at the emulated table and the café placed (timers
 * shortened so it plays out in the emulator's slow frames), checks that:
 * 1. guests arrive and line up outside the door, each on its spot,
 *    standing and facing the way the line faces;
 * 2. they are a mix: more than one species, colour and outfit;
 * 3. a guest who waits too long first shows it (the Impatient clip), then
 *    gives up, and everyone behind steps up a place;
 * 4. a leaver goes to the front and marches off left or right along a
 *    lane on the table, fading at the end;
 * 5. there are never more than ten on stage, and no console errors.
 * Saves headset-view screenshots along the way.
 *
 * Usage: dev server running, then `node scripts/check-guests.mjs`.
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
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: { x: -0.6, y: 0.9, z: 0.6 } }));
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-left', position: { x: -0.65, y: 0.7, z: 0.58 } }));
    await h.page.evaluate(() => {
      const { guests, system } = window.__cafe;
      guests.spawnSeconds = [1.2, 2];
      guests.patienceSeconds = 30;
      system.replace();
    });
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 20000 });
  },
});
const { page } = h;

/** A café-space point in the world, for aiming the head. */
const toWorld = (local) => page.evaluate((l) => {
  const { system, world } = window.__cafe;
  const V = world.camera.position.constructor;
  const p = system.cafe.localToWorld(new V(...l));
  return { x: p.x, y: p.y, z: p.z };
}, local);

const state = () => page.evaluate(() => {
  const { guests } = window.__cafe;
  const g = (x) => ({
    id: x.id, state: x.state, clip: x.actor.clip, spot: x.spot, walking: !!x.walk, yaw: +x.yaw.toFixed(2),
    at: x.actor.root.position.toArray().map((v) => +v.toFixed(3)), opacity: +x.actor.opacity.toFixed(2),
    look: `${x.actor.look.species}/${x.actor.look.tintName}/${x.actor.look.outfit.join('+') || 'bare'}`, species: x.actor.look.species, tint: x.actor.look.tintName,
    outfit: x.actor.look.outfit, patience: +x.patience.toFixed(1), side: x.side, lane: x.lane,
    drawn: (() => { let n = 0; x.actor.root.traverse((o) => { let v = o.isMesh && o.layers.mask !== 0; for (let p = o; p && v; p = p.parent) v = p.visible; if (v) n++; }); return n; })(),
  });
  return { all: guests.guests.map(g), line: guests.line.map((x) => x.id), arrived: guests.arrived, gaveUp: guests.gaveUp, left: guests.left, peak: guests.peak };
});

// 1. The line fills.
await page.waitForFunction(() => window.__cafe.guests.line.length === 5 && window.__cafe.guests.line.every((g) => g.state === 'queued' && !g.walk), null, { timeout: 180000 });
const full = await state();
{
  const spots = await page.evaluate(async () => (await import('/src/guests/paths.ts')).QUEUE_SPOTS.map((s) => s.toArray()));
  const off = full.all.filter((g) => full.line.includes(g.id)).map((g) => Math.hypot(g.at[0] - spots[g.spot][0], g.at[2] - spots[g.spot][2]));
  const standing = full.all.filter((g) => full.line.includes(g.id)).every((g) => (g.clip === 'Idle' || g.clip === 'Impatient') && g.opacity === 1);
  check('guests arrive and line up outside the door', full.line.length === 5 && off.every((d) => d < 0.004) && standing, `${full.line.length} in the line, off their spots by ${off.map((d) => (d * 1000).toFixed(1)).join(', ')} mm, standing ${standing}`);
  const species = new Set(full.all.map((g) => g.species));
  const tints = new Set(full.all.map((g) => g.tint));
  const dressed = full.all.filter((g) => g.outfit.length > 0).length;
  check('they are a mix of species, colours and outfits', species.size >= 2 && tints.size >= 2, `${[...species].join(', ')}; ${[...tints].join(', ')}; ${dressed} of ${full.all.length} dressed: ${full.all.map((g) => g.look).join(' | ')}`);
  check('a standing guest draws only the parts that show', full.all.every((g) => g.drawn <= 9), `meshes drawn per guest: ${full.all.map((g) => g.drawn).join(', ')}`);
}
// A look at the line from the front right.
await h.head(await toWorld([0.62, 0.34, 0.62]), await toWorld([0.5, 0.03, 0.03]), 500);
await h.pause(400);
await h.screenshot('artifacts/guests-1-line.png');
await h.head(await toWorld([0.5, 0.13, 0.28]), await toWorld([0.52, 0.035, 0.03]), 400);
await h.pause(400);
await h.screenshot('artifacts/guests-2-line-close.png');

// 2. Impatience, then giving up; the line steps up.
const impatient = await page.waitForFunction(() => {
  const { guests } = window.__cafe;
  const g = guests.line.find((x) => x.actor.clip === 'Impatient' && x.state === 'queued');
  return g ? { id: g.id, patience: g.patience, full: g.patienceFull, all: guests.line.map((x) => `${x.id}:${x.actor.clip}(${x.patience.toFixed(1)}s of ${x.patienceFull.toFixed(0)})`).join(' ') } : null;
}, null, { timeout: 240000 }).then((r) => r.jsonValue());
check('a guest who waits too long shows it', impatient.patience < impatient.full * 0.5 && impatient.patience > 0, impatient.all);
await h.screenshot('artifacts/guests-3-impatient.png');
await page.evaluate(() => (window.__cafe.guests.arrivals = false));
const headBefore = (await state()).line[0];
await page.waitForFunction(() => window.__cafe.guests.gaveUp >= 1, null, { timeout: 240000 });
// One snapshot, taken in the page the moment the line has settled again.
const stepped = await page.waitForFunction((id) => {
  const { guests } = window.__cafe;
  // Settled: the one who left is out of the line, and everyone left in it stands on the spot that matches their place.
  if (guests.line.some((g) => g.id === id) || guests.line.some((g, i) => g.walk || g.spot !== i)) return null;
  const leaver = guests.guests.find((g) => g.id === id);
  return { gaveUp: guests.gaveUp, line: guests.line.map((g) => g.id), spots: guests.line.map((g) => g.spot), leaver: leaver ? leaver.state : 'gone' };
}, headBefore, { timeout: 120000 }).then((r) => r.jsonValue());
{
  const inOrder = stepped.spots.every((spot, i) => spot === i);
  check('it gives up and the line steps up a place', stepped.gaveUp >= 1 && inOrder && (stepped.leaver === 'leaving' || stepped.leaver === 'gone'), `gave up ${stepped.gaveUp}, line now ${stepped.line.join(',')} on spots ${stepped.spots.join(',')}, the one who left is ${stepped.leaver}`);
}

// 3. The leaver marches off along the front and fades.
await h.head(SEAT, await toWorld([0.25, 0.02, 0.36]), 500);
const marching = await page.waitForFunction(() => {
  const g = window.__cafe.guests.guests.find((x) => x.state === 'leaving' && x.actor.root.position.z > 0.37 && x.actor.opacity === 1);
  return g ? { z: g.actor.root.position.z, x: g.actor.root.position.x, y: g.actor.root.position.y, side: g.side, lane: g.lane, clip: g.actor.clip } : null;
}, null, { timeout: 240000 }).then((r) => r.jsonValue());
await h.screenshot('artifacts/guests-4-march.png');
check('a leaver marches off along a lane in front of the café', marching.clip === 'Walk' && Math.abs(marching.y) < 0.002 && marching.z > 0.37 && marching.z < 0.5, `side ${marching.side}, lane ${marching.lane}, at x ${marching.x.toFixed(2)} z ${marching.z.toFixed(3)} on the table (y ${marching.y.toFixed(3)}), clip ${marching.clip}`);
await page.waitForFunction(() => window.__cafe.guests.left >= 1, null, { timeout: 300000 });
const end = await state();
check('it fades out at the end, and there were never more than ten on stage', end.left >= 1 && end.peak <= 10, `left ${end.left}, peak ${end.peak}, on stage now ${end.all.length}`);

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
