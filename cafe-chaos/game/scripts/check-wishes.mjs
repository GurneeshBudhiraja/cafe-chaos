/**
 * Wishes check, in the real game from the seat, with pictures:
 * 1. every guest in the line has a name of its own and 1 to 3 wishes that
 *    can all be met together, and a dot over its head (its seconds, its
 *    timer ring, a pip for each wish);
 * 2. the first 3 guests of a run have 1 wish; at level 1 about 1 in 3 have
 *    two; at a high level, a mix of 1, 2 and 3;
 * 3. a hand over a guest brings up its request card beside the hand;
 * 4. carried over a seat, the card marks each wish that seat meets, and
 *    the seats that meet every wish are lit;
 * 5. let go there, its wishes are judged as the card said, once, and the
 *    result pops up over its head; its dot now counts its food wait down;
 * 6. a seated guest stays where it was put: a pinch on it picks nothing up;
 * 7. judged once: someone sitting at a loner's table later does not
 *    change the loner's result;
 * 8. it pays by its wishes: each one met adds to the tip, all met (of two
 *    or more) a bonus more; none met pays one step down;
 * 9. nothing on the console.
 * Usage: dev server running, then `node scripts/check-wishes.mjs`.
 * Output: PASS/FAIL lines; artifacts/wishes-*.png.
 */

process.env.APP_URL = `${process.env.APP_URL_GAME ?? 'https://localhost:8082/'}?hands=cream`;
const { startHeadset } = await import('./lib/headset.mjs');

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const Q = { x: 0, y: 0, z: 0, w: 1 };
const handRaw = (p) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const pinch = (value) => send('set_select_value', { device: 'hand-right', value });
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const add = (a, b) => a.map((v, i) => v + b[i]);
const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, arg, timeout = 180000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);

const AWAY = [-0.9, 1.05, 0.7];
await handRaw(AWAY);
await pinch(1);
await frames(3);
const closed = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
await pinch(0);
await frames(3);
const open = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
const pinchAt = (p, isOpen) => handRaw(p.map((v, i) => v - (isOpen ? open : closed)[i]));

// Into a run; nobody gets impatient; guests come quickly.
await page.evaluate(() => window.__cafe.game.click('open'));
await until(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving, null, 60000);
await page.evaluate(() => window.__cafe.game.click('skip'));
await until(() => window.__cafe.game.phase === 'run', null, 60000);
const hold = () => page.evaluate(() => { const g = window.__cafe.guests; g.spawnPace = 1; g.spawnSeconds = [0.4, 0.8]; g.singerChance = 0; g.patienceFrozen = true; });
const pacer = setInterval(() => hold().catch(() => {}), 150);
await hold();

// 2. How many wishes, at level 1 and at a high level (new guests made directly, then cleared away).
const counts = await page.evaluate(() => {
  const g = window.__cafe.guests;
  // Every wish type seen (the order they come in is check-wish-rules): how many a guest has, by level and by how far
  // into the run it comes.
  g.seenWishes = new Set(['window', 'door', 'counter', 'alone', 'company', 'big', 'quiet', 'kind', 'meet', 'hat', 'avoid', 'calm']);
  const sample = (level) => {
    g.level = level;
    g.gameGuests = 100;
    g.runGuests = 0;
    const out = [];
    for (let i = 0; i < 30; i++) {
      const guest = g.spawn();
      out.push(guest.wishes.length);
    }
    g.clear();
    return out;
  };
  return { early: sample(1), late: sample(10) };
});
const lateSet = new Set(counts.late);
check('the first 3 guests of a run have 1 wish; at level 1 one or two (about 1 in 3 two); late ones a mix of 1, 2 and 3', counts.early.slice(0, 3).every((n) => n === 1) && counts.early.every((n) => n === 1 || n === 2) && counts.early.includes(2) && counts.late.slice(3).every((n) => n >= 1 && n <= 3) && lateSet.has(2) && lateSet.has(3), `early ${counts.early.join('')}, late ${counts.late.join('')}`);

