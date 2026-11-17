/**
 * Locked tables check, in the real game from the seat (docs/MECHANICS-PLAN.md;
 * the tables are bought in the Shop since the first playtest):
 *  1. a fresh game opens with the two centre tables (four seats); the other
 *     ten places stand locked, grey and see-through, with no padlock or tag
 *     over them; no seat of theirs is offered, and no new guest wishes for
 *     the window or the door (no open seat is there);
 *  2. the Shop drawer has a Table column: OPEN 8, pale with the bank short
 *     (a press refused); with enough, OPEN opens the locked table nearest
 *     the café's front, in its own materials, folded into the room's batch;
 *     its seats are offered, the price is taken, the next is 14, it is saved,
 *     and confetti flies from it;
 *  3. OPEN again and again: the prices run 14, 22 ... 190, the tables open
 *     front to back; then the column says All open; the floor never grows;
 *  4. the bank first reaching the next table's price: "TABLE READY" and the
 *     price on the bar for a moment, with a pop; once a price;
 *  5. after a reload the saved tables are open and the rest locked; no
 *     console errors.
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
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const state = () => page.evaluate(() => {
  const { game, guests, score, system, shop, strip } = window.__cafe;
  const saved = JSON.parse(localStorage.getItem('cafe-chaos/save/v3') ?? 'null');
  const drawer = strip.drawer.panel;
  return {
    phase: game.phase, locked: [...system.lockedTables].sort((a, b) => a - b), tables: [...shop.tables].sort((a, b) => a - b),
    seatsOpen: guests.seats.filter((s) => !s.locked).length, seats: guests.seats.length,
    price: shop.tablePrice, bank: score.bank, speed: +system.timeScale.toFixed(2), refused: shop.refused, bought: shop.tablesBought, annex: system.annexOpen,
    drawer: drawer.open, buttons: drawer.buttons.map((b) => b.id), tableLabel: drawer.buttons.find((b) => b.id.startsWith('open-table'))?.label ?? null,
    saved: saved?.tables?.sort((a, b) => a - b) ?? null, banner: strip.banner ? [strip.banner.title, strip.banner.amount] : null,
  };
});
for (const k of ['left', 'right']) await page.evaluate((k) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }), k);
await page.evaluate(() => { const { game } = window.__cafe; game.save.tips = ['goal']; game.click('open'); game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run');
await page.waitForTimeout(1000);

// 1. The opening café.
let s = await state();
const tagged = await page.evaluate(() => { let n = 0; window.__cafe.system.cafe.traverse((o) => { if (/^LockTag/.test(o.name)) n++; }); return n; });
check('a fresh game: the two centre tables open (four seats), ten places locked, no padlock over any', s.tables.join() === '2,8' && s.locked.join() === '1,3,4,5,6,7,9,10,11,12' && s.seatsOpen === 4 && s.price === 8 && tagged === 0, JSON.stringify({ tables: s.tables, locked: s.locked, seatsOpen: s.seatsOpen, price: s.price, tags: tagged }));
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
  return { aimed: aimed ? { locked: aimed.locked, table: aimed.table } : null };
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

// 2. The Shop's Table column.
await page.evaluate(() => window.__cafe.game.click('bar-shop'));
await until(() => window.__cafe.game.phase === 'shopping');
s = await state();
check('the Shop drawer has a Table column: OPEN 8, pale with the bank short', s.drawer && s.buttons.includes('open-table-later') && s.tableLabel === 'OPEN 8', JSON.stringify({ buttons: s.buttons, label: s.tableLabel }));
await page.evaluate(() => window.__cafe.game.click('open-table-later'));
s = await state();
check('OPEN with the bank short is refused, nothing opened', s.refused === 1 && s.tables.join() === '2,8', JSON.stringify({ refused: s.refused, tables: s.tables }));
await page.evaluate(() => { window.__cafe.score.bank = 16; window.__cafe.game.click('shop-close'); window.__cafe.game.click('bar-shop'); });
await until(() => window.__cafe.game.phase === 'shopping' && window.__cafe.strip.drawer.panel.buttons.some((b) => b.id === 'open-table'));
await h.screenshot('artifacts/tables-2-shop.png');
// Which table should open: the locked one nearest the café's front middle.
const expected = await page.evaluate(() => window.__cafe.game.nextTable());
const nearest = await page.evaluate(() => {
  const { system } = window.__cafe;
  const V = system.cafe.position.constructor;
  const front = system.cafe.worldToLocal(system.frontEdge(new V()));
  const p = new V();
  return [...system.lockedTables].map((t) => { system.tableTop(t, p); return [t, Math.hypot(p.x - front.x, p.z - front.z)]; }).sort((a, b) => a[1] - b[1])[0];
});
const burstsBefore = await page.evaluate(() => window.__cafe.strip.confettiAge);
await page.evaluate(() => window.__cafe.game.click('open-table'));
await frames(3);
s = await state();
const flew = await page.evaluate(() => window.__cafe.strip.confettiAge < 1);
check('OPEN opens the locked table nearest the café\'s front, its seats offered, 8 taken, the next 14, saved, confetti from it', s.tables.includes(expected) && Math.abs(nearest[1] - (await page.evaluate((t) => { const { system } = window.__cafe; const V = system.cafe.position.constructor; const front = system.cafe.worldToLocal(system.frontEdge(new V())); const p = new V(); system.tableTop(t, p); return Math.hypot(p.x - front.x, p.z - front.z); }, expected))) < 0.011 && s.seatsOpen === 6 && s.bank === 8 && s.price === 14 && s.bought === 1 && s.saved?.includes(expected) && flew && s.tableLabel === 'OPEN 14', JSON.stringify({ opened: expected, nearest, seatsOpen: s.seatsOpen, bank: s.bank, price: s.price, saved: s.saved, flew, label: s.tableLabel, burstsBefore }));
const opened = await page.evaluate((t) => { const r = { materials: [], batched: 0, meshes: 0 }; window.__cafe.system.pieces[t].traverse((n) => { if (!n.isMesh) return; r.meshes++; if (n.userData.batched) r.batched++; r.materials.push(n.material.name); }); return r; }, expected);
check('the opened table is drawn in its own materials again, folded into the room\'s batch', opened.meshes > 0 && opened.materials.every((m) => !m.startsWith('Ghost')) && opened.batched === opened.meshes, JSON.stringify(opened));
await page.waitForTimeout(500);
await h.screenshot('artifacts/tables-3-opened.png');

// 3. The rest, in order, at the listed prices.
const prices = [];
const order = [expected];
for (let i = 0; i < 9; i++) {
  const next = await page.evaluate(() => { window.__cafe.score.bank = 1000; return { table: window.__cafe.game.nextTable(), price: window.__cafe.shop.tablePrice }; });
  prices.push(next.price);
  order.push(next.table);
  await page.evaluate(() => window.__cafe.game.click('open-table'));
  await frames(2);
}
const dist = await page.evaluate((order) => { const { system } = window.__cafe; const V = system.cafe.position.constructor; const front = system.cafe.worldToLocal(system.frontEdge(new V())); const p = new V(); return order.map((t) => { system.tableTop(t, p); return +Math.hypot(p.x - front.x, p.z - front.z).toFixed(3); }); }, order);
s = await state();
check('OPEN again and again: the prices run 14, 22 ... 190 and the tables open front to back', prices.join() === '14,22,32,45,62,85,115,150,190' && dist.every((d, i) => i === 0 || d >= dist[i - 1] - 0.011), JSON.stringify({ prices, order, dist }));
check('everything open: the Table column says All open, every seat is open, the floor never grew', s.locked.length === 0 && s.tableLabel === null && s.seatsOpen === s.seats && s.seats === 23 && !s.annex, JSON.stringify({ locked: s.locked, label: s.tableLabel, seats: s.seats, seatsOpen: s.seatsOpen }));
await page.evaluate(() => window.__cafe.game.click('shop-close'));
await until(() => window.__cafe.game.phase === 'run');

// 4. TABLE READY on the bar when the bank first reaches the next price: a fresh café.
await page.evaluate(() => { const { game, score } = window.__cafe; score.bank = 0; game.startFresh(); });
await until(() => window.__cafe.game.phase === 'run' || window.__cafe.game.phase === 'tutorial', 30000);
await page.evaluate(() => { const { game } = window.__cafe; if (game.phase === 'tutorial') game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run', 30000);
await page.waitForTimeout(1000);
const popsBefore = await page.evaluate(() => window.__cafe.sound.played.note ?? 0);
await page.evaluate(() => { window.__cafe.score.bank = 9; });
const banner = await until(() => window.__cafe.strip.banner?.title === 'TABLE READY', 5000);
s = await state();
const pops = await page.evaluate(() => window.__cafe.sound.played.note ?? 0);
check('the bank reaching the next table\'s price: "TABLE READY" and the price on the bar, with a pop', banner && s.banner?.join() === 'TABLE READY,8' && pops > popsBefore, JSON.stringify({ banner: s.banner, pops: [popsBefore, pops] }));
await h.screenshot('artifacts/tables-4-ready.png');
// The banner's 3 s (in the page's frames, which the emulator runs slower than real time), then the bank dips and comes back.
await until(() => window.__cafe.strip.banner === null, 20000);
await page.evaluate(() => { window.__cafe.score.bank = 2; });
await frames(4);
await page.evaluate(() => { window.__cafe.score.bank = 9; });
await page.waitForTimeout(800);
check('once a price (not again when the bank dips and comes back)', (await state()).banner === null, JSON.stringify((await state()).banner));

// 5. Kept over a reload (paused first: the game saves as the page hides, so the planted save must come after).
await page.evaluate(() => window.__cafe.game.click('bar-pause'));
await until(() => window.__cafe.game.phase === 'paused');
await page.evaluate(() => { localStorage.setItem('cafe-chaos/save/v3', JSON.stringify({ ...JSON.parse(localStorage.getItem('cafe-chaos/save/v3')), tables: [2, 8, 6, 12] })); });
await h.reload();
await ready(h);
await page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run');
await page.waitForTimeout(600);
s = await state();
check('after a reload the saved tables are open and the rest locked', s.tables.join() === '2,6,8,12' && s.locked.join() === '1,3,4,5,7,9,10,11' && s.price === 22, JSON.stringify({ tables: s.tables, locked: s.locked, price: s.price }));

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
