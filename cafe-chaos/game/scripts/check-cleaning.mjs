/**
 * Cleaning check, in the real game from the seat (docs/MECHANICS-PLAN.md §7):
 *  1. a guest served and gone leaves its table dirty: a mess on the top,
 *     its seats closed (not offered; an amber dot while a guest is carried);
 *  2. a barista with nothing to serve goes and cleans it (CLEAN.seconds at
 *     the table), then the mess goes and the seats are open again;
 *  3. an order always comes first: a barista off cleaning breaks off when a
 *     guest is seated and nobody is at the bar, serves, and cleans after;
 *  4. on its way back from serving, a dirty table near by is cleaned first;
 *  5. the shop offers the janitor at 120, once: HIRE puts it by the counter's
 *     end; it cleans the longest dirty table first and never serves;
 *  6. the janitor is saved and comes back after a reload; the messes do not
 *     (a clean café); pause freezes a cleaner;
 *  7. a guest who storms off without eating leaves no mess; a dirty table
 *     shows its mess and no floating sign; a guest
 *     let go over a dirty table is refused and goes back to the line;
 *  8. with three baristas off cleaning, one order brings one back, not all;
 *  9. DELETE AND START lets the janitor and the hired baristas go; no
 *     console errors.
 * Usage: dev server running, then `node scripts/check-cleaning.mjs`.
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
const state = () => page.evaluate(() => {
  const { game, guests, mess, baristas, shop, score, system } = window.__cafe;
  return {
    phase: game.phase, dirty: mess.dirtyTables(), dirtied: mess.dirtied, cleaned: mess.cleaned, closed: guests.seats.filter((s) => s.dirty).map((s) => s.table),
    staff: baristas.staff.map((m) => ({ role: m.role, state: m.state, chore: m.chore, cleans: m.cleans, trips: m.trips, at: m.barista.root.position.toArray().map((v) => +v.toFixed(3)) })),
    cleanedCount: baristas.cleanedCount, brokenOff: baristas.cleaningsBrokenOff, orders: baristas.orders.length, served: baristas.servedCount,
    janitor: shop.janitor, janitorPrice: shop.janitorPrice, bank: score.bank, speed: system.timeScale, card: game.menu.card.open ? game.menu.cardKind : null, buttons: game.menu.card.buttons.map((b) => b.id),
    saved: JSON.parse(localStorage.getItem('cafe-chaos/save/v3') ?? 'null'),
  };
});
/** Seat a new guest (its wishes dropped) at the free open seat nearest (x, z), café space; returns the seat's table. */
const seatAt = (x, z) => page.evaluate(([x, z]) => {
  const { guests } = window.__cafe;
  const open = guests.seats.filter((s) => s.occupant === 0 && !s.locked && !s.dirty);
  const seat = open.reduce((best, s) => (Math.hypot(s.position.x - x, s.position.z - z) < Math.hypot(best.position.x - x, best.position.z - z) ? s : best));
  const guest = guests.spawn();
  guest.wishes = [];
  guests.seatGuest(guest.id, seat.index);
  return { guest: guest.id, table: seat.table, seat: seat.index };
}, [x, z]);
for (const k of ['left', 'right']) await page.evaluate((k) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }), k);
await page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run');
// Nobody comes on their own, meals are quick, and all twelve main tables are open (room to work with).
await page.evaluate(() => { const { guests, shop, system, game } = window.__cafe; guests.arrivals = false; guests.mealSeconds = 1.5; shop.restore(shop.hires, system.tables.filter((i) => i < 13), false); game.applyLocks(); });
await page.waitForTimeout(500);

