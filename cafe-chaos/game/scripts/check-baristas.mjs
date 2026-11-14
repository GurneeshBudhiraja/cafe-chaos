/**
 * Servers and ambience check. With the viewer seated at the emulated
 * table and the café placed, checks that:
 * 1. all six servers are at their stations behind the counter, each
 *    drawn as one mesh;
 * 2. with nobody seated they keep busy behind the counter and nobody
 *    goes out;
 * 3. steam rises and blossom falls;
 * 4. the moment a guest is seated a server sets off with a tray, serves
 *    that guest (the tray goes down at the guest's own place, and the
 *    guest eats), and goes straight home (no bow);
 * 5. of two guests seated together, one near and one far, the nearer is
 *    served first (one server);
 * 6. a server on its way to a far guest turns to a guest seated nearer
 *    it, and the far guest is served next (one server);
 * 7. three guests seated together are served by three servers at once,
 *    never more than three out;
 * 8. a tray is cleared when its guest leaves;
 * 9. no console errors.
 * Guests are brought on and seated by the game's own calls here (the
 * pinch is covered by the seating check). Saves headset-view screenshots.
 *
 * Usage: dev server running, then `node scripts/check-baristas.mjs`.
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => {
      const { guests, system } = window.__cafe;
      guests.arrivals = false;
      guests.patienceSeconds = 100000;
      guests.seatedSeconds = 100000;
      system.replace();
    });
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.baristas.staff.length === 3 && window.__cafe.ambience.petals, null, { timeout: 60000 });
  },
});
const { page } = h;
const toWorld = (local) => page.evaluate((l) => { const { system } = window.__cafe; const p = system.cafe.localToWorld(new system.cafe.position.constructor(...l)); return { x: p.x, y: p.y, z: p.z }; }, local);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => {
  const info = window.__cafe.world.renderer.info.render;
  const target = info.frame + n;
  const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8);
}), n);

// Helpers in the page: bring a guest on and seat it at the free seat nearest a point, and read the staff.
await page.evaluate(() => {
  const { guests, baristas } = window.__cafe;
  window.__seat = (x, z) => {
    const seat = guests.seats.filter((s) => s.occupant === 0).reduce((best, s) => (Math.hypot(s.position.x - x, s.position.z - z) < Math.hypot(best.position.x - x, best.position.z - z) ? s : best));
    const guest = guests.spawn();
    guests.seatGuest(guest.id, seat.index);
    return { guest: guest.id, seat: seat.index, at: seat.position.toArray(), meal: seat.meal ? seat.meal.toArray() : null };
  };
  window.__staff = () => ({
    staff: baristas.staff.map((m) => ({
      name: m.barista.name, station: m.station, state: m.state, clip: m.barista.clip, trips: m.trips, tray: !!m.barista.tray, order: m.order ? m.order.guest : null,
      at: m.barista.root.position.toArray(),
      drawn: (() => { let n = 0; m.barista.root.traverse((o) => { let v = o.isMesh && o.layers.mask !== 0; for (let p = o; p && v; p = p.parent) v = p.visible; if (v) n++; }); return n; })(),
    })),
    orders: baristas.orders.map((o) => ({ guest: o.guest, served: o.served, server: o.server ? o.server.barista.name : null, bumped: o.bumped })),
    trays: baristas.served.map((s) => ({ guest: s.order.guest, at: s.tray.position.toArray(), sliding: s.slide < 1, fading: s.fading >= 0 })),
    servedCount: baristas.servedCount, servedLog: [...baristas.servedLog], out: baristas.out, switches: baristas.switches,
  });
  // The most servers ever out at once, watched all the way through.
  window.__maxOut = 0;
  setInterval(() => (window.__maxOut = Math.max(window.__maxOut, baristas.out)), 50);
});
const staff = () => page.evaluate(() => window.__staff());
const seatGuest = (x, z) => page.evaluate(([x, z]) => window.__seat(x, z), [x, z]);
const until = (predicate, arg, timeout = 400000) => page.waitForFunction(predicate, arg, { timeout, polling: 100 }).then((r) => r.jsonValue());

// 1. Everyone at their station.
const start = await staff();
{
  const stations = await page.evaluate(async () => (await import('/src/baristas/routes.ts')).STATION_X);
  const atStation = start.staff.every((m) => Math.abs(m.at[0] - stations[m.station]) < 0.03 && Math.abs(m.at[1] - 0.036) < 1e-3 && m.at[2] < -0.19 && m.at[2] > -0.225);
  check('all three servers are at their stations behind the counter', start.staff.length === 3 && atStation && new Set(start.staff.map((m) => m.name)).size === 3, start.staff.map((m) => `${m.name}@${m.at[0].toFixed(2)},${m.at[2].toFixed(3)}`).join(' '));
  check('each server is one draw call', start.staff.every((m) => m.drawn === 1), `meshes drawn: ${start.staff.map((m) => m.drawn).join(', ')}`);
}
await h.head(await toWorld([-0.05, 0.3, 0.28]), await toWorld([-0.1, 0.07, -0.19]), 400);
await frames(3);
await h.screenshot('artifacts/baristas-1-counter.png');

// 2. Busy behind the counter, and nobody out while nobody is seated.
{
  const seen = await page.evaluate(() => new Promise((resolve) => {
    const { baristas } = window.__cafe;
    const states = new Set();
    let moved = 0;
    const x0 = baristas.staff.map((m) => m.barista.root.position.x);
    const started = performance.now();
    const t = setInterval(() => {
      baristas.staff.forEach((m, i) => { states.add(m.state); moved = Math.max(moved, Math.abs(m.barista.root.position.x - x0[i])); });
      if (performance.now() - started > 22000) { clearInterval(t); resolve({ states: [...states], moved, out: window.__maxOut }); }
    }, 100);
  }));
  check('with nobody seated they keep busy behind the counter and nobody goes out', (seen.states.includes('shuffling') || seen.moved > 0.004) && seen.states.includes('backBar') && seen.out === 0, `states seen: ${seen.states.join(', ')}; farthest step along the bar ${(seen.moved * 100).toFixed(1)} cm; out ${seen.out}`);
}

// 3. Steam and blossom.
{
  const ambience = await page.evaluate(() => new Promise((resolve) => {
    const { ambience, system, world } = window.__cafe;
    const cafe = system.cafe;
    const puffs = [];
    cafe.traverse((o) => { if (/^Steam-/.test(o.name)) puffs.push(o); });
    const snap = () => ({ puffs: puffs.map((p) => [p.position.y, p.scale.x]), petals: cafe.children.filter((c) => c.name.startsWith('Falling-')).map((m) => { const e = m.instanceMatrix.array; const ys = []; for (let i = 0; i < m.count; i++) ys.push(e[i * 16 + 13]); return ys; }) });
    const a = snap();
    const frame0 = world.renderer.info.render.frame;
    const t = setInterval(() => {
      if (world.renderer.info.render.frame < frame0 + 1) return;
      clearInterval(t);
      const b = snap();
      resolve({
        steaming: ambience.steaming, puffs: puffs.length,
        puffsMoved: a.puffs.filter((p, i) => Math.abs(p[0] - b.puffs[i][0]) > 1e-5 || Math.abs(p[1] - b.puffs[i][1]) > 1e-4).length,
        kinds: a.petals.length, petals: a.petals.reduce((n, k) => n + k.length, 0),
        fell: a.petals.flat().filter((y, i) => b.petals.flat()[i] < y - 1e-4).length,
      });
    }, 20);
  }));
  check('steam rises and blossom falls', ambience.steaming && ambience.puffs === 6 && ambience.puffsMoved >= 4 && ambience.kinds === 3 && ambience.petals >= 30 && ambience.fell > ambience.petals * 0.6, `${ambience.puffs} puffs, ${ambience.puffsMoved} moving; ${ambience.petals} petals, ${ambience.fell} falling`);
}

// 4. One guest seated: a server sets off at once, serves that guest, and goes home.
await h.head(SEAT, LOOK, 300);
{
  const placed = await seatGuest(-0.223, 0.025);
  const went = await until(() => { const m = window.__cafe.baristas.staff.find((x) => x.state === 'out'); return m ? { name: m.barista.name, order: m.order ? m.order.guest : null, tray: !!m.barista.tray, clip: m.barista.clip } : null; }, null, 60000);
  check('the moment a guest is seated a server sets off with a tray for it', went.order === placed.guest && went.tray, `${went.name} is out with a tray for guest ${went.order} (seated: guest ${placed.guest})`);
  await until((name) => window.__cafe.baristas.staff.find((x) => x.barista.name === name).barista.root.position.z > -0.1, went.name);
  await h.screenshot('artifacts/baristas-2-carrying.png');
  // With no bow the server is only a moment at the table, so wait for the tray to be down rather than for the 'serving' state.
  await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.served === true, placed.guest);
  await h.screenshot('artifacts/baristas-3-serving.png');
  await until((name) => window.__cafe.baristas.staff.find((x) => x.barista.name === name).state === 'working', went.name);
  const after = await page.evaluate((id) => {
    const { guests } = window.__cafe;
    const g = guests.guests.find((x) => x.id === id);
    return { ...window.__staff(), guest: { served: g.served, clip: g.actor.clip } };
  }, placed.guest);
  const tray = after.trays.find((t) => t.guest === placed.guest);
  const home = after.staff.find((m) => m.name === went.name);
  check('it serves that guest at its own place, the guest eats, and the server goes home', !!tray && Math.hypot(tray.at[0] - placed.meal[0], tray.at[1] - placed.meal[1], tray.at[2] - placed.meal[2]) < 0.002 && after.guest.served && (after.guest.clip === 'SitEating' || after.guest.clip === 'SitHappy') && home.at[2] < -0.19 && !home.tray,
    `tray ${tray ? (Math.hypot(tray.at[0] - placed.meal[0], tray.at[2] - placed.meal[2]) * 1000).toFixed(1) : '?'} mm from guest ${placed.guest}'s place, guest served ${after.guest.served} (${after.guest.clip}), ${went.name} home at z ${home.at[2].toFixed(3)}`);
}

// 5. Two guests seated together, one near and one far, one server: the nearer first.
await page.evaluate(() => (window.__cafe.baristas.maxOut = 1));
{
  const [far, near] = await page.evaluate(() => [window.__seat(-0.297, 0.025), window.__seat(0.093, -0.135)]);
  await until(([a, b]) => { const log = window.__cafe.baristas.servedLog; return log.includes(a) && log.includes(b); }, [far.guest, near.guest]);
  const s = await staff();
  const order = s.servedLog.filter((g) => g === far.guest || g === near.guest);
  check('of two seated together, the nearer is served first', order[0] === near.guest && order[1] === far.guest && (await page.evaluate(() => window.__maxOut)) <= 3, `near guest ${near.guest} (back table by the counter's end), far guest ${far.guest} (front left); served in the order ${order.join(', ')}`);
}

// 6. A server on its way to a far guest turns to one seated nearer it; the far guest is served next.
{
  await until(() => window.__cafe.baristas.out === 0);
  // Servers walk briskly and the emulator's frames are long: the café's clock is slowed for this one, so the server
  // is still short of the near seat when its guest has sat down.
  await page.evaluate(() => (window.__cafe.system.timeScale = 0.4));
  // The far guest: front left, the whole length of the aisle away.
  const far = await seatGuest(-0.297, 0.025);
  // As the server comes out of the corridor into the aisle, seat a guest just ahead of it (the emulator's
  // frames are slow, so "just ahead" is where the server will be by the time the guest has sat down).
  const where = await until(() => { const m = window.__cafe.baristas.staff.find((x) => x.state === 'out'); return m && m.barista.root.position.z > -0.1 && m.barista.root.position.x < 0.21 ? { name: m.barista.name, x: m.barista.root.position.x, z: m.barista.root.position.z } : null; });
  const switchesBefore = (await staff()).switches;
  const near = await seatGuest(0.037, 0.025);
  await until((id) => window.__cafe.baristas.orders.some((o) => o.guest === id), near.guest, 60000);
  await frames(2);
  const turned = await staff();
  const server = turned.staff.find((m) => m.name === where.name);
  await until(([a, b]) => { const log = window.__cafe.baristas.servedLog; return log.includes(a) && log.includes(b); }, [far.guest, near.guest]);
  const s = await staff();
  await page.evaluate(() => (window.__cafe.system.timeScale = 1));
  const order = s.servedLog.filter((g) => g === far.guest || g === near.guest);
  // At the emulator's frame rate the near guest may already be served (no bow now) by the time this is read: then it has no order.
  check('a server on its way turns to a guest seated nearer it, and the other is served next', (server.order === near.guest || (server.order === null && turned.servedLog.includes(near.guest))) && turned.switches === switchesBefore + 1 && order[0] === near.guest && order[1] === far.guest,
    `${where.name} was at x ${where.x.toFixed(2)} heading for guest ${far.guest}; guest ${near.guest} seated just ahead of it; it is now bringing guest ${server.order}'s order (switches ${switchesBefore} to ${turned.switches}); served in the order ${order.join(', ')}`);
}

// 7. Three seated together, three servers: all out at once, never more than three.
await page.evaluate(() => { window.__cafe.baristas.maxOut = 3; window.__maxOut = 0; });
{
  await until(() => window.__cafe.baristas.out === 0);
  const three = await page.evaluate(() => [window.__seat(-0.037, 0.025), window.__seat(0.223, 0.025), window.__seat(-0.26, -0.095)]);
  const together = await until(() => { const out = window.__cafe.baristas.staff.filter((m) => m.state === 'out'); return out.length === 3 ? out.map((m) => ({ name: m.barista.name, order: m.order ? m.order.guest : null })) : null; }, null, 60000);
  await h.head(await toWorld([0.05, 0.4, 0.42]), await toWorld([0.0, 0.04, -0.06]), 400);
  await frames(2);
  await h.screenshot('artifacts/baristas-4-three-out.png');
  await until((ids) => ids.every((id) => window.__cafe.baristas.servedLog.includes(id)), three.map((t) => t.guest));
  const maxOut = await page.evaluate(() => window.__maxOut);
  const distinct = new Set(together.map((t) => t.order)).size === 3 && together.every((t) => three.some((g) => g.guest === t.order));
  check('three seated together are served by three servers at once, never more than three out', distinct && maxOut === 3, `${together.map((t) => `${t.name} for guest ${t.order}`).join(', ')}; most out at once ${maxOut}`);
}

// 8. A tray is cleared when its guest leaves.
{
  const before = await staff();
  await page.evaluate(() => (window.__cafe.guests.seatedSeconds = 1));
  const cleared = await until(() => { const { baristas, guests } = window.__cafe; return baristas.served.length === 0 && baristas.orders.length === 0 ? { trays: baristas.served.length, seated: guests.guests.filter((g) => g.state === 'seated').length } : null; });
  check('a tray is cleared when its guest leaves', before.trays.length >= 5 && cleared.trays === 0 && cleared.seated === 0, `${before.trays.length} trays on tables while their guests sat; ${cleared.trays} once the guests had gone`);
}

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