// 1. The line, at a high level (a mix of wishes).
// Every table open (the wishes need window and door seats), a high level, room in the line.
await page.evaluate(() => { const { game, shop, system } = window.__cafe; shop.restore(shop.hires, system.tables); game.applyLocks(); game.level = 10; window.__cafe.guests.level = 10; window.__cafe.guests.queueCap = 5; window.__cafe.guests.clear(); });
await until(() => window.__cafe.guests.line.length >= 4 && window.__cafe.guests.line.slice(0, 4).every((g) => g.state === 'queued' && !g.walk));
await page.evaluate(() => (window.__cafe.guests.arrivals = false));
await frames(4);
const CLASH = [['window', 'door'], ['window', 'counter'], ['door', 'counter'], ['alone', 'company'], ['quiet', 'music'], ['quiet', 'company'], ['friend', 'alone'], ['friend', 'company']];
// The guests standing in the line (a pair comes as two at once, so one more may still be walking up).
const line = await page.evaluate(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).map((g) => ({ id: g.id, name: g.name, wishes: g.wishes, dot: g.dial.sprite.visible })));
const names = new Set(line.map((g) => g.name));
const fine = line.every((g) => g.wishes.length >= 1 && g.wishes.length <= 3 && new Set(g.wishes).size === g.wishes.length && CLASH.every(([a, b]) => !(g.wishes.includes(a) && g.wishes.includes(b))));
check('every guest in line has its own name, 1-3 wishes that can all be met, and a dot', names.size === line.length && fine && line.every((g) => g.dot), JSON.stringify(line));
await h.screenshot('artifacts/wishes-1-line.png');

// 3. The head of the line gets three known wishes; a hand over it brings up its card.
const first = await page.evaluate(() => {
  const { guests, system } = window.__cafe;
  const g = guests.line[0];
  g.wishes = ['window', 'quiet', 'alone'];
  return { id: g.id, grip: g.actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray() };
});
await h.head(P(add(first.grip, [0.3, 0.22, 0.12])), P(add(first.grip, [-0.05, 0.03, 0])), 300);
await pinchAt(add(first.grip, [0.012, 0.03, 0]), true);
await frames(6);
const card = await page.evaluate(() => ({ open: window.__cafe.guests.cards.cards[0].open, lit: window.__cafe.guests.hovered[0]?.id ?? 0 }));
check('a hand over a guest brings up its request card', card.open && card.lit === first.id, JSON.stringify(card));
await h.screenshot('artifacts/wishes-2-card.png');

// 4. Carried over a seat in the middle of the café: the card marks each wish; the lit seats meet them all.
await pinchAt(first.grip, true);
await frames(2);
await pinch(1);
await pinchAt(first.grip, false);
await frames(3);
const middle = await page.evaluate(() => {
  const { guests, system } = window.__cafe;
  const free = guests.seats.filter((s) => s.occupant === 0);
  const s = free.reduce((b, s) => (Math.hypot(s.position.x - 0.05, s.position.z - 0.04) < Math.hypot(b.position.x - 0.05, b.position.z - 0.04) ? s : b));
  return { index: s.index, at: system.cafe.localToWorld(s.position.clone()).toArray() };
});
await pinchAt(add(middle.at, [0, 0.085, 0]), false);
await h.head(P(add(middle.at, [0.33, 0.26, 0.08])), P(add(middle.at, [-0.04, 0.05, 0])), 300);
await frames(8);
// Seat hints off (the default) and the guest bringing no new wish type: no seat glows (the card is read instead).
await page.evaluate(() => { const { guests } = window.__cafe; guests.seatHints = false; const g = guests.carriedBy('right'); if (g) g.firstWish = null; });
await frames(3);
const litOff = await page.evaluate(() => [...window.__cafe.guests.granting].length);
// Seat hints on (Settings): the seats meeting every wish glow.
await page.evaluate(() => { window.__cafe.guests.seatHints = true; });
await frames(3);
const carried = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const g = guests.carriedBy('right');
  if (!g || !g.target) return null;
  const each = guests.grantsEach(g, g.target);
  const all = guests.seats.filter((s) => s.occupant === 0 && !s.locked && guests.wouldGrant(g, s)).map((s) => s.index).sort((a, b) => a - b);
  return { id: g.id, target: g.target.index, each, lit: [...guests.granting].map((s) => s.index).sort((a, b) => a - b), all, cardKey: guests.cards.shown[0] };
});
check('carried over a seat, the card marks each wish it meets; with Seat hints off no seat glows, on the seats that meet them all do',
  litOff === 0 && !!carried && carried.id === first.id && carried.cardKey.endsWith(carried.each.join()) && JSON.stringify(carried.lit) === JSON.stringify(carried.all),
  JSON.stringify(carried));
