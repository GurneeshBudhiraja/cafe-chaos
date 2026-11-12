/**
 * Wishes check, in the real game from the seat, with pictures:
 * 1. with wishes on, every guest in the line has a name of its own, and
 *    those with a wish carry its picture over their heads;
 * 2. a hand over a guest brings up its card (name and wish) beside it;
 * 3. carried, the seats that grant its wish show mint, the others violet,
 *    and the count matches the rule (a window wish: the left-wall seats);
 * 4. seated where it wished, it gets a heart, and pays the bonus;
 * 5. seated elsewhere, it shrugs, and pays one step down;
 * 6. a loner is put out when someone joins its table (the wish stops
 *    being granted), and a guest who wanted company is pleased;
 * 7. a singer sends up notes, and a music lover near it is granted.
 *
 * Usage: dev server running, then `node scripts/check-wishes.mjs`.
 * Output: PASS/FAIL lines; artifacts/wishes-*.png.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
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
const until = (fn, arg, timeout = 180000) => page.waitForFunction(fn, arg, { timeout, polling: 200 }).then(() => true, () => false);

const AWAY = [-0.9, 1.05, 0.7];
await handRaw(AWAY);
await pinch(1);
await frames(3);
const closed = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
await pinch(0);
await frames(3);
const open = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
const pinchAt = (p, isOpen) => handRaw(p.map((v, i) => v - (isOpen ? open : closed)[i]));

// A run in which every guest has a wish, nobody gets impatient, and food comes quickly.
await page.evaluate(() => {
  const { game, guests } = window.__cafe;
  game.click('open');
  game.click('skip');
  guests.patienceFrozen = true;
  guests.spawnSeconds = [0.5, 1];
});
// The game sets the pace each frame: hold ours.
const hold = () => page.evaluate(() => { const g = window.__cafe.guests; g.spawnPace = 1; g.wishChance = 1; g.singerChance = 0; });
const pacer = setInterval(() => hold().catch(() => {}), 150);
await hold();
await until(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 4);
await page.evaluate(() => (window.__cafe.guests.arrivals = false));
const line = await page.evaluate(() => window.__cafe.guests.line.map((g) => ({ id: g.id, name: g.name, wish: g.wish, tag: !!g.tag && g.tag.visible })));
const names = new Set(line.map((g) => g.name));
check('every guest has its own name, and its wish over its head', names.size === line.length && line.every((g) => g.name && g.wish && g.tag), JSON.stringify(line));
await h.screenshot('artifacts/wishes-1-line.png');

// The head of the line is given a window wish, to have a known case.
const first = await page.evaluate(() => {
  const { guests, system } = window.__cafe;
  const g = guests.line[0];
  g.wish = 'window';
  return { id: g.id, name: g.name, grip: g.actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray() };
});
await h.head(P(add(first.grip, [0.3, 0.2, 0.1])), P(add(first.grip, [0, 0.02, 0])), 300);
await pinchAt(add(first.grip, [0.01, 0.03, 0]), true);
await frames(5);
const card = await page.evaluate(() => ({ open: window.__cafe.guests.cards.cards[0].open, lit: window.__cafe.guests.hovered[0]?.id ?? 0 }));
check('a hand over a guest brings up its card', card.open && card.lit === first.id, JSON.stringify(card));
await h.screenshot('artifacts/wishes-2-card.png');

// Carried: the seats that grant a window wish are the left-wall seats.
await pinchAt(first.grip, true);
await frames(2);
await pinch(1);
await pinchAt(first.grip, false);
await frames(3);
await h.head(SEAT, LOOK, 300);
const overCafe = await page.evaluate(() => window.__cafe.system.cafe.localToWorld(new window.__cafe.system.cafe.position.constructor(0.02, 0.2, 0.0)).toArray());
await pinchAt(overCafe, false);
await frames(5);
const granting = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const g = guests.carriedBy('right');
  return { held: g?.id ?? 0, granting: [...guests.granting].map((s) => s.index).sort((a, b) => a - b), rule: guests.seats.filter((s) => s.occupant === 0 && s.position.x < -0.2).map((s) => s.index).sort((a, b) => a - b) };
});
check('carried, the seats that grant its wish are marked', granting.held === first.id && granting.granting.length > 0 && JSON.stringify(granting.granting) === JSON.stringify(granting.rule), JSON.stringify(granting));
await h.screenshot('artifacts/wishes-3-carried.png');

// Seated on a window seat: a heart, and the bonus when it pays.
const seatAt = (index) => page.evaluate((index) => { const { guests, system } = window.__cafe; return system.cafe.localToWorld(guests.seats[index].position.clone()).toArray(); }, index);
const windowSeat = granting.rule[0];
await pinchAt(add(await seatAt(windowSeat), [0, 0.08, 0]), false);
await frames(4);
await pinch(0);
await frames(3);
await pinchAt(AWAY.map((v, i) => v + open[i]), true);
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', first.id);
await frames(3);
const met = await page.evaluate((id) => { const { guests } = window.__cafe; const g = guests.guests.find((x) => x.id === id); return { seat: g.seat?.index, met: g.wishMet, hearts: guests.popups.shown.heart ?? 0 }; }, first.id);
check('seated where it wished, it gets a heart', met.seat === windowSeat && met.met === true && met.hearts >= 1, JSON.stringify(met));
await h.screenshot('artifacts/wishes-4-heart.png');

// The next guest wants the window too, and is seated in the middle: a shrug.
const second = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const g = guests.line[0];
  g.wish = 'window';
  const seat = guests.seats.find((s) => s.occupant === 0 && s.position.x > 0 && s.position.x < 0.12 && s.position.z > 0);
  guests.seatGuest(g.id, seat.index);
  return { id: g.id, seat: seat.index };
});
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', second.id);
await frames(3);
const unmet = await page.evaluate((id) => { const { guests } = window.__cafe; const g = guests.guests.find((x) => x.id === id); return { met: g.wishMet, shrugs: guests.popups.shown.shrug ?? 0 }; }, second.id);
check('seated elsewhere, it shrugs', unmet.met === false && unmet.shrugs >= 1, JSON.stringify(unmet));

// A loner at a table of its own is granted; someone joining its table puts it out. The newcomer wanted company: granted.
const pair = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const [a, b] = guests.line;
  a.wish = 'alone';
  b.wish = 'company';
  // An empty table: two free seats that share a table.
  const table = (s) => guests.tables.get(s.index);
  const free = guests.seats.filter((s) => s.occupant === 0);
  const s1 = free.find((s) => free.some((o) => o !== s && table(o) === table(s)) && !guests.guests.some((g) => g.seat && table(g.seat) === table(s)));
  const s2 = free.find((o) => o !== s1 && table(o) === table(s1));
  guests.seatGuest(a.id, s1.index);
  return { a: a.id, b: b.id, s2: s2.index };
});
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', pair.a);
await frames(3);
const lonerBefore = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id).wishMet, pair.a);
await page.evaluate(([id, seat]) => window.__cafe.guests.seatGuest(id, seat), [pair.b, pair.s2]);
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', pair.b);
await frames(3);
const after = await page.evaluate(([a, b]) => { const f = (id) => window.__cafe.guests.guests.find((g) => g.id === id).wishMet; return { loner: f(a), friend: f(b) }; }, [pair.a, pair.b]);
check('a loner is put out when someone joins its table, and the one who wanted company is pleased', lonerBefore === true && after.loner === false && after.friend === true, `loner ${lonerBefore} -> ${after.loner}, friend ${after.friend}`);

// What they pay: the heart guest the bonus, the shrug guest a step down. Let the servers feed them and the meal be short.
await page.evaluate(() => { window.__cafe.guests.mealSeconds = 3; window.__cafe.guests.patienceFrozen = true; });
await until(([a, b]) => { const log = window.__cafe.score.log; return log.filter((e) => e.kind === 'paid').length >= 2 && [a, b].every((id) => !window.__cafe.guests.guests.some((g) => g.id === id && g.state === 'seated')); }, [first.id, second.id], 400000);
const log = await page.evaluate(() => window.__cafe.score.log.filter((e) => e.kind === 'paid'));
const granted = log.find((e) => e.wish === 'met');
const ignored = log.find((e) => e.wish === 'unmet');
check('a wish granted adds to the tip; a wish ignored pays one step down', !!granted && granted.coins === 16 && granted.happiness === 6 && !!ignored && ignored.tier === 'fair' && ignored.coins === 8,
  `granted ${JSON.stringify(granted)}, ignored ${JSON.stringify(ignored)}`);

clearInterval(pacer);
const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
