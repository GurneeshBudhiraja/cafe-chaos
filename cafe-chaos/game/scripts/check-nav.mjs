/**
 * Navigation check. In the desktop preview (no headset needed: the grid
 * is read from the café's geometry, wherever the café stands), checks
 * that:
 * 1. the grid is built from the café's own meshes, quickly;
 * 2. it has the café right: the aisles, the door, the deck, the front
 *    path, the duckboard, the front opening and the player's table are
 *    places to stand; the counter, a table, a chair seat, the fence and
 *    the rest of the room's front are not;
 * 3. a guest's way out from a seat goes through the room's front opening
 *    by the Meta stone and left along the garden path, not by the door
 *    and never off the plate;
 * 4. or right along the path, the same;
 * 5. a barista's way from its station to a table goes round the counter;
 * 6. the same way asked for again costs nothing (it is remembered);
 * 7. a table put down in the middle of a way, and the grid rebuilt, is
 *    walked round: nothing else is told about it.
 * With PICTURE=1 it prints the grid as text with a way drawn on it.
 *
 * Usage: dev server running, then `node scripts/check-nav.mjs`.
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
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(APP_URL);
await page.waitForFunction(() => window.__cafe?.system.nav && window.__cafe.guests.seats.length > 0 && window.__cafe.baristas.servePoints.length > 0, null, { timeout: 60000 });

const facts = await page.evaluate(async () => {
  const { system, guests, baristas } = window.__cafe;
  const nav = system.nav;
  const V = system.cafe.position.constructor;
  const { EXIT_ENDS, FRONT_OPENING } = await import('/src/guests/paths.ts');
  const { stationPoint } = await import('/src/baristas/routes.ts');
  const P = (p) => [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)];
  const seat = guests.seats.reduce((best, s) => (Math.hypot(s.position.x - 0.093, s.position.z + 0.135) < Math.hypot(best.position.x - 0.093, best.position.z + 0.135) ? s : best));
  const landing = nav.nearest(seat.position.x, seat.position.z, 0.09);
  // A guest's way out, as the game builds it: to the front opening, then along the path to an end.
  const join = (a, b) => (a && b ? [...a, ...b.slice(2)] : null);
  const searches0 = nav.searches;
  const toOpening = nav.findPath(landing, FRONT_OPENING);
  const searches1 = nav.searches;
  const again = nav.findPath(landing, FRONT_OPENING);
  const searches2 = nav.searches;
  const out = join(toOpening, nav.findPath(FRONT_OPENING, EXIT_ENDS.left[0]));
  const outRight = join(toOpening, nav.findPath(FRONT_OPENING, EXIT_ENDS.right[1]));
  const table = baristas.servePoints[0];
  const serve = nav.findPath(stationPoint(1), table.stand);
  window.__navFacts = { landing, exit: FRONT_OPENING, seat };
  return {
    buildMs: nav.buildMs, triangles: nav.triangles, cells: nav.nx * nav.nz, size: [nav.nx, nav.nz],
    stand: {
      'the middle aisle': nav.walkable(0, -0.04), 'the door': nav.walkable(0.335, 0.055), 'the deck': nav.walkable(0.41, 0.1), 'the front path': nav.walkable(-0.1, 0.25),
      'the duckboard': !!nav.nearest(-0.1, -0.205, 0.012), "the player's table": nav.walkable(0.6, 0.03), 'the front opening by the Meta stone': nav.walkable(0.065, 0.186),
    },
    not: {
      'the counter': nav.walkable(-0.1, -0.165), 'a table': nav.walkable(0, 0.025), 'a chair seat': nav.walkable(seat.position.x, seat.position.z), 'the fence': nav.walkable(0.456, 0.2),
      "the room's front away from the opening": nav.walkable(-0.2, 0.184) || nav.walkable(0.25, 0.184), 'the back-bar cabinet': nav.walkable(-0.1, -0.25),
    },
    seats: guests.seats.length, servePoints: baristas.servePoints.map((p) => ({ table: p.table, stand: P(p.stand), yaw: +p.yaw.toFixed(2) })),
    out: out ? out.map(P) : null, outRight: outRight ? outRight.map(P) : null, serve: serve ? serve.map(P) : null,
    remembered: searches1 === searches0 + 1 && searches2 === searches1 && !!again && again.length === toOpening.length,
    picture: nav.picture(2, out ?? []),
    station: P(stationPoint(1)), tableStand: P(table.stand),
  };
});
if (process.env.PICTURE) console.log(facts.picture);

check('the grid is built from the café itself, quickly', facts.triangles > 20000 && facts.buildMs < 1500, `${facts.triangles} triangles into ${facts.size[0]} x ${facts.size[1]} squares in ${facts.buildMs.toFixed(0)} ms`);
{
  const yes = Object.entries(facts.stand);
  const no = Object.entries(facts.not);
  check('it has the café right', yes.every(([, v]) => v) && no.every(([, v]) => !v), `can stand: ${yes.map(([k, v]) => `${k} ${v ? 'yes' : 'NO'}`).join(', ')}; cannot: ${no.map(([k, v]) => `${k} ${v ? 'YES' : 'no'}`).join(', ')}`);
  check('the seats and the tables are found from it', facts.seats === 23 && facts.servePoints.length === 12, `${facts.seats} usable seats, ${facts.servePoints.length} places to serve (ten tables, the bar, the quiet corner), each with somewhere to stand`);
}

/** What a way does: its length, whether it uses the door, where it crosses the room's front, and whether it leaves the plate. */
const describe = (path) => {
  let length = 0;
  let door = false;
  let off = false;
  const crossings = [];
  for (let i = 1; i < path.length; i++) {
    const [ax, , az] = path[i - 1];
    const [bx, , bz] = path[i];
    length += Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.002));
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps;
      const z = az + ((bz - az) * s) / steps;
      if (x > 0.335 && x < 0.375 && z > -0.005 && z < 0.115) door = true;
      if (Math.abs(x) > 0.461 || Math.abs(z) > 0.311) off = true;
    }
    if ((az - 0.184) * (bz - 0.184) < 0) crossings.push(ax + ((bx - ax) * (0.184 - az)) / (bz - az));
  }
  return { length, door, off, crossings, end: path[path.length - 1] };
};
const byTheStone = (d) => d.crossings.length === 1 && d.crossings[0] > 0 && d.crossings[0] < 0.135;
if (facts.out && facts.outRight) {
  const l = describe(facts.out);
  const r = describe(facts.outRight);
  check('from a seat the way out is the front opening by the Meta stone, then left along the path', byTheStone(l) && !l.door && !l.off && l.end[0] < -0.2 && l.end[2] > 0.2, `${facts.out.length} points, ${(l.length * 100).toFixed(0)} cm, crosses the room's front at x ${l.crossings.map((x) => x.toFixed(3)).join(', ')}, by the door ${l.door}, off the plate ${l.off}, ends at [${l.end[0]}, ${l.end[2]}]`);
  check('or right along the path', byTheStone(r) && !r.door && !r.off && r.end[0] > 0.3 && r.end[2] > 0.2, `${facts.outRight.length} points, ${(r.length * 100).toFixed(0)} cm, crosses at x ${r.crossings.map((x) => x.toFixed(3)).join(', ')}, off the plate ${r.off}, ends at [${r.end[0]}, ${r.end[2]}]`);
} else {
  check('from a seat the way out is the front opening by the Meta stone, then left along the path', false, 'no way found');
  check('or right along the path', false, 'no way found');
}
if (facts.serve) {
  const xs = facts.serve.map((p) => p[0]);
  const behind = facts.serve[0][2] < -0.19;
  const round = Math.max(...xs) > 0.085;
  const end = facts.serve[facts.serve.length - 1];
  check("a barista's way to a table goes round the counter's end", behind && round && Math.hypot(end[0] - facts.tableStand[0], end[2] - facts.tableStand[2]) < 0.01, `${facts.serve.length} points from the station at x ${facts.station[0]}, farthest right x ${Math.max(...xs).toFixed(3)}, ends at the table's stand [${end[0]}, ${end[2]}]`);
} else check("a barista's way to a table goes round the counter's end", false, 'no way found');
check('the same way asked for again is remembered', facts.remembered, `second ask searched again: ${!facts.remembered}`);

