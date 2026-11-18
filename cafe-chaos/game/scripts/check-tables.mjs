/**
 * The tables to open, in the real game from the seat (the Japanese café):
 *  1. a fresh game: the two starting tables open, one ghost (the next table
 *     in this game's order), every other table hidden (not drawn, no seats,
 *     not on the walk grid);
 *  2. the ghost's two looks: faint with the bank short (no tag), ready with
 *     the bank able to pay (darker, the coin and price tag); the Shop
 *     button's red badge counts it (no "TABLE READY" banner: no pop-ups);
 *  3. OPEN in the Shop: refused with the bank short; with enough, no card:
 *     the ghost's table opens (fading in, then folded into the room's batch,
 *     an obstacle on the walk grid), the price taken, saved, and the next
 *     ghost is the next table in the order;
 *  4. the order: ring by ring (front, middle, back), the same on Continue
 *     after a reload, and a new order for a new game;
 *  5. a hidden table does not block paths: the floor where it stands is
 *     walked until it opens;
 *  6. no console errors.
 * Usage: dev server running, then `node scripts/check-tables.mjs`.
 * Output: PASS/FAIL lines; artifacts/tables-*.png (the faint ghost, the ready ghost, just after buying).
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const KEY = 'cafe-chaos/save/v4';
const RINGS = [[7, 9, 11], [6, 10, 3, 4], [1, 5, 12]];
const ready = (h) => h.page.waitForFunction(() => window.__cafe?.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate((k) => { localStorage.removeItem(k); window.__cafe.system.replace(); }, KEY);
    await ready(h);
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 60000) => page.waitForFunction(fn, null, { timeout, polling: 100 }).then(() => true, () => false);
const state = () => page.evaluate((k) => {
  const { game, guests, score, system, shop, strip } = window.__cafe;
  const saved = JSON.parse(localStorage.getItem(k) ?? 'null')?.cafes?.japan ?? null;
  const ghost = system.ghost;
  const shown = system.tables.filter((t) => system.pieces[t].visible);
  return {
    phase: game.phase, tables: [...shop.tables].sort((a, b) => a - b), shown: shown.sort((a, b) => a - b), next: game.nextTable(), order: game.tableOrder(),
    ghost: ghost ? { index: ghost.index, ready: ghost.isReady, tag: ghost.tagShown } : null,
    ghosts: system.cafe.children.filter((c) => /^GhostTable-/.test(c.name)).length,
    seatsShown: guests.seats.filter((s) => !s.hidden).length, seatsOpen: guests.seats.filter((s) => !s.locked).length,
    price: shop.tablePrice, bank: score.bank, refused: shop.refused, saved: saved ? { tables: [...saved.tables].sort((a, b) => a - b), seed: saved.tableSeed } : null,
    banner: strip.banner ? [strip.banner.title, strip.banner.amount] : null, drawer: strip.drawer.panel.buttons.map((b) => b.id),
  };
}, KEY);
const look = async (name) => {
  // Look at the ghost (or the table just opened) from the seat.
  await h.head(SEAT, LOOK);
  await page.waitForTimeout(1200);
  await h.screenshot(`artifacts/tables-${name}.png`);
};
for (const k of ['left', 'right']) await page.evaluate((k) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }), k);
await page.evaluate(() => { const { game } = window.__cafe; game.save.tips = ['goal']; game.click('play-japan'); });
await until(() => ['run', 'tutorial'].includes(window.__cafe.game.phase));
await page.evaluate(() => window.__cafe.game.click('skip'));
await until(() => window.__cafe.game.phase === 'run');
await page.waitForTimeout(1500);

// 1. One ghost, the rest hidden.
let s = await state();
check('a fresh game: the starting tables open, one ghost (the next in the order), every other table hidden', s.tables.join() === '2,8' && s.shown.join() === '2,8' && s.ghosts === 1 && s.ghost?.index === s.next && s.next === s.order[0] && s.seatsOpen === 4, JSON.stringify({ tables: s.tables, shown: s.shown, ghosts: s.ghosts, ghost: s.ghost, next: s.next, seatsOpen: s.seatsOpen }));
const hiddenSeats = await page.evaluate(() => { const { guests, game } = window.__cafe; const next = game.nextTable(); return guests.seats.filter((x) => x.locked && x.table !== next).every((x) => x.hidden) && guests.seats.filter((x) => x.table === next).every((x) => !x.hidden && x.locked); });
check('a hidden table has no seats; the ghost\'s seats are there but not offered', hiddenSeats && s.seatsShown > s.seatsOpen, JSON.stringify({ seatsShown: s.seatsShown, seatsOpen: s.seatsOpen }));

// 2. Faint, then ready.
check('the bank short: the ghost is faint, no tag', s.ghost && !s.ghost.ready && !s.ghost.tag && s.bank < s.price, JSON.stringify({ ghost: s.ghost, bank: s.bank, price: s.price }));
await look('1-faint');
await page.evaluate(() => { window.__cafe.score.bank = 9; });
await until(() => window.__cafe.system.ghost?.tagShown, 8000);
s = await state();
const news = await page.evaluate(() => window.__cafe.strip.shopNews);
check('the bank able to pay: the ghost ready, with its coin and price tag; the Shop button counts it, no banner', s.ghost?.ready && s.ghost.tag && news >= 1 && !s.banner, JSON.stringify({ ghost: s.ghost, banner: s.banner, news }));
await look('2-ready');

// 3. OPEN: refused when short, then the ghost's table opens and the next ghost comes.
await page.evaluate(() => { const { game, score } = window.__cafe; score.bank = 3; game.click('bar-shop'); });
await until(() => window.__cafe.game.phase === 'shopping');
s = await state();
await page.evaluate(() => window.__cafe.game.click('open-table-later'));
const refused = await state();
check('OPEN with the bank short is pale and refused, nothing opened', s.drawer.includes('open-table-later') && refused.refused === s.refused + 1 && refused.tables.join() === '2,8', JSON.stringify({ drawer: s.drawer, refused: refused.refused, tables: refused.tables }));
const pathBefore = await page.evaluate(() => {
  const { system, game } = window.__cafe;
  const t = game.nextTable();
  const p = system.pieces[t].position;
  return { table: t, walkable: system.nav.walkable(p.x, p.z) };
});
await page.evaluate(() => { const { game, score } = window.__cafe; score.bank = 20; game.click('shop-close'); game.click('bar-shop'); });
await until(() => window.__cafe.strip.drawer.panel.buttons.some((b) => b.id === 'open-table'));
const first = (await state()).next;
await page.evaluate(() => window.__cafe.game.click('open-table'));
await page.waitForTimeout(200);
s = await state();
const card = await page.evaluate(() => window.__cafe.game.menu.card.open);
check('OPEN with enough: no card; the ghost\'s table opens, 8 taken, saved; the next ghost is the next in the order', !card && s.tables.includes(first) && s.bank === 12 && s.price === 14 && s.saved?.tables.includes(first) && s.ghost?.index === s.order[1] && s.next === s.order[1], JSON.stringify({ card, opened: first, bank: s.bank, price: s.price, saved: s.saved, ghost: s.ghost, order: s.order }));
await page.evaluate(() => window.__cafe.game.click('shop-close'));
await look('3-bought');
await page.waitForTimeout(1500);
const folded = await page.evaluate((t) => { const r = { batched: 0, meshes: 0, ghosts: 0 }; window.__cafe.system.pieces[t].traverse((n) => { if (!n.isMesh) return; r.meshes++; if (n.userData.batched) r.batched++; }); r.ghosts = window.__cafe.system.cafe.children.filter((c) => /^GhostTable-/.test(c.name)).length; return r; }, first);
check('once faded in, the table is folded into the room\'s batch, and one ghost is left', folded.meshes > 0 && folded.batched === folded.meshes && folded.ghosts === 1, JSON.stringify(folded));

// 5. Hidden tables do not block paths: where the opened table stood was walked before, not after.
const pathAfter = await page.evaluate((t) => { const p = window.__cafe.system.pieces[t].position; return window.__cafe.system.nav.walkable(p.x, p.z); }, first);
check('a hidden table does not block paths (its floor is walked until it opens)', pathBefore.table === first && pathBefore.walkable && !pathAfter, JSON.stringify({ before: pathBefore, after: pathAfter }));

// 4. The order: ring by ring; the same on Continue; new for a new game.
const ringOf = (t) => RINGS.findIndex((r) => r.includes(t));
const rings = s.order.map(ringOf);
check('the order goes ring by ring, front to back, and holds every table once', rings.every((r, i) => i === 0 || r >= rings[i - 1]) && [...s.order].sort((a, b) => a - b).join() === '1,3,4,5,6,7,9,10,11,12', JSON.stringify({ order: s.order, rings }));
const kinds = await page.evaluate((order) => order.map((t) => window.__cafe.system.pieces[t].name), s.order);
let repeats = 0;
for (let i = 1; i < kinds.length; i++) if (kinds[i] === kinds[i - 1]) repeats++;
// Seven of the ten are two-seaters: at least two repeats cannot be avoided (ring by ring); more would be a fault.
check('variety: as few same-kind tables in a row as the rings allow', repeats <= 3, JSON.stringify({ kinds, repeats }));
const before = s.order.join();
await page.evaluate(() => window.__cafe.game.click('bar-pause'));
await until(() => window.__cafe.game.phase === 'paused');
await h.reload();
await ready(h);
await page.evaluate(() => window.__cafe.game.click('play-japan'));
await until(() => window.__cafe.game.phase === 'run');
await page.waitForTimeout(800);
s = await state();
check('Continue after a reload: the same order and the same next ghost', s.order.join() === before && s.ghost?.index === s.order[1] && s.tables.includes(first), JSON.stringify({ order: s.order, before, ghost: s.ghost }));
const orders = new Set([before]);
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => { const { game } = window.__cafe; game.newFor = 'japan'; game.startFresh(); });
  await until(() => ['run', 'tutorial'].includes(window.__cafe.game.phase), 30000);
  await page.evaluate(() => { const { game } = window.__cafe; if (game.phase === 'tutorial') game.click('skip'); });
  await until(() => window.__cafe.game.phase === 'run', 30000);
  orders.add((await state()).order.join());
}
s = await state();
check('a new game draws a new order (and starts again with one ghost)', orders.size >= 2 && s.tables.join() === '2,8' && s.ghosts >= 1 && s.ghost?.index === s.order[0], JSON.stringify({ orders: [...orders], tables: s.tables, ghost: s.ghost }));

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