// 1. A guest served and gone: its table is dirty.
const first = await seatAt(0, 0.025);
await until(() => window.__cafe.baristas.servedCount >= 1, 60000);
await until(() => window.__cafe.mess.dirtyTables().length >= 1, 60000);
let s = await state();
check('a guest served and gone leaves its table dirty: a mess on it, its seats closed', s.dirty.join() === `${first.table}` && s.closed.every((t) => t === first.table) && s.closed.length >= 2 && s.dirtied === 1, JSON.stringify({ table: first.table, dirty: s.dirty, closed: s.closed }));
const offered = await page.evaluate((table) => {
  const { guests } = window.__cafe;
  const V = guests.seats[0].position.constructor;
  const seat = guests.seats.find((x) => x.table === table);
  const over = new V(seat.position.x, seat.position.y + 0.05, seat.position.z);
  const aimed = guests.seatAimed(over, over, null, null);
  return aimed ? { table: aimed.table, dirty: aimed.dirty } : null;
}, first.table);
check('a guest held over the dirty table is aimed at its seat as a dirty one (amber, it will not sit there)', offered?.table === first.table && offered.dirty === true, JSON.stringify(offered));
await h.screenshot('artifacts/cleaning-1-dirty.png');

const sign = await page.evaluate((t) => ({ signs: window.__cafe.system.cafe.children.filter((c) => c.name.startsWith('MessSign')).length, mess: window.__cafe.system.cafe.children.filter((c) => c.name === 'table-mess').length }));
check('a dirty table shows its mess and no floating sign (the café kept uncluttered)', sign.signs === 0 && sign.mess === 1, JSON.stringify(sign));

const fit = await page.evaluate(() => {
  const { mess, system } = window.__cafe;
  const out = {};
  for (const t of [1, 8, 11, 12]) {
    mess.soil(t);
    const m = system.cafe.children.filter((c) => c.name === 'table-mess').at(-1);
    const B = new (system.cafe.position.constructor)();
    const box = new (window.__cafe.world.scene.constructor.prototype.constructor === undefined ? Object : Object)();
    void box;
    m.updateMatrixWorld(true);
    const s = m.scale.x;
    out[system.pieces[t].name] = +(s * 3.2).toFixed(2);
  }
  for (const t of [1, 11, 12]) mess.clean(t);
  // These were not real cleanings: the count goes back.
  mess.cleaned -= 3;
  return out;
});
check('the mess fits inside each table top (at most 65 % of its shorter side): 3.0 cm on a two-seater, 2.6 on a four-seater, 1.7 on the bar, 1.6 on the side table', fit['table-2'] <= 3.0 && fit['table-4'] <= 2.6 && fit['bar-2'] <= 1.7 && fit['quiet-corner'] <= 1.6, JSON.stringify(fit));

// 2. The barista, with nothing to serve, cleans it.
await until(() => window.__cafe.baristas.staff.some((m) => m.state === 'toClean' || m.state === 'cleaning'), 60000);
const comingNow = await page.evaluate((t) => window.__cafe.mess.coming.has(t), first.table);
await until(() => window.__cafe.baristas.staff.some((m) => m.state === 'cleaning'), 60000);
const cleaningAt = await state();
await until(() => window.__cafe.mess.cleaned >= 1, 60000);
s = await state();
const wipe = await page.evaluate(() => window.__cafe.baristas.staff[0].lasts);
check('once a barista is on its way the table is marked as being seen to', comingNow, `coming ${comingNow}`);
check('the barista goes to the dirty table and wipes it for 3 s; the mess goes and the seats are open again', cleaningAt.staff[0].state === 'cleaning' && cleaningAt.staff[0].chore === first.table && wipe === 3 && s.cleaned === 1 && s.dirty.length === 0 && s.closed.length === 0 && s.cleanedCount === 1, JSON.stringify({ was: cleaningAt.staff[0], wipe, dirty: s.dirty, closed: s.closed, cleaned: s.cleaned }));
await until(() => window.__cafe.baristas.staff[0].state === 'working', 60000);

