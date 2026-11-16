/**
 * Reactions check, in the real game (docs/MECHANICS-PLAN.md §9):
 *  1. a guest waiting for its food has its dot and no bubble; its food come,
 *     a "!" for a moment, then how it feels;
 *  2. how it feels follows what it will pay: seated at once with every wish
 *     met, loving it (heart); late with none met, not happy (frown); and in
 *     between a thumbs up or a level face; it pays what the bubble said;
 *  3. a singer shows notes; one storming out shows the storm, cycling its
 *     three pictures no faster than two a second;
 *  4. the feeling shows for 4 s, then the bubble goes (the café kept
 *     uncluttered); a full café: every bubble is one instance of one mesh
 *     (one draw call), seat-mates' bubbles at different heights; no console
 *     errors.
 * Saves artifacts/reactions-*.png.
 * Usage: dev server running, then `node scripts/check-reactions.mjs`.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => { localStorage.removeItem('cafe-chaos/save/v3'); window.__cafe.system.replace(); });
    await h.page.waitForFunction(() => window.__cafe?.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 60000, arg = null) => page.waitForFunction(fn, arg, { timeout, polling: 50 }).then(() => true, () => false);
for (const k of ['left', 'right']) await page.evaluate((k) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }), k);
await page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run');
await page.evaluate(() => { const { guests, shop, system, game, mess, baristas } = window.__cafe; guests.arrivals = false; guests.patienceFrozen = true; guests.mealSeconds = 60; shop.restore(2, system.tables.filter((i) => i < 13), false); game.applyLocks(); mess.enabled = false; guests.clear(); baristas.serving = false; });
await until(() => window.__cafe.baristas.baristas.length === 3, 60000);
/** Seat a new guest at table `t` with `wishes`, its wait used `share` of its patience (as if it waited that long). */
const seat = (t, wishes, share, sings = false) => page.evaluate(([t, wishes, share, sings]) => {
  const { guests } = window.__cafe;
  const s = guests.seats.find((x) => x.occupant === 0 && !x.locked && x.table === t);
  const g = guests.spawn();
  g.wishes = wishes;
  g.sings = sings;
  g.patience = g.patienceFull * (1 - share);
  guests.seatGuest(g.id, s.index);
  return g.id;
}, [t, wishes, share, sings]);
const feeling = (id) => page.evaluate((id) => window.__cafe.guests.reactions.feelingOf(id), id);

// 1. Waiting, then served.
const happy = await seat(8, [], 0);
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', 30000, happy);
const waitingBubble = await feeling(happy);
const dotShown = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id).dial.sprite.visible, happy);
check('waiting for its food: its dot, no bubble', waitingBubble === null && dotShown, JSON.stringify({ waitingBubble, dotShown }));
await page.evaluate(() => { window.__cafe.baristas.serving = true; });
const servedBefore = await page.evaluate(() => window.__cafe.guests.reactions.counts.served ?? 0);
await until((id) => { const f = window.__cafe.guests.reactions.feelingOf(id); return f === 'served' || f === 'loving'; }, 60000, happy);
await until((id) => window.__cafe.guests.reactions.feelingOf(id) === 'loving', 10000, happy);
const servedShown = (await page.evaluate(() => window.__cafe.guests.reactions.counts.served ?? 0)) - servedBefore;
check('its food come: "!" for a moment, then how it feels (seated at once, no wishes: loving it)', servedShown === 1 && (await feeling(happy)) === 'loving', `"!" shown ${servedShown}, then ${await feeling(happy)}`);

