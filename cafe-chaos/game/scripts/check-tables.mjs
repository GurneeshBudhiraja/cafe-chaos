/**
 * Locked tables check, in the real game from the seat (docs/MECHANICS-PLAN.md §6):
 *  1. a fresh game opens with the two centre tables (four seats); the other
 *     ten places stand locked, grey, with a padlock tag over each saying 10;
 *     no seat of theirs is offered, and no new guest wishes for the window
 *     or the door (no open seat is there);
 *  2. the hand ray on a tag lights it; a pinch opens the buy card: the café
 *     still and in view, the card naming the table and its seats;
 *  3. NOT NOW: the café moves again;
 *  4. BUY with too little in the bank is refused (the card says how many
 *     more); with enough, the table opens: its ghost and tag go, its seats
 *     are offered, the price is taken, the next price is 20, and it is saved;
 *  5. the price list runs 10, 20, 35 ... 280; the player's choice of table
 *     makes no difference to it;
 *  6. with the main room all open there is nothing more to buy: the café's
 *     floor never grows;
 *  7. the tags are hidden while paused; after a reload the same tables are
 *     open; no console errors.
 * Usage: dev server running, then `node scripts/check-tables.mjs`.
 * Output: PASS/FAIL lines; artifacts/tables-*.png.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const ready = (h) => h.page.waitForFunction(() => window.__cafe?.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => { localStorage.removeItem('cafe-chaos/save/v3'); window.__cafe.system.replace(); });
    await ready(h);
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 60000) => page.waitForFunction(fn, null, { timeout, polling: 100 }).then(() => true, () => false);
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const state = () => page.evaluate(() => {
  const { game, guests, score, system, shop } = window.__cafe;
  const saved = JSON.parse(localStorage.getItem('cafe-chaos/save/v3') ?? 'null');
  return {
    phase: game.phase, locked: [...system.lockedTables].sort((a, b) => a - b), tables: [...shop.tables].sort((a, b) => a - b), tags: game.tags.map((t) => t.table).sort((a, b) => a - b),
    tagsOpen: game.tags.filter((t) => t.panel.open).length, seatsOpen: guests.seats.filter((s) => !s.locked).length, seats: guests.seats.length,
    price: shop.tablePrice, bank: score.bank, speed: +system.timeScale.toFixed(2), cafe: system.cafe.visible, card: game.menu.card.open ? game.menu.cardKind : null,
    buttons: game.menu.card.buttons.map((b) => ({ id: b.id, off: !!b.off })), refused: shop.refused, bought: shop.tablesBought, annex: system.annexOpen, saved: saved?.tables?.sort((a, b) => a - b) ?? null,
  };
});
for (const k of ['left', 'right']) await send('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
await page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run');
await page.waitForTimeout(1000);

// 1. The opening café.
let s = await state();
check('a fresh game: the two centre tables open (four seats), ten places locked with a tag each at 14', s.tables.join() === '2,8' && s.locked.join() === '1,3,4,5,6,7,9,10,11,12' && s.tags.join() === s.locked.join() && s.tagsOpen === 10 && s.seatsOpen === 4 && s.price === 14, JSON.stringify({ tables: s.tables, locked: s.locked, tagsOpen: s.tagsOpen, seatsOpen: s.seatsOpen, price: s.price }));
const ghost = await page.evaluate(() => {
  const { system } = window.__cafe;
  const look = (i) => { let m = null; system.pieces[i].traverse((n) => { if (!m && n.isMesh && n.visible) m = n.material; }); return m ? { name: m.name, opacity: m.opacity, transparent: !!m.transparent } : null; };
  return { locked: look(6), open: look(8) };
});
check('a locked table is drawn grey and see-through; an open one in its own materials', ghost.locked?.name.startsWith('Ghost') && ghost.locked.transparent && ghost.locked.opacity < 0.5 && !ghost.open?.name.startsWith('Ghost'), JSON.stringify(ghost));
const offered = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const V = guests.seats[0].position.constructor;
  const locked = guests.seats.find((x) => x.locked);
  const over = new V(locked.position.x, locked.position.y + 0.05, locked.position.z);
  const aimed = guests.seatAimed(over, over, null, null);
  return { aimed: aimed ? { locked: aimed.locked, table: aimed.table } : null, lockedTable: locked.table };
});
check('a guest held over a locked table is offered no seat there', offered.aimed === null || !offered.aimed.locked, JSON.stringify(offered));
const wishes = await page.evaluate(() => {
  const g = window.__cafe.guests;
  g.level = 10;
  const out = [];
  for (let i = 0; i < 40; i++) out.push(...g.spawn().wishes);
  g.clear();
  g.level = 1;
  return [...new Set(out)].sort();
});
check('with only the centre tables open nobody wishes for the window or the door', !wishes.includes('window') && !wishes.includes('door') && wishes.length > 0, wishes.join());
await h.screenshot('artifacts/tables-1-locked.png');

// 2. The ray on a tag, and a pinch.
const REST = [SEAT.x - 0.25, SEAT.y - 0.35, SEAT.z - 0.15];
const aimAtTag = async (table) => {
  const target = await page.evaluate((table) => {
    const t = window.__cafe.game.tags.find((x) => x.table === table);
    const V = t.panel.mesh.position.constructor;
    t.panel.mesh.updateWorldMatrix(true, false);
    return t.panel.mesh.localToWorld(new V(0, 0, 0)).toArray();
  }, table);
  const d = target.map((v, i) => v - REST[i]);
  const len = Math.hypot(...d);
  const n = d.map((v) => v / len);
  const ax = [0, 0, -1];
  const dot = ax[0] * n[0] + ax[1] * n[1] + ax[2] * n[2];
  const cr = [ax[1] * n[2] - ax[2] * n[1], ax[2] * n[0] - ax[0] * n[2], ax[0] * n[1] - ax[1] * n[0]];
  const w = 1 + dot;
  const ql = Math.hypot(cr[0], cr[1], cr[2], w);
  await send('set_transform', { device: 'hand-right', position: { x: REST[0], y: REST[1], z: REST[2] }, orientation: { x: cr[0] / ql, y: cr[1] / ql, z: cr[2] / ql, w: w / ql } });
  await frames(6);
  return page.evaluate(() => ({ aim: window.__cafe.game.aim.right, hover: window.__cafe.game.tags.map((t) => t.panel.hover).filter(Boolean) }));
};
const tap = async () => {
  await send('set_select_value', { device: 'hand-right', value: 1 });
  await frames(4);
  await send('set_select_value', { device: 'hand-right', value: 0 });
  await frames(4);
};
const lit = await aimAtTag(6);
check('the hand ray on a padlock tag lights it', lit.aim === 'table-6' && lit.hover.join() === 'table-6', JSON.stringify(lit));
await h.screenshot('artifacts/tables-2-aimed.png');
await tap();
await until(() => window.__cafe.game.phase === 'buying', 10000);
await page.waitForTimeout(400);
s = await state();
check('a pinch opens the buy card: the café still and in view, the card naming the table and its seats (BUY pale: the bank is empty)', s.phase === 'buying' && s.speed === 0 && s.cafe && s.card === 'buy' && s.buttons.map((b) => b.id).join() === 'buy-yes,buy-no' && s.buttons[0].off, JSON.stringify({ phase: s.phase, speed: s.speed, cafe: s.cafe, card: s.card, buttons: s.buttons }));
const named = await page.evaluate(() => window.__cafe.game.menu.card.buttons.find((b) => b.id === 'buy-yes')?.label);
check('the card asks BUY 14', named === 'BUY 14', `${named}`);
await send('set_transform', { device: 'hand-right', position: { x: -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
await h.screenshot('artifacts/tables-3-buy.png');

const calls = await page.evaluate(() => window.__cafe.world.renderer.info.render.calls);
check('the tags and the per-table batches keep the draw calls modest (under 400)', calls > 0 && calls < 400, `${calls} draw calls with the buy card up`);

// 3. NOT NOW.
await page.evaluate(() => window.__cafe.game.click('buy-no'));
await frames(3);
s = await state();
check('NOT NOW: the café moves again, nothing bought', s.phase === 'run' && s.speed === 1 && s.card === null && s.tables.join() === '2,8', JSON.stringify({ phase: s.phase, speed: s.speed, card: s.card, tables: s.tables }));

// 4. BUY, short and then with enough.
await page.evaluate(() => window.__cafe.game.click('table-6'));
await until(() => window.__cafe.game.phase === 'buying', 10000);
await page.evaluate(() => window.__cafe.game.click('buy-yes'));
await frames(3);
s = await state();
check('BUY with an empty bank is refused: the card stays, the shop says no', s.phase === 'buying' && s.refused === 1 && s.tables.join() === '2,8', JSON.stringify({ phase: s.phase, refused: s.refused, tables: s.tables }));
await page.evaluate(() => { window.__cafe.score.bank = 16; window.__cafe.game.click('buy-no'); window.__cafe.game.click('table-6'); });
await until(() => window.__cafe.game.phase === 'buying', 10000);
const before = await state();
check('with 16 in the bank the card offers BUY 14 (moss)', before.card === 'buy' && !before.buttons[0].off, JSON.stringify(before.buttons));
await page.evaluate(() => window.__cafe.game.click('buy-yes'));
await until(() => window.__cafe.game.phase === 'run', 10000);
await frames(3);
s = await state();
check('BUY: the table opens, its tag goes, its seats are offered, 14 taken, the next costs 28, and it is saved', s.phase === 'run' && s.tables.join() === '2,6,8' && !s.locked.includes(6) && !s.tags.includes(6) && s.seatsOpen === 6 && s.bank === 2 && s.price === 28 && s.bought === 1 && s.saved?.join() === '2,6,8' && s.speed === 1, JSON.stringify({ tables: s.tables, locked: s.locked, tags: s.tags, seatsOpen: s.seatsOpen, bank: s.bank, price: s.price, saved: s.saved }));
// Its meshes have their own materials back and are folded into the room's batch (hidden under `batched`).
const opened = await page.evaluate(() => { const r = { materials: [], batched: 0, meshes: 0 }; window.__cafe.system.pieces[6].traverse((n) => { if (!n.isMesh) return; r.meshes++; if (n.userData.batched) r.batched++; r.materials.push(n.material.name); }); return r; });
check('the opened table is drawn in its own materials again, folded into the room\'s batch', opened.meshes > 0 && opened.materials.every((m) => !m.startsWith('Ghost')) && opened.batched === opened.meshes, JSON.stringify(opened));
await page.waitForTimeout(500);
await h.screenshot('artifacts/tables-4-opened.png');

// 5. The price list, whichever table.
const prices = [];
for (const table of [12, 1, 11, 9, 3, 10, 4, 7, 5]) {
  await page.evaluate((table) => { window.__cafe.score.bank = 1000; window.__cafe.game.click(`table-${table}`); }, table);
  await until(() => window.__cafe.game.phase === 'buying', 10000);
  prices.push(await page.evaluate(() => window.__cafe.shop.tablePrice));
  await page.evaluate(() => window.__cafe.game.click('buy-yes'));
  await until(() => window.__cafe.game.phase === 'run', 10000);
}
s = await state();
check('the prices run 28, 50, 75 ... 390 whichever table is chosen; the room is then all open', prices.join() === '28,50,75,110,155,205,260,320,390' && s.tables.length === 12 && s.locked.length === 0, JSON.stringify({ prices, tables: s.tables, locked: s.locked }));

// 6. Nothing more to buy: the floor never grows.
await page.waitForTimeout(2500);
s = await state();
check('the room all open: no extension rises, no tag is left, every seat is open', !s.annex && s.tags.length === 0 && s.locked.length === 0 && s.seatsOpen === s.seats && s.seats === 23, JSON.stringify({ annex: s.annex, tags: s.tags, seats: s.seats, seatsOpen: s.seatsOpen }));

// 7. Hidden while paused; kept over a reload (paused first: the game saves as the page hides, so the planted save must come after).
await page.evaluate(() => window.__cafe.game.click('bar-pause'));
await until(() => window.__cafe.game.phase === 'paused');
await page.waitForTimeout(400);
s = await state();
check('paused, the tags are hidden with the café', s.phase === 'paused' && s.tagsOpen === 0, JSON.stringify({ phase: s.phase, tagsOpen: s.tagsOpen }));
await page.evaluate(() => { localStorage.setItem('cafe-chaos/save/v3', JSON.stringify({ ...JSON.parse(localStorage.getItem('cafe-chaos/save/v3')), tables: [2, 8, 6, 12] })); });
await h.reload();
await ready(h);
await page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run');
await page.waitForTimeout(600);
s = await state();
check('after a reload the saved tables are open and the rest locked and tagged', s.tables.join() === '2,6,8,12' && s.locked.join() === '1,3,4,5,7,9,10,11' && s.tagsOpen === 8 && s.price === 50, JSON.stringify({ tables: s.tables, locked: s.locked, tagsOpen: s.tagsOpen, price: s.price }));

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