// 3. An order comes first: break off, serve, clean after.
await page.evaluate(() => { const { mess } = window.__cafe; mess.soil(1); mess.soil(5); });
await until(() => window.__cafe.baristas.staff[0].state === 'toClean' || window.__cafe.baristas.staff[0].state === 'cleaning', 60000);
const second = await seatAt(0, 0.025);
await until(() => window.__cafe.baristas.cleaningsBrokenOff >= 1, 30000);
const broke = await state();
await until(() => window.__cafe.baristas.servedCount >= 2, 90000);
// Then every table clean again (the second guest's own table too, once it has gone).
await until(() => window.__cafe.mess.cleaned >= 3 && window.__cafe.mess.dirtyTables().length === 0 && !window.__cafe.guests.guests.some((g) => g.state === 'seated'), 180000);
await page.waitForTimeout(2500);
await until(() => window.__cafe.mess.dirtyTables().length === 0, 60000);
s = await state();
check('a guest seated while the only barista is off cleaning: it breaks off, serves, then cleans the rest', broke.brokenOff === 1 && broke.staff[0].state === 'back' && s.served >= 2 && s.cleaned >= 3 && s.dirty.length === 0, JSON.stringify({ broke: broke.staff[0], served: s.served, cleaned: s.cleaned, dirty: s.dirty, secondTable: second.table }));

// 4. On the way back: a dirty table near by is cleaned first.
await until(() => window.__cafe.baristas.staff[0].state === 'working', 60000);
await page.evaluate(() => { window.__cafe.guests.mealSeconds = 60; });
const third = await seatAt(-0.13, 0.025);
await until(() => window.__cafe.baristas.staff[0].state === 'serving', 60000);
// The table beside it (the centre front one, 13 cm away) is dirty as the tray goes down.
await page.evaluate(() => window.__cafe.mess.soil(8));
await until(() => window.__cafe.baristas.staff[0].state !== 'serving', 30000);
const after = await state();
check('an order set down, a dirty table near by is cleaned on the way back (not from the bar)', (after.staff[0].state === 'toClean' || after.staff[0].state === 'cleaning') && after.staff[0].chore === 8, JSON.stringify({ after: after.staff[0], thirdTable: third.table }));
await until(() => window.__cafe.mess.dirtyTables().length === 0, 60000);
// The third guest finishes and its table is cleaned too, so the café is clean before the janitor comes.
await page.evaluate(() => { window.__cafe.guests.mealSeconds = 1.5; });
await until(() => !window.__cafe.guests.guests.some((g) => g.state === 'seated'), 90000);
await page.waitForTimeout(2500);
await until(() => window.__cafe.mess.dirtyTables().length === 0 && window.__cafe.baristas.staff[0].state === 'working', 90000);

// 5. The janitor in the shop.
await page.evaluate(() => { window.__cafe.score.bank = 150; window.__cafe.game.click('bar-shop'); });
await until(() => window.__cafe.game.menu.cardKind === 'shop');
s = await state();
check('the shop offers the janitor at 170 (pale with 150 in the bank)', s.card === 'shop' && s.janitorPrice === 170 && !s.buttons.includes('hire-janitor') && s.buttons.includes('hire-janitor-later'), JSON.stringify({ buttons: s.buttons, janitorPrice: s.janitorPrice }));
await page.evaluate(() => { window.__cafe.score.bank = 180; window.__cafe.game.click('shop-close'); window.__cafe.game.click('bar-shop'); });
await until(() => window.__cafe.game.menu.cardKind === 'shop' && window.__cafe.game.menu.card.buttons.some((b) => b.id === 'hire-janitor'));
await h.screenshot('artifacts/cleaning-2-shop.png');
await page.evaluate(() => window.__cafe.game.click('hire-janitor'));
await until(() => window.__cafe.baristas.janitor !== null, 60000);
s = await state();
const jan = s.staff.find((m) => m.role === 'janitor');
check('HIRE: the janitor is hired for 170, once, and stands by the counter\'s end', s.janitor && s.janitorPrice === null && s.bank === 10 && !!jan && jan.at[0] > 0.05 && jan.at[2] < -0.1 && s.saved?.janitor === true, JSON.stringify({ janitor: s.janitor, price: s.janitorPrice, bank: s.bank, at: jan?.at, saved: s.saved?.janitor }));
await page.evaluate(() => window.__cafe.game.click('shop-close'));
await until(() => window.__cafe.game.phase === 'run');
// Two tables dirty, the older first; a guest seated at the same time: the barista serves, the janitor cleans.
await page.evaluate(() => window.__cafe.mess.soil(3));
await page.waitForTimeout(300);
await page.evaluate(() => window.__cafe.mess.soil(10));
const fourth = await seatAt(0, 0.025);
await until(() => window.__cafe.baristas.janitor?.state === 'toClean', 30000);
const going = await state();
await until(() => window.__cafe.baristas.janitor?.cleans >= 2 && window.__cafe.baristas.servedCount >= 4, 180000);
s = await state();
const janAfter = s.staff.find((m) => m.role === 'janitor');
check('the janitor goes to the longest dirty table first and never serves; the barista serves meanwhile', going.staff.find((m) => m.role === 'janitor').chore === 3 && janAfter.cleans === 2 && janAfter.trips === 0 && s.served >= 4, JSON.stringify({ going: going.staff, cleans: janAfter.cleans, trips: janAfter.trips, served: s.served, fourthTable: fourth.table }));
await h.screenshot('artifacts/cleaning-3-janitor.png');

