/**
 * The guests' wishes (the owner's rules of 18 Nov 2026), in both cafés,
 * played through the first 20 guests of a fresh game with every table open
 * (guests are seated where their wishes are met, the oldest leave as the
 * café fills, levels rise with the count as in play, the first hurried
 * guest and the first singer come on cue as the game cues them):
 *  1. the first 3 guests have one wish each;
 *  2. no guest has two wishes that contradict;
 *  3. every wish offered can be met before the guest's patience runs out
 *     (a seat free now, or one about to free up);
 *  4. a guest bringing a type for the first time has that one wish;
 *  5. every wish type has come by about guest 16 (all but "with my
 *     friend", which comes with the pairs from level 4);
 *  6. holding a guest whose wish names another: the named guest glows and
 *     shows its name; pointing at a seated guest shows its name;
 *  7. a seated guest near the end of its meal shows the "leaving soon"
 *     mark;
 *  8. no console errors.
 * Usage: dev server running, then `node scripts/check-wish-rules.mjs`.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
/** By about this guest every type has come (the owner's "about guest 16"). */
const ALL_BY = 18;
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => { localStorage.clear(); window.__cafe.system.replace(); });
    await h.page.waitForFunction(() => window.__cafe?.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
// The hands away from the café (a resting hand by a guest would point at it).
for (const k of ['left', 'right']) await page.evaluate((k) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }), k);
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 60000) => page.waitForFunction(fn, null, { timeout, polling: 100 }).then(() => true, () => false);

/** Play a café's first 20 guests and report what each was given. */
async function play(cafe) {
  await page.evaluate((c) => { const { game } = window.__cafe; game.save.tips = ['goal']; game.click(`play-${c}`); }, cafe);
  await until(() => ['run', 'tutorial'].includes(window.__cafe.game.phase));
  await page.evaluate(() => window.__cafe.game.click('skip'));
  await until(() => window.__cafe.game.phase === 'run');
  // The café asked for is the one up (the Canadian café's models may still have been loading).
  const up = await page.evaluate(async () => (await import('/src/cafe/style.ts')).current.id);
  if (up !== cafe) throw new Error(`the ${cafe} café did not open (the ${up} café is up)`);
  await until(() => window.__cafe.guests.seats.length > 0 && window.__cafe.baristas.staff.length > 0, 20000);
  // Every guest model of this café loaded (they load in the background; arrivals wait for them, the check's spawns do not).
  await until(async () => {
    const { castLoaded } = await import('/src/guests/actor.ts');
    const { CANADA_SPECIES, SPECIES } = await import('/src/guests/cast.ts');
    const { isCanada } = await import('/src/cafe/style.ts');
    return (isCanada() ? CANADA_SPECIES : SPECIES).every((species) => castLoaded({ species, tint: 0xffffff, tintName: 'plain', outfit: [] }));
  }, 120000);
  // Every table open, nobody arriving on their own, a level's pace set by the count below.
  return page.evaluate(async (cafe) => {
    const { game, guests, shop, system } = window.__cafe;
    guests.arrivals = false;
    guests.clear();
    // A guest may have walked up on its own before arrivals stopped: the game's count and its types start here.
    guests.gameGuests = 0;
    guests.runGuests = 0;
    guests.seenWishes.clear();
    shop.tables = [...system.tables];
    game.applyLocks();
    if (cafe === 'canada') shop.restore(2, shop.tables, true, true, 2);
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    for (let i = 0; i < 20; i++) await frame();
    const levelFor = (n) => (n <= 5 ? 1 : n <= 12 ? 2 : n <= 22 ? 3 : 4);
    const out = [];
    for (let n = 1; n <= 20; n++) {
      const level = levelFor(n);
      guests.level = level;
      guests.hurryChance = level >= 2 ? 0.15 : 0;
      if (n === 8) guests.hurryIn(1);
      if (cafe === 'japan' && n === 13) guests.forceSinger = true;
      guests.singerChance = cafe === 'japan' && level >= 3 ? 0.14 : 0;
      guests.pairChance = 0;
      // Room in the café: the guests seated longest leave (as they would, their meals done).
      const seated = guests.guests.filter((g) => g.state === 'seated');
      if (seated.length >= 9) for (const g of seated.slice(0, 3)) guests.standUp(g);
      for (let i = 0; i < 3; i++) await frame();
      const g = guests.spawn();
      const meetable = guests.meetableSoon(g.wishes, { id: g.id, species: g.actor.look.species, cold: g.cold, link: g.link }, g.patience);
      out.push({ n, level, wishes: [...g.wishes], link: g.link, first: g.firstWish, meetable, sings: g.sings, hurried: g.hurried });
      // Seat it where every wish is met (else anywhere free that meets one), as a player would.
      for (let i = 0; i < 2; i++) await frame();
      const free = guests.seats.filter((s) => s.occupant === 0 && !s.locked && !s.dirty && !s.hidden);
      const seat = free.find((s) => guests.wouldGrant(g, s)) ?? free.find((s) => !guests.meetsNone(g, s)) ?? free[0];
      if (seat) guests.seatGuest(g.id, seat.index);
      for (let i = 0; i < 4; i++) await frame();
      // Its food comes (a server would bring it): the seated finish their meals in turn.
      g.served = true;
    }
    return { out, seen: [...guests.seenWishes], order: cafe === 'canada' ? ['inside', 'warm', 'alone', 'outside', 'patio', 'company', 'bonfire', 'lake', 'upstairs', 'kind', 'hat', 'friend', 'quiet', 'meet', 'avoid', 'calm', 'music'] : ['window', 'door', 'counter', 'alone', 'company', 'big', 'music', 'quiet', 'friend', 'kind', 'meet', 'hat', 'avoid', 'calm'] };
  }, cafe);
}