await h.screenshot('artifacts/wishes-3-carried.png');

// 5. Let go: judged as the card said, the result pops up; no dot once seated.
const before = await page.evaluate(() => window.__cafe.guests.popups.shown.result ?? 0);
await pinch(0);
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', first.id, 30000);
await h.screenshot('artifacts/wishes-4-result.png');
const seated = await page.evaluate((id) => { const { guests } = window.__cafe; const g = guests.guests.find((x) => x.id === id); return { seat: g.seat?.index, met: g.wishMet, results: guests.popups.shown.result ?? 0, dot: g.dial.sprite.visible }; }, first.id);
check('let go, its wishes are judged as the card said, the result pops up, and its dot counts the food wait down', seated.seat === carried?.target && JSON.stringify(seated.met) === JSON.stringify(carried?.each) && seated.results === before + 1 && seated.dot, JSON.stringify(seated));

// 6. A seated guest stays put: a pinch on it picks nothing up.
const picked = await page.evaluate(() => window.__cafe.guests.pickedUp);
const sitter = await page.evaluate((id) => { const { guests, system } = window.__cafe; return guests.guests.find((g) => g.id === id).actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray(); }, first.id);
await pinchAt(add(sitter, [0.01, 0.03, 0]), true);
await frames(3);
await pinchAt(sitter, true);
await frames(2);
await pinch(1);
await frames(4);
await pinch(0);
await frames(3);
await handRaw(AWAY);
const still = await page.evaluate(([id, p]) => ({ state: window.__cafe.guests.guests.find((g) => g.id === id).state, picked: window.__cafe.guests.pickedUp - p }), [first.id, picked]);
check('a seated guest cannot be picked up again', still.state === 'seated' && still.picked === 0, JSON.stringify(still));

// 7. Judged once: a loner at a table of its own keeps its result when someone sits with it.
const pair = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const [a, b] = guests.line;
  a.wishes = ['alone'];
  b.wishes = ['company'];
  const table = (s) => guests.tables.get(s.index);
  const free = guests.seats.filter((s) => s.occupant === 0);
  const s1 = free.find((s) => free.some((o) => o !== s && table(o) === table(s)) && !guests.guests.some((g) => g.seat && table(g.seat) === table(s)));
  const s2 = free.find((o) => o !== s1 && table(o) === table(s1));
  guests.seatGuest(a.id, s1.index);
  return { a: a.id, b: b.id, s2: s2.index };
});
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', pair.a, 30000);
await page.evaluate(([id, seat]) => window.__cafe.guests.seatGuest(id, seat), [pair.b, pair.s2]);
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', pair.b, 30000);
await frames(3);
const once = await page.evaluate(([a, b]) => { const f = (id) => window.__cafe.guests.guests.find((g) => g.id === id).wishMet; return { loner: f(a), friend: f(b) }; }, [pair.a, pair.b]);
check('judged once: the loner keeps its result when someone joins its table; the friend is pleased', JSON.stringify(once.loner) === '[true]' && JSON.stringify(once.friend) === '[true]', JSON.stringify(once));

// 8. What they pay, by their wishes (the meals short, served quickly).
await page.evaluate(() => (window.__cafe.guests.mealSeconds = 3));
await until(() => window.__cafe.score.log.filter((e) => e.kind === 'paid').length >= 3, null, 400000);
const log = await page.evaluate(() => window.__cafe.score.log.filter((e) => e.kind === 'paid'));
const pay = (share, met, of) => Math.round(1 + 9 * (0.4 * (1 - Math.min(1, Math.max(0, share))) + 0.6 * (of > 0 ? met / of : 1)));
const right = log.every((e) => e.coins === pay(e.share, e.wishes.met, e.wishes.of) && e.coins >= 1 && e.coins <= 10);
check('each guest pays once, 1 to 10 coins: by how quickly it was seated and the share of its wishes met', log.length >= 3 && right, JSON.stringify(log.map((e) => ({ share: +e.share.toFixed(2), wishes: e.wishes, coins: e.coins }))));

clearInterval(pacer);
const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