// 7. A guest who storms off leaves no mess; a guest let go over a dirty table is refused.
await until(() => window.__cafe.mess.dirtyCount === 0 && window.__cafe.baristas.staff.every((m) => m.state === 'working'), 120000);
const dirtiedBefore = await page.evaluate(() => window.__cafe.mess.dirtied);
const stormer = await page.evaluate(() => {
  const { guests, baristas } = window.__cafe;
  baristas.serving = false;
  const seat = guests.seats.find((s) => s.occupant === 0 && !s.locked && !s.dirty && s.table === 1);
  const g = guests.spawn();
  g.wishes = [];
  guests.seatGuest(g.id, seat.index);
  return g.id;
});
await until(() => window.__cafe.guests.guests.find((g) => g.id === window.__stormer)?.state === 'seated' || true, 1000);
await page.evaluate((id) => { window.__stormer = id; }, stormer);
await until(() => window.__cafe.guests.guests.find((g) => g.id === window.__stormer)?.state === 'seated', 30000);
await page.evaluate(() => { window.__cafe.guests.guests.find((g) => g.id === window.__stormer).patience = 0.1; });
await until(() => !window.__cafe.guests.guests.some((g) => g.id === window.__stormer && g.state === 'seated'), 30000);
await page.waitForTimeout(800);
const afterStorm = await page.evaluate(() => ({ dirtied: window.__cafe.mess.dirtied, dirty: window.__cafe.mess.isDirty(1) }));
check('a guest who storms off without eating leaves its table clean', afterStorm.dirtied === dirtiedBefore && !afterStorm.dirty, JSON.stringify({ before: dirtiedBefore, ...afterStorm }));
const refused = await page.evaluate(() => {
  const { guests, mess } = window.__cafe;
  mess.soil(5);
  const dirty = guests.seats.find((s) => s.table === 5);
  const V = dirty.position.constructor;
  const over = new V(dirty.position.x, dirty.position.y + 0.05, dirty.position.z);
  const aimed = guests.seatAimed(over, over, null, null);
  const g = guests.spawn();
  g.wishes = [];
  return { id: g.id, aimed: aimed ? { table: aimed.table, dirty: aimed.dirty } : null };
});
await until(() => window.__cafe.guests.guests.find((g) => g.id === window.__refuse)?.state === 'queued' || false, 100);
await page.evaluate((id) => { window.__refuse = id; }, refused.id);
await until(() => window.__cafe.guests.guests.find((g) => g.id === window.__refuse)?.state === 'queued', 30000);
const letGo = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const g = guests.guests.find((x) => x.id === window.__refuse);
  const dirty = guests.seats.find((s) => s.table === 5 && s.occupant === 0);
  guests.line.splice(guests.line.indexOf(g), 1);
  g.home = { line: 0 };
  g.state = 'held';
  g.target = dirty;
  guests.letGo(g);
  return { refused: guests.refusedDirty, occupant: dirty.occupant, state: g.state };
});
check('a guest held over a dirty table is aimed at it (it glows amber), and let go there is refused, back to the line', refused.aimed?.table === 5 && refused.aimed.dirty && letGo.refused === 1 && letGo.occupant === 0 && letGo.state === 'hop', JSON.stringify({ aimed: refused.aimed, ...letGo }));
await page.evaluate(() => { window.__cafe.baristas.serving = true; });
await until(() => window.__cafe.mess.dirtyCount === 0, 60000);