const CLASH = [['alone', 'company'], ['quiet', 'music'], ['quiet', 'company'], ['friend', 'alone'], ['friend', 'company'], ['friend', 'quiet'], ['meet', 'alone'], ['meet', 'avoid']];
const PLACES = ['window', 'door', 'counter', 'big', 'inside', 'warm', 'outside', 'patio', 'bonfire', 'lake', 'upstairs'];
for (const cafe of ['japan', 'canada']) {
  const r = await play(cafe);
  const label = cafe === 'japan' ? 'Japanese café' : 'Canadian café';
  console.log(`${label}: ${r.out.map((x) => `${x.n}:${x.wishes.join('+') || '-'}${x.first ? `(new ${x.first})` : ''}`).join('  ')}`);
  check(`${label}: the first 3 guests have one wish each`, r.out.slice(0, 3).every((x) => x.wishes.length === 1), JSON.stringify(r.out.slice(0, 3).map((x) => x.wishes)));
  const clashes = r.out.filter((x) => CLASH.some(([a, b]) => x.wishes.includes(a) && x.wishes.includes(b)) || x.wishes.filter((w) => PLACES.includes(w)).length > 1);
  check(`${label}: no guest has two wishes that contradict`, clashes.length === 0, clashes.length ? JSON.stringify(clashes) : `${r.out.length} guests`);
  const unmeetable = r.out.filter((x) => !x.meetable);
  check(`${label}: every wish offered can be met before the guest's patience runs out`, unmeetable.length === 0, unmeetable.length ? JSON.stringify(unmeetable) : 'all');
  const firsts = r.out.filter((x) => x.first);
  check(`${label}: a guest bringing a type for the first time has that one wish`, firsts.every((x) => x.wishes.length === 1 && x.wishes[0] === x.first), JSON.stringify(firsts.map((x) => [x.n, x.wishes])));
  const byWhen = {};
  for (const x of r.out) for (const w of x.wishes) byWhen[w] ??= x.n;
  const missing = r.order.filter((w) => w !== 'friend' && (byWhen[w] === undefined || byWhen[w] > ALL_BY));
  const last = Math.max(...r.order.filter((w) => w !== 'friend').map((w) => byWhen[w] ?? 99));
  check(`${label}: every wish type has come by about guest 16 (all but the pairs' friend wish, from level 4)`, missing.length === 0, missing.length ? `missing by guest ${ALL_BY}: ${missing.join(', ')}` : `the last came with guest ${last}`);
  if (cafe === 'japan') {
    // 6. The named guest's glow and name; a pointed-at guest's name. 7. The leaving mark.
    const named = await page.evaluate(async () => {
      const { guests } = window.__cafe;
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const target = guests.guests.find((g) => g.state === 'seated');
      const g = guests.spawn();
      g.wishes = ['meet'];
      g.link = target.id;
      g.state = 'held';
      for (let i = 0; i < 12; i++) await frame();
      const res = { glow: +target.highlight.toFixed(2), name: !!target.nameTag?.visible, tagName: target.name };
      g.state = 'queued';
      for (let i = 0; i < 20; i++) await frame();
      res.after = !!target.nameTag?.visible;
      return res;
    });
    check('holding a guest whose wish names another: the named guest glows and shows its name (and not after)', named.glow > 0.5 && named.name && !named.after, JSON.stringify(named));
    const pointed = await page.evaluate(async () => {
      const { guests, hold, system } = window.__cafe;
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const g = guests.spawn();
      const seat = guests.seats.find((s) => s.occupant === 0 && !s.locked && !s.dirty && !s.hidden);
      guests.seatGuest(g.id, seat.index);
      for (let i = 0; i < 6; i++) await frame();
      const V = system.cafe.position.constructor;
      const at = system.cafe.localToWorld(new V(g.actor.root.position.x, g.actor.root.position.y + g.actor.bubbleAnchor.position.y * 0.6, g.actor.root.position.z));
      const tip = hold.tip.right;
      const was = { tracked: tip.tracked, point: tip.point.clone() };
      // The fingertip there as the guests read it (the hold system reads the real hand each frame: set, then read).
      tip.tracked = true;
      tip.point.copy(at);
      guests.tendNames(0);
      tip.tracked = was.tracked;
      tip.point.copy(was.point);
      await frame();
      const shown = !!g.nameTag?.visible;
      return { shown, name: g.name };
    });
    check('pointing at a seated guest shows its name', pointed.shown, JSON.stringify(pointed));
    const leaving = await page.evaluate(async () => {
      const { guests } = window.__cafe;
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      // A guest seated now, its meal nearly done.
      const g = guests.spawn();
      const seat = guests.seats.find((s) => s.occupant === 0 && !s.locked && !s.dirty && !s.hidden);
      guests.seatGuest(g.id, seat.index);
      for (let i = 0; i < 300 && g.state !== 'seated'; i++) await frame();
      // Its food came, and its stay ends in a few seconds (not yet: it would get down at once).
      g.served = true;
      g.eaten = guests.mealSeconds - 6;
      g.seatedFor = guests.seatedSeconds - 4;
      for (let i = 0; i < 4; i++) await frame();
      const near = !!g.leavingMark?.visible;
      const other = guests.spawn();
      const seat2 = guests.seats.find((s) => s.occupant === 0 && !s.locked && !s.dirty && !s.hidden);
      guests.seatGuest(other.id, seat2.index);
      for (let i = 0; i < 300 && other.state !== 'seated'; i++) await frame();
      for (let i = 0; i < 4; i++) await frame();
      const fresh = other;
      return { near, leavesIn: +guests.leavesIn(g).toFixed(1), fresh: fresh ? !!fresh.leavingMark?.visible : null };
    });
    check('a seated guest near the end of its meal shows the "leaving soon" mark (one waiting for food does not)', leaving.near && leaving.fresh !== true, JSON.stringify(leaving));
    // Back to the start card for the other café.
    await page.evaluate(() => { const { game } = window.__cafe; game.click('pause'); game.click('end'); });
    await until(() => window.__cafe.game.phase === 'title');
    await until(() => window.__cafe.system.cafeLoaded('canada'), 300000);
  }
}

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
