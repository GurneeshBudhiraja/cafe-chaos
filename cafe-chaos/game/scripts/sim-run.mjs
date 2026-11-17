/**
 * Whole runs, played by scripted players, to tune the pace and the money.
 *
 * It opens the game in the desktop preview (no headset needed), puts the
 * café down, and plays runs to the end with a player who seats the head
 * of the line every HAND seconds and hires a server whenever the bank can
 * pay. Each run carries the bank and the staff on to the next, as a
 * player's save would. It reports, per run: how long the café stayed
 * open, guests fed (by tip), guests lost, coins, staff, and how long food
 * took.
 *
 * Usage: dev server running, then
 *   node scripts/sim-run.mjs            three players: quick (5 s), average (7 s), slow (10 s), three runs each
 *   HAND=6 RUNS=5 node scripts/sim-run.mjs   one player
 * SCALE (default 3) is how much faster than real time the café runs; CAP
 * (default 900) ends a run that lasts that many game seconds.
 */

import { chromium } from 'playwright';

const URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const SCALE = Number(process.env.SCALE ?? 3);
const RUNS = Number(process.env.RUNS ?? 3);
const CAP = Number(process.env.CAP ?? 900);
const players = process.env.HAND ? [{ name: `hand ${process.env.HAND}s`, hand: Number(process.env.HAND) }] : [{ name: 'quick', hand: 5 }, { name: 'average', hand: 7 }, { name: 'slow', hand: 10 }];

const browser = await chromium.launch({ args: ['--ignore-certificate-errors', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const player of players) {
  const page = await browser.newPage({ viewport: { width: 320, height: 240 }, ignoreHTTPSErrors: true });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__cafe?.system.pieces.length > 10 && window.__cafe.guests.seats.length > 0 && window.__cafe.baristas.staff.length > 0, null, { timeout: 120000 });
  await page.evaluate((scale) => {
    const c = window.__cafe;
    localStorage.clear();
    c.game.save.bank = 0; c.game.save.hires = 0; c.score.bank = 0; c.shop.restore(0);
    c.system.placed = true;
    c.system.timeScale = scale;
  }, SCALE);
  await page.waitForFunction(() => window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  await page.evaluate(() => { window.__cafe.game.click('open'); window.__cafe.game.click('skip'); });
  for (let run = 1; run <= RUNS; run++) {
    if (run > 1) await page.evaluate(() => window.__cafe.game.click('again'));
    const r = await page.evaluate(([hand, cap]) => new Promise((resolve) => {
      const c = window.__cafe;
      let lastSeat = -hand + 2;
      const waits = [];
      const seatedAt = new Map();
      const hires = [];
      const staff0 = c.shop.staff;
      const timer = setInterval(() => {
        const now = c.game.clock;
        if (c.game.phase !== 'run' || now > cap) {
          clearInterval(timer);
          if (c.game.phase === 'run') c.game.click('end');
          const count = (kind) => c.score.log.filter((e) => e.kind === kind).length;
          const tiers = { quick: 0, fair: 0, late: 0 };
          for (const e of c.score.log) if (e.tier) tiers[e.tier]++;
          waits.sort((a, b) => a - b);
          resolve({
            open: c.game.clock, fed: count('paid'), ...tiers, gaveUp: count('gaveUp'), stormed: count('stormedOff'), coins: c.score.takings, bank: c.score.bank,
            staff: `${staff0}->${c.shop.staff}`, debug: `staff ${c.baristas.staff.map((m) => m.state + (m.order ? '*' : '') + (m.walk ? 'w' : '')).join(',')} orders ${c.baristas.orders.length} served ${c.baristas.servedCount} seated ${c.guests.guests.filter((g) => g.state === 'seated').map((g) => g.seat?.index + (g.served ? 'S' : '')).join(',')}`, hiredAt: hires.join(' '), foodMedian: waits[waits.length >> 1] ?? 0, foodWorst: waits[waits.length - 1] ?? 0,
          });
          return;
        }
        // How long food takes, from sitting down.
        for (const g of c.guests.guests) {
          if (g.state === 'seated' && !seatedAt.has(g.id)) seatedAt.set(g.id, now);
          if (g.served && (seatedAt.get(g.id) ?? -1) >= 0) { waits.push(now - seatedAt.get(g.id)); seatedAt.set(g.id, -1); }
        }
        if (c.shop.affordable && c.shop.hire()) hires.push(Math.round(now));
        if (now - lastSeat < hand) return;
        const guest = c.guests.line.find((x) => x.state === 'queued' && !x.walk);
        const seat = c.guests.seats.find((s) => s.occupant === 0);
        if (guest && seat && c.guests.seatGuest(guest.id, seat.index)) lastSeat = now;
      }, 40);
    }), [player.hand, CAP]);
    const t = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    console.log(`${player.name.padEnd(8)} run ${run}: open ${t(r.open)}  fed ${String(r.fed).padStart(3)} (quick ${r.quick}, fair ${r.fair}, late ${r.late})  gave up ${r.gaveUp}  stormed ${r.stormed}  coins ${r.coins}  bank ${r.bank}  staff ${r.staff}${r.hiredAt ? ` (hired at ${r.hiredAt}s)` : ''}  food ${r.foodMedian.toFixed(0)}s, worst ${r.foodWorst.toFixed(0)}s${process.env.DEBUG ? `\n    ${r.debug}` : ''}`);
  }
  await page.close();
}
await browser.close();