// 8. Three baristas off cleaning: one order brings back one.
await page.evaluate(() => { const { shop, baristas } = window.__cafe; shop.restore(2, shop.tables, true); });
await until(() => window.__cafe.baristas.baristas.length === 3, 60000);
await until(() => window.__cafe.baristas.staff.every((m) => m.state === 'working'), 60000);
await page.evaluate(() => { const { mess, baristas } = window.__cafe; baristas.janitorHired = false; baristas.dismiss(); for (const t of [1, 3, 11, 12]) mess.soil(t); });
await until(() => window.__cafe.baristas.baristas.filter((m) => m.state === 'toClean' || m.state === 'cleaning').length === 3, 30000);
await seatAt(0.13, 0.025);
await page.waitForTimeout(2500);
const recalled = await page.evaluate(() => ({ broke: window.__cafe.baristas.cleaningsBrokenOff, states: window.__cafe.baristas.baristas.map((m) => m.state) }));
check('three baristas off cleaning: one order brings one back, the others keep cleaning', recalled.states.filter((x) => x === 'back' || x === 'out' || x === 'serving').length === 1, JSON.stringify(recalled));
await until(() => window.__cafe.mess.dirtyCount === 0, 120000);

// 9. DELETE AND START: the janitor and the hired baristas go.
await page.evaluate(() => { const { shop } = window.__cafe; shop.restore(2, shop.tables, true); });
await until(() => window.__cafe.baristas.janitor !== null && window.__cafe.baristas.baristas.length === 3, 60000);
await page.evaluate(() => window.__cafe.game.startFresh());
await page.waitForTimeout(800);
const fresh = await page.evaluate(() => ({ staff: window.__cafe.baristas.staff.map((m) => m.role), janitor: window.__cafe.shop.janitor, price: window.__cafe.shop.janitorPrice }));
check('DELETE AND START lets the janitor and the hired baristas go; the janitor is for hire again', fresh.staff.join() === 'barista' && !fresh.janitor && fresh.price === 170, JSON.stringify(fresh));
await until(() => window.__cafe.game.phase === 'run' || window.__cafe.game.phase === 'tutorial', 30000);
await page.evaluate(() => { const { game } = window.__cafe; if (game.phase === 'tutorial') game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run', 30000);
await page.evaluate(() => { const { shop, game, system } = window.__cafe; window.__cafe.score.bank = 500; shop.restore(0, system.tables.filter((i) => i < 13), false); game.applyLocks(); game.click('bar-shop'); });
await until(() => window.__cafe.game.menu.cardKind === 'shop');
await page.evaluate(() => window.__cafe.game.click('hire-janitor'));
await page.evaluate(() => window.__cafe.game.click('shop-close'));
await until(() => window.__cafe.baristas.janitor !== null, 60000);

// 6. Pause freezes a cleaner; the janitor is saved, the messes are not.
await page.evaluate(() => window.__cafe.mess.soil(7));
await until(() => window.__cafe.baristas.staff.some((m) => m.state === 'toClean' || m.state === 'cleaning'), 30000);
await page.evaluate(() => window.__cafe.game.click('bar-pause'));
await until(() => window.__cafe.game.phase === 'paused');
const p1 = await state();
await page.waitForTimeout(1500);
const p2 = await state();
check('paused, a cleaner stands where it was', p1.speed === 0 && JSON.stringify(p1.staff.map((m) => m.at)) === JSON.stringify(p2.staff.map((m) => m.at)), JSON.stringify({ speed: p1.speed, moved: p1.staff.map((m, i) => Math.hypot(...m.at.map((v, k) => v - p2.staff[i].at[k]))) }));
await h.reload();
await ready(h);
await page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run');
await until(() => window.__cafe.baristas.janitor !== null, 60000);
s = await state();
check('after a reload the janitor is back and the café is clean', s.janitor && s.staff.some((m) => m.role === 'janitor') && s.dirty.length === 0, JSON.stringify({ janitor: s.janitor, roles: s.staff.map((m) => m.role), dirty: s.dirty }));

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
