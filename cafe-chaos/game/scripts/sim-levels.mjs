/**
 * The levels, played by scripted players, to check the pace and the money
 * against the plan's estimates (docs/MECHANICS-PLAN.md: about 6.5 coins a
 * guest, every table and the staff bought by about minute 50, nobody lost
 * for want of staff).
 *
 * It opens the game in the desktop preview (no headset needed), puts the
 * café down, and plays from level 1 with a player who seats the head of
 * the line every HAND seconds on the free seat that meets the most of its
 * wishes (the friend's table for one of a pair), and buys as a sensible
 * player would: a second barista from level 2, the janitor once tables
 * wait dirty, a third barista from level 6, and a table whenever the bank
 * can pay (as the tip asks). It reports, per level: the game minute
 * it began, how long it took, guests served and lost, coins per guest,
 * the bank, and what was bought.
 *
 * Usage: dev server running, then
 *   node scripts/sim-levels.mjs                  three players: quick (3 s), average (5 s), slow (8 s)
 *   HAND=5 node scripts/sim-levels.mjs           one player
 * SCALE (default 3): how much faster than real time the café runs.
 * LEVELS (default 10): stop after this level; CAP (default 3300) game seconds.
 */

import { chromium } from 'playwright';

const URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const SCALE = Number(process.env.SCALE ?? 3);
const LEVELS = Number(process.env.LEVELS ?? 10);
const CAP = Number(process.env.CAP ?? 3300);
const players = process.env.HAND ? [{ name: `hand ${process.env.HAND}s`, hand: Number(process.env.HAND) }] : [{ name: 'quick', hand: 3 }, { name: 'average', hand: 5 }, { name: 'slow', hand: 8 }];

const browser = await chromium.launch({ args: ['--ignore-certificate-errors', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const player of players) {
  const page = await browser.newPage({ viewport: { width: 320, height: 240 }, ignoreHTTPSErrors: true });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__cafe?.system.pieces.length > 10 && window.__cafe.guests.seats.length > 0 && window.__cafe.baristas.staff.length > 0, null, { timeout: 120000 });
  await page.evaluate((scale) => {
    const c = window.__cafe;
    localStorage.clear();
    c.score.bank = 0;
    c.game.save.tips = ['goal', 'table', 'shop', 'dirty', 'hurry', 'pair'];
    c.game.save.tutorialDone = true;
    c.system.placed = true;
    c.system.timeScale = scale;
  }, SCALE);
  await page.waitForFunction(() => window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  await page.evaluate(() => { const g = window.__cafe.game; g.click('open'); g.click('skip'); });
  await page.waitForFunction(() => window.__cafe.game.phase === 'run', null, { timeout: 60000 });
  const r = await page.evaluate(([hand, levels, cap, scale]) => new Promise((resolve) => {
    const c = window.__cafe;
    const g = c.game;
    let clock = 0;
    let last = performance.now();
    let lastSeat = -hand;
    const rows = [];
    let row = { level: g.level, from: 0, served: 0, lost: 0, coins: 0, bought: [] };
    let logAt = c.score.log.length;
    const bought = [];
    const buy = (what) => { const m = (clock / 60).toFixed(1); row.bought.push(`${what}@${m}`); bought.push({ what, minute: +m }); };
    const timer = setInterval(() => {
      const now = performance.now();
      if (g.phase === 'run') clock += ((now - last) / 1000) * scale * (c.system.timeScale > 0 ? 1 : 0);
      last = now;
      if (g.phase === 'closed') { g.click('again'); c.system.timeScale = scale; return; }
      if (g.phase !== 'run') return;
      if (c.system.timeScale !== scale && c.system.timeScale > 0.99) c.system.timeScale = scale;
      // Outcomes since the last look.
      for (const e of c.score.log.slice(logAt)) {
        if (e.kind === 'paid') { row.served++; row.coins += e.coins; } else row.lost++;
      }
      logAt = c.score.log.length;
      if (c.score.log.length < logAt) logAt = 0;
      // A new level: close the row.
      if (g.level !== row.level) {
        rows.push({ ...row, to: clock });
        row = { level: g.level, from: clock, served: 0, lost: 0, coins: 0, bought: [] };
        logAt = c.score.log.length;
      }
      if (g.level > levels || clock > cap) {
        clearInterval(timer);
        rows.push({ ...row, to: clock });
        resolve({ rows, bought, bank: c.score.bank, tables: c.shop.tables.length, staff: c.shop.staff, janitor: c.shop.janitor });
        return;
      }
      // Buying.
      const shop = c.shop;
      if (g.level >= 2 && shop.staff < 2 && shop.affordable && shop.hire()) buy('barista2');
      else if (g.level >= 6 && shop.staff < 3 && shop.staff >= 2 && shop.affordable && shop.hire()) buy('barista3');
      else if (!shop.janitor && c.mess.dirtyCount >= 2 && c.score.bank >= 120 && shop.hireJanitor()) buy('janitor');
      else if (shop.tableAffordable) {
        // The cheapest way to more seats: the locked table nearest the counter's middle.
        const locked = [...c.system.lockedTables].filter((t) => t < 13 || c.system.annexOpen);
        if (locked.length && shop.buyTable(locked[0])) { g.applyLocks(); buy(`table${shop.tablesOwned}`); }
      }
      // Seating, every `hand` seconds of game time.
      if (clock - lastSeat < hand) return;
      const guest = c.guests.line.find((x) => x.state === 'queued' && !x.walk);
      if (!guest) return;
      const free = c.guests.seats.filter((s) => s.occupant === 0 && !s.locked && !s.dirty);
      if (!free.length) return;
      let best = free[0];
      let bestScore = -1;
      for (const s of free) {
        const each = c.guests.grantsEach(guest, s);
        const score = each.filter(Boolean).length;
        if (score > bestScore) { bestScore = score; best = s; }
      }
      if (c.guests.seatGuest(guest.id, best.index)) lastSeat = clock;
    }, 40);
  }), [player.hand, LEVELS, CAP, SCALE]);
  const t = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  console.log(`\n== ${player.name} (a guest seated every ${player.hand} s at most)`);
  let coins = 0;
  let served = 0;
  for (const row of r.rows) {
    coins += row.coins;
    served += row.served;
    console.log(`level ${String(row.level).padStart(2)}: from ${t(row.from)} for ${t(row.to - row.from)}  served ${String(row.served).padStart(3)}  lost ${String(row.lost).padStart(2)}  coins/guest ${(row.coins / Math.max(1, row.served)).toFixed(1)}  ${row.bought.join(' ')}`);
  }
  console.log(`overall: ${served} served, ${(coins / Math.max(1, served)).toFixed(2)} coins a guest; ${r.tables} tables, ${r.staff} baristas, janitor ${r.janitor}; bank ${r.bank}`);
  await page.close();
}
await browser.close();
