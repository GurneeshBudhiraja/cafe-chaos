/**
 * The Canadian café's guest conditions (docs/CANADA-CHALLENGES.md). In the
 * desktop preview, with the Canadian café swapped in, checks that:
 * 1. every card drawn can be met by one open seat, at every level, with
 *    only the starting tables and with all open, with and without the
 *    musicians, in a snowstorm, and for a cold guest (its `warm` always);
 * 2. each difficulty comes at its level (easy 1, medium 2, hard 3);
 * 3. `inside`, `board` and `lake` are met at their tables, `patio` is gone;
 * 4. the bonfire's three chairs are one table (company, alone, quiet);
 * 5. a cold guest at a bonfire chair is warm, at a deck table it is not,
 *    and it waits less there; a storm drains the deck faster;
 * 6. the fiddler's music reaches the deck tables (6, 7), the pianist's the
 *    roof's, and neither is quiet there.
 *
 * Usage: dev server running, then `node scripts/check-canada-wishes.mjs`.
 */

import { chromium } from 'playwright';
import { APP_URL } from './lib/headset.mjs';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 }, ignoreHTTPSErrors: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(APP_URL);
await page.waitForFunction(() => window.__cafe?.system.nav && window.__cafe.guests.seats.length > 0, null, { timeout: 90000 });
await page.waitForFunction(() => window.__cafe.system.setCafe('canada'), null, { timeout: 240000, polling: 1000 });
await page.waitForFunction(() => window.__cafe.guests.seats.some((s) => s.takeaway), null, { timeout: 30000 });

const r = await page.evaluate(async () => {
  const { guests } = window.__cafe;
  const W = await import('/src/guests/wishes.ts');
  const { CANADA_PLACES } = await import('/src/cafe/canada-layout.ts');
  const V = guests.seats[0].position.constructor;
  const g = guests;
  g.arrivals = false;
  g.seatedNow();
  g.cold = { line: 0.75, outside: 0.75 };
  g.stormOutside = 1.3;
  const seats = g.seats.filter((s) => !s.takeaway);
  const band = (n) => CANADA_PLACES.musicians.slice(0, n).map((m) => new V(m.x, m.y, m.z));
  const looks = ['snowbit', 'beavertail', 'nanaimo', 'doubledouble', 'buttertart'].map((species) => ({ species, tint: 0xffffff, tintName: 'plain', outfit: [] }));
  const problems = [];
  const seen = {};
  const allLocked = (open) => new Set([...new Set(seats.map((s) => s.table))].filter((t) => !open.includes(t)));
  const scenarios = [];
  for (const open of [[1, 2], [1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]])
    for (const musicians of [0, 1, 2]) for (const storm of [false, true]) for (const cold of [false, true]) scenarios.push({ open, musicians, storm, cold });
  for (const sc of scenarios) {
    g.setBand(band(sc.musicians));
    g.setLockedTables(allLocked(sc.open));
    g.storm = sc.storm;
    for (let level = 1; level <= 8; level++) {
      g.level = level;
      for (let i = 0; i < 60; i++) {
        const look = looks[i % looks.length];
        const wishes = g.canadaWishes(look, sc.cold);
        for (const w of wishes) {
          seen[w] ??= 99;
          seen[w] = Math.min(seen[w], level);
        }
        if (sc.cold && !wishes.includes('warm')) problems.push(`cold without warm ${JSON.stringify(sc)} ${wishes}`);
        if (sc.storm && wishes.some((w) => ['outside', 'lake', 'upstairs'].includes(w))) problems.push(`storm outdoor ${wishes}`);
        if (wishes.includes('patio')) problems.push('patio');
        if (new Set(wishes).size !== wishes.length) problems.push(`duplicate ${wishes}`);
        if (!W.compatible(wishes)) problems.push(`clash ${wishes}`);
        // Met all at once by one open seat (the social wishes on an empty café: an empty table meets quiet and alone; company needs another guest).
        const places = wishes.filter(W.isPlaceWish);
        const open = g.seats.filter((s) => !s.locked && !s.takeaway);
        if (places.length && !open.some((s) => places.every((w) => W.grants(w, s, -1, [], g.tables, g.quietCorner, null, g.band, sc.cold)))) problems.push(`unmeetable ${wishes} ${JSON.stringify(sc)} L${level}`);
      }
    }
  }
  g.storm = false;
  g.setBand([]);
  g.setLockedTables(new Set());
  const at = (t) => seats.find((s) => s.table === t);
  const grant = (w, t, opts = {}) => W.grants(w, at(t), -1, opts.sitters ?? [], g.tables, g.quietCorner, null, opts.band ?? [], opts.cold ?? false);
  const tables = [...new Set(seats.map((s) => s.table))].sort((a, b) => a - b);
  const meets = (w) => tables.filter((t) => grant(w, t));
  const fire = seats.filter((s) => CANADA_PLACES.bonfireTables.includes(s.table));
  const sitterAt = (t) => [{ id: 7, seat: at(t), sings: false }];
  // Cold drain.
  const fake = (t, cold) => ({ seat: at(t), cold });
  g.storm = false;
  const drains = { coldDeck: g.coldDrain(fake(6, true)), coldFire: g.coldDrain(fake(8, true)), coldCabin: g.coldDrain(fake(1, true)), warmDeck: g.coldDrain(fake(6, false)) };
  g.storm = true;
  drains.stormDeck = g.coldDrain(fake(7, false));
  drains.stormFire = g.coldDrain(fake(9, false));
  g.storm = false;
  const fiddler = band(1);
  const both = band(2);
  return {
    problems: problems.slice(0, 10),
    nproblems: problems.length,
    seen,
    meets: { inside: meets('inside'), board: meets('board'), lake: meets('lake'), warm: meets('warm'), outside: meets('outside') },
    coldWarm: { fire: grant('warm', 8, { cold: true }) && grant('warm', 10, { cold: true }), deck: grant('warm', 6, { cold: true }), notColdFire: grant('warm', 9) },
    fireOneTable: new Set(fire.map((s) => g.tables.get(s.index))).size === 1,
    fireCompany: grant('company', 9, { sitters: sitterAt(10) }) && !grant('alone', 9, { sitters: sitterAt(10) }) && !grant('quiet', 9, { sitters: sitterAt(8) }),
    fiddler: tables.filter((t) => seats.filter((s) => s.table === t).every((s) => W.grants('music', s, -1, [], g.tables, -1, null, fiddler))),
    fiddlerAny: tables.filter((t) => seats.some((s) => s.table === t && W.grants('music', s, -1, [], g.tables, -1, null, fiddler))),
    pianist: tables.filter((t) => seats.filter((s) => s.table === t).every((s) => W.grants('music', s, -1, [], g.tables, -1, null, [new V(9, 9, 9), both[1]]))),
    quietUnderMusic: [6, 7, 11, 12, 13, 14].filter((t) => grant('quiet', t, { band: both })),
    drains,
  };
});

