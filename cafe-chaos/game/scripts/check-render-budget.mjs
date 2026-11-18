/**
 * Render budget check (the headset's frame cost): with the café up in the
 * real game, every table open and all six servers at work, guests are
 * spawned and seated, 0, 3, 6 and 10 (MAX_GUESTS) of them, and after each
 * step what a frame costs is read from the renderer (draw calls and
 * triangles; the emulator has no multiview, so it draws every eye's call
 * twice and both counts are about double the headset's). Then:
 *  1. at 10 guests, no more than 300 draw calls a frame;
 *  2. once the café is up, no shader program is linked during play: not
 *     for the first guest of every species in every piece of clothing, not
 *     for a lit (highlighted) guest, not across a pause and resume;
 *  3. no console errors.
 * Saves artifacts/render-budget-crowded.png (the crowded café, headset view).
 * Usage: dev server running, then `node scripts/check-render-budget.mjs`
 * (APP_URL_GAME picks the server).
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const MAX_CALLS = 300;
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => { localStorage.removeItem('cafe-chaos/save/v4'); window.__cafe.system.replace(); });
    await h.page.waitForFunction(() => window.__cafe?.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 60000) => page.waitForFunction(fn, null, { timeout, polling: 100 }).then(() => true, () => false);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);

// Hands out of the way; the game opened and the first run's steps skipped.
for (const k of ['left', 'right']) await page.evaluate((k) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }), k);
await page.evaluate(() => { const g = window.__cafe.game; g.save.tips = ['goal', 'table', 'shop', 'dirty', 'hurry', 'pair']; g.save.tutorialDone = true; g.click('open'); });
await until(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving);
await page.evaluate(() => window.__cafe.game.click('skip'));
await until(() => window.__cafe.game.phase === 'run');
// Every table open, nobody arriving on their own, nobody leaving; the renderer's counts kept after each frame.
await page.evaluate(() => {
  const { guests, shop, system, game, world } = window.__cafe;
  guests.arrivals = false;
  guests.patienceFrozen = true;
  guests.mealSeconds = 1e6;
  // Nobody gets down while counting (the emulator's frames are slow), and no table goes dirty.
  guests.seatedSeconds = 1e6;
  window.__cafe.mess.enabled = false;
  shop.restore(2, system.tables.filter((i) => i < 13), true);
  game.applyLocks();
  const renderer = world.renderer;
  const render = renderer.render.bind(renderer);
  window.__frame = { calls: 0, triangles: 0 };
  renderer.render = (scene, camera) => { render(scene, camera); window.__frame = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; };
});
// The warm-up (GuestSystem.prewarm) runs once the café is placed: give it time to finish before counting links.
await until(() => window.__cafe.guests.prewarmed || window.__cafe.guests.warm, 30000);
await frames(60);

const cost = async () => { await frames(3); return page.evaluate(() => ({ ...window.__frame, programs: window.__cafe.world.renderer.info.programs.length, links: window.__cafe.budget.probe?.links ?? 0 })); };
/** The programs alive now, by a short name (shader type and custom key) and their full key. */
const programs = () => page.evaluate(() => window.__cafe.world.renderer.info.programs.map((p) => ({ id: p.id, name: p.name, key: p.cacheKey })));
const linkedSince = (was, now) => now.filter((p) => !was.some((q) => q.id === p.id)).map((p) => `${p.name} [${p.key.split(',').slice(-4).join(',')}]`);
const guestsNow = () => page.evaluate(() => window.__cafe.guests.guests.length);
/** Spawn guests (of `looks`, or random) and seat them, until `n` are on stage; wait until all are sitting. */
const fill = async (n, looks = null) => {
  await page.evaluate(([n, looks]) => {
    const { guests } = window.__cafe;
    let i = 0;
    while (guests.guests.length < n) {
      const seat = guests.seats.find((s) => s.occupant === 0 && !s.locked);
      if (!seat) break;
      const g = looks ? guests.spawn(looks[i++ % looks.length]) : guests.spawn();
      g.wishes = [];
      guests.seatGuest(g.id, seat.index);
    }
  }, [n, looks]);
  await until(() => window.__cafe.guests.guests.every((g) => g.state === 'seated' && g.actor.opacity === 1), 120000);
  await frames(30);
};

const upAt = await cost();
const upPrograms = await programs();
console.log(`café up: ${upAt.calls} draw calls, ${(upAt.triangles / 1000).toFixed(0)}k triangles, ${upAt.programs} programs`);
const table = [];
for (const n of [3, 6, 10]) {
  await fill(n);
  const c = await cost();
  table.push({ guests: await guestsNow(), ...c });
  console.log(`${table.at(-1).guests} guests: ${c.calls} draw calls, ${(c.triangles / 1000).toFixed(0)}k triangles, ${c.programs} programs`);
}
const crowded = table.at(-1);
await h.screenshot('artifacts/render-budget-crowded.png');
check(`no more than ${MAX_CALLS} draw calls a frame at ${crowded.guests} guests (both eyes)`, crowded.guests >= 10 && crowded.calls <= MAX_CALLS, `${crowded.calls} draw calls, ${(crowded.triangles / 1000).toFixed(0)}k triangles (the café alone: ${upAt.calls})`);

// 2. No program linked during play: every species in all its clothes, lit, and a pause and resume.
await page.evaluate(() => window.__cafe.guests.clear());
await frames(10);
const before = await cost();
const beforePrograms = await programs();
await page.evaluate(() => window.__cafe.guests.clear());
const looks = await page.evaluate(async () => {
  const cast = await import('/src/guests/cast.ts');
  const style = await import('/src/cafe/style.ts');
  const species = style.isCanada() ? cast.CANADA_SPECIES : cast.SPECIES;
  return species.flatMap((s) => [{ species: s, tint: 0xfaa8c2, tintName: 'sakura pink', outfit: cast.fullOutfit(s).slice(0, 2) }, { species: s, tint: 0xffffff, tintName: 'plain', outfit: cast.fullOutfit(s).slice(2, 4) }]);
});
await fill(Math.min(10, looks.length), looks);
// One lit up (a hand near it), one cold if the café has the cold.
await page.evaluate(() => { const g = window.__cafe.guests.guests[0]; g.actor.setHighlight(1); window.__cafe.guests.guests[1]?.actor.setCold?.(true); });
await frames(10);
const dressed = await cost();
await page.evaluate(() => window.__cafe.game.pause());
await frames(20);
const paused = await cost();
await page.evaluate(() => window.__cafe.game.resume());
await frames(20);
const resumed = await cost();
const linksCounted = resumed.links - upAt.links;
const fresh = linkedSince(upPrograms, await programs());
check('no shader program is linked after the café is up (a crowd; every species dressed, lit, cold; a pause and resume)', linksCounted <= 0, `links counted ${linksCounted} (programs ${upAt.programs} up, ${before.programs} crowded, ${dressed.programs} dressed, ${paused.programs} paused, ${resumed.programs} resumed)${fresh.length ? `; new: ${fresh.join(' | ')}` : ''}`);

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(JSON.stringify({ cafe: upAt, guests: table }));
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