// 7. A new table in the way.
{
  const res = await page.evaluate(async () => {
    const { system, baristas } = window.__cafe;
    const nav = system.nav;
    const { copyModel } = await import('/src/systems/cafe-system.ts');
    const { landing, exit } = window.__navFacts;
    const before = nav.findPath(landing, exit);
    // The point of the way inside the room farthest from both its ends: put a table right there.
    const inside = before.filter((p) => p.x < 0.3 && p.z < 0.17);
    let at = inside[Math.floor(inside.length / 2)];
    // Somewhere along the longest stretch inside, so it truly blocks the line walked.
    let longest = 0;
    for (let i = 1; i < inside.length; i++) {
      const d = inside[i].distanceTo(inside[i - 1]);
      if (d > longest) { longest = d; at = inside[i].clone().add(inside[i - 1]).multiplyScalar(0.5); }
    }
    for (let tries = 0; tries < 100 && !window.__tableBig; tries++) {
      try { window.__tableBig = copyModel('table-big'); } catch { await new Promise((r) => setTimeout(r, 200)); }
    }
    const table = window.__tableBig;
    if (!table) return { error: 'the table-big model did not load' };
    table.position.set(at.x, 0.024, at.z);
    system.cafe.add(table);
    system.pieces.push(table);
    const stoodBefore = nav.walkable(at.x, at.z);
    nav.rebuild();
    baristas.findTables();
    const after = nav.findPath(landing, exit);
    const near = (path) => Math.min(...path.flatMap((p, i) => {
      if (i === 0) return [];
      const a = path[i - 1], out = [];
      const steps = Math.max(1, Math.ceil(a.distanceTo(p) / 0.003));
      for (let s = 0; s <= steps; s++) out.push(Math.hypot(a.x + ((p.x - a.x) * s) / steps - at.x, a.z + ((p.z - a.z) * s) / steps - at.z));
      return out;
    }));
    const len = (path) => path.reduce((sum, p, i) => (i ? sum + p.distanceTo(path[i - 1]) : 0), 0);
    return {
      at: [at.x, at.z], stoodBefore, standsNow: nav.walkable(at.x, at.z), rebuildMs: nav.buildMs,
      before: { near: near(before), length: len(before) }, after: after ? { near: near(after), length: len(after), points: after.length } : null,
      tables: baristas.servePoints.length, picture: nav.picture(2, after ?? []),
    };
  });
  if (res.error) check('a new table in the way is walked round', false, res.error);
  else {
    if (process.env.PICTURE) console.log(res.picture);
    check('a new table in the way is walked round', res.stoodBefore && !res.standsNow && !!res.after && res.before.near < 0.005 && res.after.near > 0.02 && res.after.length > res.before.length,
      `table put at [${res.at.map((v) => v.toFixed(3)).join(', ')}] (on the old way, ${(res.before.near * 100).toFixed(1)} cm from it); after a ${res.rebuildMs.toFixed(0)} ms rebuild the way passes ${res.after ? (res.after.near * 100).toFixed(1) : '?'} cm from its middle and is ${res.after ? ((res.after.length - res.before.length) * 100).toFixed(0) : '?'} cm longer`);
    check('and the baristas have somewhere to stand to serve it', res.tables === 13, `${res.tables} places to serve now`);
  }
}

check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
await browser.close();
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
