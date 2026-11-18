/**
 * Sound check. With the viewer seated at the emulated table (an XR
 * session, which is what switches the café's sound on), checks that:
 * 1. the sound starts with the session, the listener at the head;
 * 2. the background plays by itself: the kettle, the pond, cups at the
 *    tables, and the door's chime as guests arrive;
 * 3. seating a guest plays the seated thump and chime and its "mm";
 * 4. opening a table plays the unlock's click and bells;
 * 5. no console errors.
 * It does not listen: it checks what was played, and when.
 *
 * Usage: dev server running, then `node scripts/check-sound.mjs`.
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({ sound: true,
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => {
      const { guests, system } = window.__cafe;
      guests.spawnSeconds = [1.2, 2];
      guests.patienceSeconds = 100000;
      system.replace();
    });
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 30000 });
  },
});
const { page } = h;
const sound = () => page.evaluate(() => {
  const s = window.__cafe.sound;
  return { state: s.ctx?.state ?? 'none', played: { ...s.played } };
});

// 1. Started with the session.
await page.waitForFunction(() => window.__cafe.sound.ctx?.state === 'running', null, { timeout: 60000 }).catch(() => {});
const first = await sound();
check('the sound starts with the session', first.state === 'running', `audio ${first.state}`);

// 2. The background, and the door as guests arrive.
await page.waitForFunction(() => {
  const p = window.__cafe.sound.played;
  return p.bubble > 2 && p.trickle > 2 && p.furin >= 1 && p.clink >= 1;
}, null, { timeout: 300000 }).catch(() => {});
const bg = await sound();
check('the background plays by itself, and the door chimes for arrivals', bg.played.bubble > 2 && bg.played.trickle > 2 && bg.played.furin >= 1 && bg.played.clink >= 1,
  `kettle bubbles ${bg.played.bubble ?? 0}, pond trickles ${bg.played.trickle ?? 0}, cups ${bg.played.clink ?? 0}, door chimes ${bg.played.furin ?? 0}, espresso ${bg.played.espresso ?? 0}, crickets ${bg.played.cricket ?? 0}`);

// 3. A guest seated.
await page.waitForFunction(() => window.__cafe.guests.line.some((g) => g.state === 'queued'), null, { timeout: 300000 });
await page.evaluate(() => {
  const { guests } = window.__cafe;
  const g = guests.line.find((x) => x.state === 'queued');
  const seat = guests.seats.find((s) => s.occupant === 0);
  guests.seatGuest(g.id, seat.index);
});
await page.waitForFunction(() => (window.__cafe.sound.played.seated ?? 0) >= 1, null, { timeout: 120000 }).catch(() => {});
const sat = await sound();
check('seating a guest plays its thump, chime and "mm"', (sat.played.seated ?? 0) >= 1 && (sat.played.mm ?? 0) >= 1, `seated ${sat.played.seated ?? 0}, mm ${sat.played.mm ?? 0}`);

// 4. A purchase: a table bought from its padlock.
await page.evaluate(() => { const { shop, system, score } = window.__cafe; score.bank = 900; shop.buyTable(system.tables.find((t) => !shop.tables.includes(t))); });
await page.waitForFunction(() => (window.__cafe.sound.played.unlock ?? 0) >= 1, null, { timeout: 60000 }).catch(() => {});
const un = await sound();
check('opening a table plays the unlock and the bells', (un.played.unlock ?? 0) === 1, `unlock ${un.played.unlock ?? 0}`);

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
