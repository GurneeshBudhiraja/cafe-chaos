/**
 * The Canadian café's layout check (the layout pass of 17 Nov,
 * models/27-cafe-canada/INTEGRATION.md). In the desktop preview, with the
 * Canadian café swapped in, checks that:
 * 1. the cabin's four tables, the deck, the lake bench, the bonfire and the
 *    upper deck's four tables have their seats, on the shell's anchors;
 * 2. the takeaway spot is the shell's `TakeawaySpot`;
 * 3. the baristas' stations are walk-grid ground behind the counter, and
 *    each reaches a cabin table and every upstairs seat;
 * 4. leaving guests walk from every seat (upstairs too) down the stone
 *    exit walkway to the shell's `Exit`, not out by the gate.
 *
 * Usage: dev server running, then `node scripts/check-canada.mjs`.
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
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(APP_URL);
await page.waitForFunction(() => window.__cafe?.system.nav && window.__cafe.guests.seats.length > 0, null, { timeout: 90000 });
await page.waitForFunction(() => window.__cafe.system.setCafe('canada'), null, { timeout: 240000, polling: 1000 });
await page.waitForFunction(() => window.__cafe.guests.seats.some((s) => s.takeaway), null, { timeout: 30000 });

const r = await page.evaluate(async () => {
  const { system, guests } = window.__cafe;
  const nav = system.nav;
  const V = system.cafe.position.constructor;
  const { CANADA_EXIT_LANES } = await import('/src/guests/paths.ts');
  const { CANADA_LAYOUT } = await import('/src/cafe/canada-layout.ts');
  const { stationPoint } = await import('/src/baristas/routes.ts');
  const seats = guests.seats.filter((s) => s.table >= 0);
  const take = guests.seats.find((s) => s.takeaway);
  const tables = CANADA_LAYOUT.map((p) => ({ x: p.x, z: p.z, y: p.y ?? 0, model: p.model }));
  const stations = [0, 1, 2].map((i) => stationPoint(i));
  const to = (l) => new V(l.x, nav.heightAt(l.x, l.z), l.z);
  const outs = seats.map((s) => {
    const way = system.findPath(s.position.clone(), to(CANADA_EXIT_LANES[1]));
    const end = way?.[way.length - 1];
    return { table: s.table, ok: !!way && Math.hypot(end.x - 0.06, end.z - 0.295) < 0.01 && !way.some((q) => q.x > 0.36) };
  });
  const upstairs = seats.filter((s) => s.position.y > 0.1);
  return {
    seatTables: [...new Set(seats.map((s) => s.table))].sort((a, b) => a - b),
    seats: seats.length,
    tables,
    take: take && { x: take.position.x, z: take.position.z },
    stations: stations.map((p) => ({ z: p.z, walk: nav.walkable(p.x, p.z) })),
    toCabin: stations.every((p) => !!system.findPath(p, seats.find((s) => s.table === 3).position.clone())),
    toUpper: stations.every((p) => upstairs.every((s) => !!system.findPath(p, s.position.clone()))),
    upstairs: upstairs.length,
    lanes: CANADA_EXIT_LANES.every((l) => nav.walkable(l.x, l.z)),
    outs,
  };
});

const near = (a, x, z) => Math.hypot(a.x - x, a.z - z) < 0.002;
const T = r.tables;
check('every table has seats', r.seatTables.join() === '1,2,3,4,5,6,7,8,9,10,11,12,13', `tables ${r.seatTables.join(',')}, ${r.seats} seats`);
check('cabin tables on TableSpot-1/2/3/6', near(T[1], -0.31, -0.05) && near(T[2], -0.31, 0.09) && near(T[3], -0.17, 0.02) && near(T[13], -0.31, 0.02), [1, 2, 3, 13].map((i) => `(${T[i].x}, ${T[i].z})`).join(' '));
check('deck tables on PatioSpot-1/2, the bench on DockSpot', near(T[4], 0.15, 0.11) && near(T[5], 0.31, 0.11) && near(T[6], 0.26, 0.25) && T[6].y === 0.022, [4, 5, 6].map((i) => `(${T[i].x}, ${T[i].y}, ${T[i].z})`).join(' '));
check(
  'four upper-deck tables on UpperSpot-1..4',
  near(T[9], -0.32, -0.2225) && near(T[10], -0.03, -0.2225) && near(T[11], -0.32, -0.1375) && near(T[12], -0.03, -0.1375) && T.slice(9, 13).every((t) => t.model === 'patio-table' && t.y === 0.1548) && r.upstairs === 8,
  `${r.upstairs} seats upstairs`,
);
check('takeaway at TakeawaySpot', !!r.take && near(r.take, 0, -0.085), JSON.stringify(r.take));
check('stations are ground behind the counter', r.stations.every((s) => s.walk && s.z < -0.155 && s.z > -0.27), JSON.stringify(r.stations));
check('baristas reach the cabin and the upper deck', r.toCabin && r.toUpper, `cabin ${r.toCabin}, upstairs ${r.toUpper}`);
check('exit lanes are ground', r.lanes, String(r.lanes));
const bad = r.outs.filter((o) => !o.ok).map((o) => o.table);
check('every seat leaves down the walkway to Exit', bad.length === 0, bad.length ? `not from tables ${bad.join(',')}` : `${r.outs.length} seats`);
check('no errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');

await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