// 2. Feelings by what it will pay.
await page.evaluate(() => { window.__cafe.baristas.serving = true; });
const sad = await seat(2, ['window'], 1);
const mid = await seat(6, ['window'], 0.5);
const singer = await seat(12, [], 0.2, true);
await until((ids) => ids.every((id) => { const f = window.__cafe.guests.reactions.feelingOf(id); return f && f !== 'served'; }), 120000, [sad, mid, singer]);
const feelings = { sad: await feeling(sad), mid: await feeling(mid), singer: await feeling(singer) };
check('late with its wish unmet: not happy (frown); half way with some met: in between; a singer: notes', feelings.sad === 'unhappy' && (feelings.mid === 'okay' || feelings.mid === 'happy') && feelings.singer === 'singing', JSON.stringify(feelings));
await page.waitForTimeout(400);
await h.screenshot('artifacts/reactions-1-feelings.png');
const paid = await page.evaluate((id) => {
  const { guests } = window.__cafe;
  const g = guests.guests.find((x) => x.id === id);
  g.eaten = 999;
  return null;
}, sad);
await until(() => window.__cafe.score.log.filter((e) => e.kind === 'paid').length >= 1, 30000);
const sadPaid = await page.evaluate(() => window.__cafe.score.log.find((e) => e.kind === 'paid')?.coins);
check('it pays what its bubble said (a frown is under 4 coins)', sadPaid !== undefined && sadPaid < 4, `${sadPaid} coins`);

// 3. Storming out.
const angry = await seat(7, [], 0.3);
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', 30000, angry);
await page.evaluate((id) => { const { guests, baristas } = window.__cafe; baristas.serving = false; const g = guests.guests.find((x) => x.id === id); g.served = false; g.patience = 0.05; guests.patienceFrozen = false; }, angry);
await until((id) => window.__cafe.guests.reactions.feelingOf(id) === 'storming', 30000, angry);
const cells = await page.evaluate(async () => {
  const seen = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 1600) {
    const m = window.__cafe.guests.reactions.mesh;
    const attr = m.geometry.getAttribute('cell');
    const parts = [];
    for (let i = 0; i < m.count; i++) parts.push(`${attr.getX(i)},${attr.getY(i)}`);
    seen.push({ t: performance.now() - t0, cells: parts.join(' ') });
    await new Promise((r) => setTimeout(r, 50));
  }
  return seen;
});
let changes = 0;
for (let i = 1; i < cells.length; i++) if (cells[i].cells !== cells[i - 1].cells) changes++;
check('storming out: the storm shows, its pictures changing no faster than two a second', changes >= 1 && changes <= 4, `${changes} changes in 1.6 s`);
await h.screenshot('artifacts/reactions-2-storm.png');

// 4a. The feeling shows for a few seconds, then the bubble goes (a fresh guest, served now).
await page.evaluate(() => { const { guests, baristas } = window.__cafe; guests.patienceFrozen = true; baristas.serving = true; });
const fresh = await seat(10, [], 0);
await until((id) => window.__cafe.guests.reactions.feelingOf(id) === 'loving', 120000, fresh);
const gone = await until((id) => window.__cafe.guests.reactions.feelingOf(id) === null, 15000, fresh);
const eatenWhenGone = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.eaten ?? -1, fresh);
check('the feeling shows for about 4 s after the "!", then the bubble goes', gone && eatenWhenGone >= 5 && eatenWhenGone < 6.5, `gone ${gone} at ${eatenWhenGone.toFixed(1)} s of eating`);

// 4. A full café: one instanced mesh.
await page.evaluate(() => { const { guests, baristas } = window.__cafe; guests.patienceFrozen = true; baristas.serving = true; });
for (const t of [1, 3, 4, 5, 9, 10, 11]) {
  for (let k = 0; k < 2; k++) {
    const ok = await page.evaluate((t) => window.__cafe.guests.seats.some((x) => x.occupant === 0 && !x.locked && x.table === t), t);
    if (ok) await seat(t, [], Math.random());
  }
}
await until(() => window.__cafe.guests.reactions.mesh.count >= 3, 180000);
const full = await page.evaluate(() => {
  const m = window.__cafe.guests.reactions.mesh;
  const ys = [];
  const V = m.position.constructor;
  const M = new (window.__cafe.system.cafe.matrix.constructor)();
  for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, M); ys.push(+new V().setFromMatrixPosition(M).y.toFixed(3)); }
  return { count: m.count, instanced: !!m.isInstancedMesh, heights: [...new Set(ys)].length };
});
check('a busy moment: every bubble one instance of one mesh, at more than one height', full.instanced && full.count >= 3 && full.heights >= 2, JSON.stringify(full));
await h.head({ x: -0.72, y: 1.32, z: 0.28 }, { x: -1.3, y: 0.72, z: 0.28 });
await page.waitForTimeout(600);
await h.screenshot('artifacts/reactions-3-full.png');

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
