/**
 * Staff and ambience check. With the viewer seated at the emulated table
 * and the café placed (trips quickened), checks that:
 * 1. all six baristas are at their stations behind the counter, facing
 *    it, each drawn as one mesh;
 * 2. behind the counter they keep busy: over a few seconds some shuffle
 *    along the bar or turn to the back bar;
 * 3. one takes a tray and carries it out (the Carry clip), serves at a
 *    table (the tray is left on the table top), and walks back to its
 *    station;
 * 4. they take turns: several different baristas make trips, never more
 *    than three out at once;
 * 5. a tray is cleared from its table after a while;
 * 6. steam rises (the shell's clip is playing and its puffs move) and
 *    blossom falls (the petals move down and start again);
 * 7. no console errors.
 * Saves headset-view screenshots along the way.
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
      const { guests, baristas, system } = window.__cafe;
      guests.arrivals = false;
      baristas.trips = false;
      baristas.tripSeconds = [1.2, 2.2];
      baristas.trayStaysSeconds = 22;
      system.replace();
    });
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.baristas.staff.length === 6 && window.__cafe.ambience.petals, null, { timeout: 60000 });
  },
});
const { page } = h;
const toWorld = (local) => page.evaluate((l) => { const { system } = window.__cafe; const p = system.cafe.localToWorld(new system.cafe.position.constructor(...l)); return { x: p.x, y: p.y, z: p.z }; }, local);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => {
  const info = window.__cafe.world.renderer.info.render;
  const target = info.frame + n;
  const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8);
}), n);

const staff = () => page.evaluate(() => {
  const { baristas } = window.__cafe;
  return {
    staff: baristas.staff.map((m) => ({
      name: m.barista.name, station: m.station, state: m.state, clip: m.barista.clip, trips: m.trips, tray: !!m.barista.tray, yaw: m.yaw,
      at: m.barista.root.position.toArray(),
      drawn: (() => { let n = 0; m.barista.root.traverse((o) => { let v = o.isMesh && o.layers.mask !== 0; for (let p = o; p && v; p = p.parent) v = p.visible; if (v) n++; }); return n; })(),
    })),
    served: baristas.served.map((s) => ({ table: s.table, at: s.tray.position.toArray(), age: s.age })),
    servedCount: baristas.servedCount, out: baristas.out,
  };
});

// 1. Everyone at their station.
const start = await staff();
{
  const stations = await page.evaluate(async () => (await import('/src/baristas/routes.ts')).STATION_X);
  const atStation = start.staff.every((m) => Math.abs(m.at[0] - stations[m.station]) < 0.03 && Math.abs(m.at[1] - 0.036) < 1e-3 && m.at[2] < -0.19 && m.at[2] > -0.225);
  check('all six baristas are at their stations behind the counter', start.staff.length === 6 && atStation && new Set(start.staff.map((m) => m.name)).size === 6, start.staff.map((m) => `${m.name}@${m.at[0].toFixed(2)},${m.at[2].toFixed(3)}`).join(' '));
  check('each barista is one draw call', start.staff.every((m) => m.drawn === 1), `meshes drawn: ${start.staff.map((m) => m.drawn).join(', ')}`);
}
await h.screenshot('artifacts/baristas-1-seated.png');
await h.head(await toWorld([-0.05, 0.3, 0.28]), await toWorld([-0.1, 0.07, -0.19]), 400);
await frames(3);
await h.screenshot('artifacts/baristas-2-counter.png');

// 2. Busy behind the counter (sampled in the page for a few seconds).
{
  const seen = await page.evaluate(() => new Promise((resolve) => {
    const { baristas } = window.__cafe;
    const states = new Set();
    let moved = 0;
    const x0 = baristas.staff.map((m) => m.barista.root.position.x);
    const started = performance.now();
    const t = setInterval(() => {
      baristas.staff.forEach((m, i) => { states.add(m.state); moved = Math.max(moved, Math.abs(m.barista.root.position.x - x0[i])); });
      if (performance.now() - started > 25000) { clearInterval(t); resolve({ states: [...states], moved }); }
    }, 100);
  }));
  check('behind the counter they keep busy', (seen.states.includes('shuffling') || seen.moved > 0.004) && seen.states.includes('backBar'), `states seen: ${seen.states.join(', ')}; farthest step along the bar ${(seen.moved * 100).toFixed(1)} cm`);
}

// 6 (while they are still): steam and blossom.
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
      if (world.renderer.info.render.frame < frame0 + 4) return;
      clearInterval(t);
      const b = snap();
      let batchedPuffs = 0;
      for (const p of puffs) p.traverse((o) => { if (o.userData.batched) batchedPuffs++; });
      resolve({
        steaming: ambience.steaming, puffs: puffs.length, batchedPuffs,
        puffsMoved: a.puffs.filter((p, i) => Math.abs(p[0] - b.puffs[i][0]) > 1e-5 || Math.abs(p[1] - b.puffs[i][1]) > 1e-4).length,
        kinds: a.petals.length, petals: a.petals.reduce((n, k) => n + k.length, 0),
        fell: a.petals.flat().filter((y, i) => b.petals.flat()[i] < y - 1e-4).length,
        lowest: Math.min(...b.petals.flat()), highest: Math.max(...b.petals.flat()),
      });
    }, 20);
  }));
  check('steam rises over the bar', ambience.steaming && ambience.puffs === 6 && ambience.puffsMoved >= 4 && ambience.batchedPuffs === 0, `${ambience.puffs} puffs, ${ambience.puffsMoved} moved between frames, ${ambience.batchedPuffs} batched`);
  check('blossom falls from the tree', ambience.kinds === 3 && ambience.petals >= 30 && ambience.fell > ambience.petals * 0.4 && ambience.lowest >= -0.001 && ambience.highest < 0.45, `${ambience.petals} petals in ${ambience.kinds} instanced meshes, ${ambience.fell} fell between frames, heights ${ambience.lowest.toFixed(3)} to ${ambience.highest.toFixed(3)}`);
}

// 3. A trip: out with a tray, serve, back.
await h.head(SEAT, LOOK, 300);
await page.evaluate(() => {
  const { baristas } = window.__cafe;
  baristas.trips = true;
  // Note everything the first barista out does, sampled in the page.
  const log = (window.__trip = { name: null, samples: [], done: false, maxOut: 0, tableTop: null });
  const t = setInterval(() => {
    log.maxOut = Math.max(log.maxOut, baristas.out);
    const m = log.name ? baristas.staff.find((x) => x.barista.name === log.name) : baristas.staff.find((x) => x.state === 'out');
    if (!m) return;
    log.name = m.barista.name;
    if (log.done) return;
    log.samples.push({ state: m.state, clip: m.barista.clip, tray: !!m.barista.tray, x: m.barista.root.position.x, y: m.barista.root.position.y, z: m.barista.root.position.z, table: m.serving ? m.serving.table : null });
    if (m.state === 'working' && log.samples.some((s) => s.state === 'back')) log.done = true;
  }, 100);
  window.__tripTimer = t;
});
await page.waitForFunction(() => window.__trip.samples.some((s) => s.state === 'out' && s.z > -0.1), null, { timeout: 240000 });
await h.screenshot('artifacts/baristas-3-carrying.png');
await page.waitForFunction(() => window.__trip.samples.some((s) => s.state === 'serving'), null, { timeout: 240000 });
await h.screenshot('artifacts/baristas-4-serving.png');
await page.waitForFunction(() => window.__trip.done, null, { timeout: 400000 });
{
  const trip = await page.evaluate(() => window.__trip);
  const s = trip.samples;
  const carried = s.filter((q) => q.state === 'out');
  const order = ['out', 'serving', 'bowing', 'back', 'working'].map((st) => s.findIndex((q) => q.state === st));
  const inOrder = order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1]));
  const home = s[s.length - 1];
  check('one takes a tray out, serves at a table, bows and walks back', inOrder && carried.every((q) => q.tray && q.clip === 'Carry') && s.some((q) => q.state === 'back' && q.clip === 'Walk' && !q.tray) && home.z < -0.19 && Math.abs(home.y - 0.036) < 1e-3,
    `${trip.name}: ${['out', 'serving', 'bowing', 'back', 'working'].filter((st) => s.some((q) => q.state === st)).join(' > ')}; carried with ${[...new Set(carried.map((q) => q.clip))].join('/')}, home at z ${home.z.toFixed(3)}`);
  const now = await staff();
  const tables = await page.evaluate(() => window.__cafe.baristas.servePoints.map((p) => ({ table: p.table, x: p.tray.x, z: p.tray.z })));
  const table = s.find((q) => q.table !== null)?.table;
  const left = now.served.find((t) => t.table === table) ?? now.served[0];
  const want = tables.find((t) => t.table === left?.table);
  check('the tray is left on the table top', !!left && !!want && Math.hypot(left.at[0] - want.x, left.at[2] - want.z) < 1e-3 && left.at[1] > 0.04 && left.at[1] < 0.07, left ? `on table ${left.table} at [${left.at.map((v) => v.toFixed(3)).join(', ')}]` : 'no tray on a table');
}

// 4. They take turns.
await page.waitForFunction(() => window.__cafe.baristas.staff.filter((m) => m.trips > 0).length >= 4, null, { timeout: 600000 });
{
  const now = await staff();
  const maxOut = await page.evaluate(() => window.__trip.maxOut);
  check('they take turns, never more than three out at once', now.staff.filter((m) => m.trips > 0).length >= 4 && maxOut <= 3, `trips: ${now.staff.map((m) => `${m.name} ${m.trips}`).join(', ')}; most out at once ${maxOut}; ${now.servedCount} trays served`);
}
await h.head(await toWorld([0.05, 0.4, 0.42]), await toWorld([0.0, 0.04, -0.06]), 400);
await frames(3);
await h.screenshot('artifacts/baristas-5-floor.png');

// 5. Trays are cleared away.
{
  const cleared = await page.waitForFunction(() => {
    const { baristas } = window.__cafe;
    return baristas.servedCount > baristas.served.length ? { served: baristas.servedCount, onTables: baristas.served.length, oldest: Math.max(0, ...baristas.served.map((s) => s.age)) } : null;
  }, null, { timeout: 400000 }).then((r) => r.jsonValue());
  check('a tray is cleared from its table after a while', cleared.served > cleared.onTables && cleared.oldest < 23, `${cleared.served} served, ${cleared.onTables} on tables now, the oldest ${cleared.oldest.toFixed(0)} s old`);
}

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