check('every card can be met by one open seat', r.nproblems === 0, r.nproblems ? r.problems.join(' | ') : 'all scenarios, levels 1-8');
check('difficulty by level', r.seen.lake >= 2 && r.seen.bonfire >= 2 && r.seen.board >= 2 && r.seen.upstairs >= 2 && r.seen.quiet >= 3 && r.seen.music >= 3 && r.seen.inside === 1 && r.seen.warm === 1, JSON.stringify(r.seen));
check('inside, board, lake at their tables', r.meets.inside.join() === '1,2,3,4,5' && r.meets.board.join() === '3' && r.meets.lake.join() === '6,7', JSON.stringify(r.meets));
check('bonfire chairs are one table', r.fireOneTable && r.fireCompany, `one ${r.fireOneTable}, company/alone/quiet ${r.fireCompany}`);
check('a cold guest is warm at the bonfire, not on the deck', r.coldWarm.fire && !r.coldWarm.deck && !r.coldWarm.notColdFire, JSON.stringify(r.coldWarm));
check('cold and storm drain outside, not at the fire', Math.abs(r.drains.coldDeck - 1 / 0.75) < 1e-6 && r.drains.coldFire === 1 && r.drains.coldCabin === 1 && r.drains.warmDeck === 1 && Math.abs(r.drains.stormDeck - 1.3) < 1e-6 && r.drains.stormFire === 1, JSON.stringify(r.drains));
check('the fiddler reaches the deck tables', r.fiddler.includes(6) && r.fiddler.includes(7) && r.fiddler.every((t) => t >= 4), `every seat at ${r.fiddler.join(',')}; some seat at ${r.fiddlerAny.join(',')}`);
check('the pianist reaches all four roof tables', [11, 12, 13, 14].every((t) => r.pianist.includes(t)) && r.pianist.every((t) => t >= 11), r.pianist.join(','));
check('no table in earshot is quiet', r.quietUnderMusic.length === 0, r.quietUnderMusic.join(',') || 'none');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
