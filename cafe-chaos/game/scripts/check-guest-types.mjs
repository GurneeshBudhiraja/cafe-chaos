/**
 * Guest types check, in the real game (docs/MECHANICS-PLAN.md §3, §5):
 *  1. how often by level: no hurried guests at level 1, 10 % from level 2
 *     rising to 20 %; pairs from level 4 at 15 % rising to 25 %;
 *  2. a hurried guest waits 0.6 of the usual in the line (never under 15 s)
 *     and 30 s for its food; its dot has an hourglass and a koi rim;
 *  3. it pays 1.5 times (15 for a perfect visit);
 *  4. its order is served first: two orders waiting, the hurried one's
 *     table is the first a barista goes to;
 *  5. a pair: two friends arrive together, linked, each with the friend
 *     wish (and no wish that clashes with sharing a table), a heart on
 *     the dot, the card saying "With <name>";
 *  6. seated at one table both have the friend wish met; seated apart,
 *     neither has; a friend who gives up leaves it unmet; no console errors.
 * Usage: dev server running, then `node scripts/check-guest-types.mjs`.
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
const until = (fn, timeout = 60000, arg = null) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
for (const k of ['left', 'right']) await page.evaluate((k) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }), k);
await page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run');
// Every main table open, nobody arriving on their own, the clean café kept clean (no messes in the way).
await page.evaluate(() => { const { guests, shop, system, game, mess } = window.__cafe; guests.arrivals = false; guests.patienceFrozen = true; shop.restore(shop.hires, system.tables.filter((i) => i < 13), false); game.applyLocks(); mess.enabled = false; guests.clear(); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack?.split('\n').slice(0, 4).join(' | ')));

// 1. How often.
const rates = await page.evaluate(async () => {
  const r = await import('/src/game/rules.ts');
  const levels = [1, 2, 3, 4, 6, 10, 20];
  return { hurry: levels.map((l) => +r.hurryChance(l).toFixed(2)), pairs: levels.map((l) => +r.pairChance(l).toFixed(2)) };
});
check('hurried guests from level 2 (10 % rising to 20 %); pairs from level 4 (15 % rising to 25 %)', rates.hurry.join() === '0,0.1,0.12,0.14,0.18,0.2,0.2' && rates.pairs.join() === '0,0,0,0.15,0.19,0.25,0.25', JSON.stringify(rates));

// 2. A hurried guest.
const hurried = await page.evaluate(() => {
  const { guests } = window.__cafe;
  guests.hurryChance = 1;
  const g = guests.spawn();
  guests.hurryChance = 0;
  return { id: g.id, hurried: g.hurried, patience: +g.patienceFull.toFixed(2), usual: guests.patienceSeconds };
});
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'queued', 30000, hurried.id);
await page.waitForTimeout(300);
const dot = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id).dial.drawn, hurried.id);
check('a hurried guest waits 0.6 of the usual in the line (15 s at least), and its dot has the hourglass', hurried.hurried && hurried.patience >= 15 && hurried.patience <= hurried.usual * 0.6 * 1.16 && /\|true\|false$/.test(dot), JSON.stringify({ ...hurried, dot }));
await h.screenshot('artifacts/types-1-hurried.png');
const seatedFor = await page.evaluate((id) => {
  const { guests, baristas } = window.__cafe;
  baristas.serving = false;
  const seat = guests.seats.find((s) => s.occupant === 0 && !s.locked && s.table === 8);
  guests.guests.find((g) => g.id === id).wishes = [];
  guests.seatGuest(id, seat.index);
  return seat.index;
}, hurried.id);
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', 30000);
const seatedPatience = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id).patienceFull, hurried.id);
check('seated, a hurried guest has 30 s for its food (the others 40)', seatedPatience === 30, `${seatedPatience} s`);

// 3. The pay.
const pay = await page.evaluate(() => {
  const { score, system } = window.__cafe;
  const at = new system.cafe.position.constructor(0, 0.1, 0);
  const before = score.bank;
  score.score({ kind: 'paid', guest: 0, share: 0, at, wishes: { met: 2, of: 2 }, hurried: true });
  const top = score.bank - before;
  score.score({ kind: 'paid', guest: 0, share: 1, at, wishes: { met: 0, of: 1 }, hurried: true });
  return { top, bottom: score.bank - before - top };
});
check('a hurried guest pays 1.5 times: 15 for a perfect visit, 2 for the least', pay.top === 15 && pay.bottom === 2, JSON.stringify(pay));

// 4. Served first: a guest at the far left seated first, the hurried guest (already seated, centre) waiting too.
const first = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const seat = guests.seats.find((s) => s.occupant === 0 && !s.locked && s.table === 7);
  const g = guests.spawn();
  g.wishes = [];
  guests.seatGuest(g.id, seat.index);
  return g.id;
});
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', 30000);
// The hurried guest sat down earlier; make its order the later one, so only the hurry puts it first.
await page.evaluate(([h, n]) => { const { baristas } = window.__cafe; const oh = baristas.orders.find((o) => o.guest === h); const on = baristas.orders.find((o) => o.guest === n); if (oh && on) oh.placedAt = on.placedAt + 10; baristas.serving = true; }, [hurried.id, first]);
await until(() => window.__cafe.baristas.staff.some((m) => m.order), 30000);
const sent = await page.evaluate(() => window.__cafe.baristas.staff.find((m) => m.order)?.order.guest);
const orders = await page.evaluate(() => window.__cafe.baristas.orders.map((o) => ({ guest: o.guest, urgent: o.urgent, at: +o.placedAt.toFixed(1), served: o.served })));
check('the hurried guest\'s order is served first, though placed later', sent === hurried.id, `first served: guest ${sent} (hurried ${hurried.id}, other ${first}); orders ${JSON.stringify(orders)}`);

// 5. A pair.
await page.evaluate(() => { const { guests, baristas } = window.__cafe; baristas.serving = false; guests.clear(); guests.level = 6; guests.queueCap = 4; });
const pair = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const a = guests.spawn();
  const b = guests.spawn();
  guests.pair(a, b);
  return { a: { id: a.id, name: a.name, friend: a.friend, wishes: a.wishes, hurried: a.hurried }, b: { id: b.id, name: b.name, friend: b.friend, wishes: b.wishes } };
});
const clash = (w) => w.includes('alone') || w.includes('company');
check('a pair: two friends, linked, each with the friend wish first and none that clash with sharing a table', pair.a.friend === pair.b.id && pair.b.friend === pair.a.id && pair.a.wishes[0] === 'friend' && pair.b.wishes[0] === 'friend' && !clash(pair.a.wishes) && !clash(pair.b.wishes) && !pair.a.hurried, JSON.stringify(pair));
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'queued', 30000, pair.a.id);
await page.waitForTimeout(300);
const pairDot = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id).dial.drawn, pair.a.id);
check('the pair\'s dots carry the heart', /\|false\|true$/.test(pairDot), pairDot);
await h.screenshot('artifacts/types-2-pair.png');

// 6. Seated together, then apart.
const together = await page.evaluate(([a, b]) => {
  const { guests } = window.__cafe;
  for (const id of [a, b]) guests.guests.find((g) => g.id === id).wishes = ['friend'];
  const seats = guests.seats.filter((s) => s.occupant === 0 && !s.locked && s.table === 8);
  guests.seatGuest(a, seats[0].index);
  guests.seatGuest(b, seats[1].index);
}, [pair.a.id, pair.b.id]);
await until(([a, b]) => [a, b].every((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated'), 30000, [pair.a.id, pair.b.id]);
await page.waitForTimeout(500);
const metTogether = await page.evaluate(([a, b]) => [a, b].map((id) => window.__cafe.guests.guests.find((g) => g.id === id).wishMet), [pair.a.id, pair.b.id]);
check('seated at one table, both friends have their wish met', JSON.stringify(metTogether) === '[[true],[true]]', JSON.stringify(metTogether));
const apart = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const a = guests.spawn();
  const b = guests.spawn();
  guests.pair(a, b);
  a.wishes = ['friend'];
  b.wishes = ['friend'];
  guests.seatGuest(a.id, guests.seats.find((s) => s.occupant === 0 && !s.locked && s.table === 2).index);
  guests.seatGuest(b.id, guests.seats.find((s) => s.occupant === 0 && !s.locked && s.table === 12).index);
  return [a.id, b.id];
});
await page.waitForTimeout(1500);
const metApart = await page.evaluate((ids) => ids.map((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.wishMet), apart);
check('seated at different tables, neither has it met', JSON.stringify(metApart) === '[[false],[false]]', JSON.stringify(metApart));
const lost = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const a = guests.spawn();
  const b = guests.spawn();
  guests.pair(a, b);
  a.wishes = ['friend'];
  b.wishes = ['friend'];
  guests.seatGuest(a.id, guests.seats.find((s) => s.occupant === 0 && !s.locked && s.table === 6).index);
  return [a.id, b.id];
});
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', 30000, lost[0]);
const tentative = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id).wishMet, lost[0]);
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'queued', 30000, lost[1]);
await page.evaluate((id) => { const g = window.__cafe.guests.guests.find((x) => x.id === id); g.patience = 0.05; window.__cafe.guests.patienceFrozen = false; }, lost[1]);
await until((id) => !window.__cafe.guests.line.some((g) => g.id === id), 30000, lost[1]);
const afterLoss = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id).wishMet, lost[0]);
check('seated first with room for its friend it counts as met; the friend giving up makes it unmet', JSON.stringify(tentative) === '[true]' && JSON.stringify(afterLoss) === '[false]', JSON.stringify({ tentative, afterLoss }));

// 7. Pairs through the arrivals themselves: the friend walks up a moment behind, both share the same other wishes.
await page.evaluate(() => { const { guests } = window.__cafe; guests.clear(); guests.level = 8; guests.queueCap = 4; guests.pairChance = 0; guests.forcePair = true; guests.spawnSeconds = [3, 3]; guests.arrivals = true; });
await until(() => window.__cafe.guests.guests.length >= 2, 20000);
const arrivedPair = await page.evaluate(() => {
  const { guests } = window.__cafe;
  guests.arrivals = false;
  const [a, b] = guests.guests;
  return { a: { id: a.id, friend: a.friend, wishes: a.wishes }, b: { id: b.id, friend: b.friend, wishes: b.wishes }, gap: +Math.abs(a.actor.root.position.distanceTo(b.actor.root.position)).toFixed(3) };
});
const same = JSON.stringify(arrivedPair.a.wishes) === JSON.stringify(arrivedPair.b.wishes);
const noClash = [arrivedPair.a, arrivedPair.b].every((g) => !g.wishes.some((w) => ['quiet', 'alone', 'company'].includes(w)));
check('a pair arrives through the arrivals: linked, the friend a step behind, the same wishes (none that clash with sharing)', arrivedPair.a.friend === arrivedPair.b.id && arrivedPair.b.friend === arrivedPair.a.id && same && noClash && arrivedPair.gap > 0.01, JSON.stringify(arrivedPair));

// 8. The first hurried guest comes on cue: the third arrival.
const cued = await page.evaluate(() => {
  const { guests } = window.__cafe;
  guests.clear();
  guests.hurryChance = 0;
  guests.hurryIn(3);
  return [guests.spawn(), guests.spawn(), guests.spawn(), guests.spawn()].map((g) => g.hurried);
});
check('the first hurried guest comes on cue: the third arrival, then by chance', cued.join() === 'false,false,true,false', cued.join());

// 9. A hurried guest pays 1.5 times but makes the café no happier than another.
const happy = await page.evaluate(() => {
  const { score, system } = window.__cafe;
  const at = new system.cafe.position.constructor(0, 0.1, 0);
  score.happiness = 50;
  score.score({ kind: 'paid', guest: 0, share: 0, at, wishes: { met: 1, of: 1 }, hurried: true });
  const hurried = score.happiness - 50;
  score.happiness = 50;
  score.score({ kind: 'paid', guest: 0, share: 0, at, wishes: { met: 1, of: 1 }, hurried: false });
  return { hurried, normal: score.happiness - 50 };
});
check('a hurried guest pays more but lifts the café\'s happiness the same', happy.hurried === happy.normal && happy.normal > 0, JSON.stringify(happy));

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
