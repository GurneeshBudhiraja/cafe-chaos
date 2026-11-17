/**
 * The game with its levels, recorded as the headset shows it, in the real
 * game with a fresh save (not test mode), for the owner to see the whole
 * of it in one short clip:
 * - the start card; NEW GAME; the first run's coach card, its Skip taken
 *   by the hand ray;
 * - level 1: guests pinched up from the gate and seated; the dot over a
 *   waiting guest; a guest served, its "!" then its mood bubble; the pay;
 * - the "Open a table" tip; a padlock pointed at (the tag opens into its
 *   price), pinched; BUY on the buy card; the table opens;
 * - a table left dirty; the barista wipes it;
 * - a level reached: the bar's banner and confetti, the next goal under it, the café going on;
 * - level 2: a guest in a hurry (the hourglass) and its tip; the shop
 *   (Barista and Janitor rows); the janitor hired, cleaning;
 * - two friends; a guest storming out; Pause and Resume.
 * Cream model hands (the player's real hands cannot be filmed); the
 * emulator's grey room hidden; the theme under it.
 *
 * Usage: dev server running, then `node scripts/record-levels.mjs`.
 * Output: artifacts/levels.mp4
 */

import { execFileSync } from 'node:child_process';
import { renameSync } from 'node:fs';

process.env.APP_URL = `${process.env.APP_URL_GAME ?? 'https://localhost:8082/'}?hands=cream`;
const { startHeadset } = await import('./lib/headset.mjs');

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const TABLE = { x: -1.3, y: 0.79, z: 0.28 };
const LAP = { left: [-0.7, 0.85, 0.42], right: [-0.7, 0.85, 0.14] };
const REST = [-0.62, 0.62, 0.62];
const Q = { x: 0, y: 0, z: 0, w: 1 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
let pinchOffset = [0, 0, 0];
let openOffset = [0, 0, 0];
let page;
function send(m, p) {
  return page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
}
function frames(n) {
  return page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
}
function handTo(hand, p, q = Q) {
  return send('set_transform', { device: `hand-${hand}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: q });
}
function pinch(value) {
  return send('set_select_value', { device: 'hand-right', value });
}

const h = await startHeadset({
  record: process.env.NORECORD ? null : 'levels',
  maxSpeedUp: 30,
  async prepare(h) {
    page = h.page;
    await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z });
    await page.evaluate(() => { localStorage.removeItem('cafe-chaos/save/v3'); });
    await page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 60000 });
    await page.evaluate(() => {
      for (const c of document.querySelectorAll('canvas')) if (getComputedStyle(c).zIndex === '1') c.style.visibility = 'hidden';
      document.body.style.background = '#241d19';
    });
    for (const hand of ['left', 'right']) await handTo(hand, LAP[hand]);
    await frames(6);
    await pinch(1);
    await frames(3);
    pinchOffset = add(await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray()), LAP.right, -1);
    await pinch(0);
    await frames(3);
    openOffset = add(await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray()), LAP.right, -1);
    await page.evaluate((timeScale) => {
      const { system } = window.__cafe;
      system.timeScale = timeScale;
      system.replace();
    }, 1 / h.speedUp);
    await page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 60000 });
  },
});
const { pause } = h;

let handAt = null;
/** Move the right hand so its pinch point travels to `to` (world) over `ms` of video time, eased. */
async function reach(ms, to, open = false) {
  const from = handAt ?? LAP.right;
  const goal = add(to, open ? openOffset : pinchOffset, -1);
  const real = ms * h.speedUp;
  const t0 = performance.now();
  for (;;) {
    const t = Math.min(1, (performance.now() - t0) / real);
    await handTo('right', lerp(from, goal, ease(t)));
    if (t >= 1) break;
    await frames(1);
  }
  handAt = goal;
}
const rest = () => reach(900, add(LAP.right, pinchOffset));
const toWorld = (local) => page.evaluate((l) => { const { system } = window.__cafe; return system.cafe.localToWorld(new system.cafe.position.constructor(...l)).toArray(); }, local);
const until = (predicate, arg, timeout = 10 * 60 * 1000) => page.waitForFunction(predicate, arg, { timeout, polling: 100 }).then((r) => r.jsonValue()).catch(() => null);
const HANG = 0.042 + 0.03;
const overview = (ms = 1300) => h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z }, ms);
/** The game's speed: the clip runs the café at `k` times real time (1 is real). */
const speed = (k) => page.evaluate((k) => { window.__cafe.system.timeScale = k; }, k / h.speedUp);

/** A quaternion turning the hand's forward (-Z) toward a point. */
const aimQ = (from, to) => {
  const d = to.map((v, i) => v - from[i]);
  const len = Math.hypot(...d);
  const n = d.map((v) => v / len);
  const c = [n[1], -n[0], 0];
  const w = 1 - n[2];
  const ql = Math.hypot(c[0], c[1], c[2], w);
  return { x: c[0] / ql, y: c[1] / ql, z: c[2] / ql, w: w / ql };
};
const slerpish = (a, b, t) => { const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t }; const l = Math.hypot(q.x, q.y, q.z, q.w); return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }; };
const RAY_FROM = [-1.08, 0.98, 0.16];
let rayQ = Q;
/** Raise the hand and point its ray at a world point over `ms`; then pinch. */
async function rayPinch(target, ms = 1200, hold = 1100) {
  const aim = aimQ(RAY_FROM, target);
  const n = Math.max(6, Math.round(ms / 90));
  const from = handAt ?? LAP.right;
  for (let i = 1; i <= n; i++) { await handTo('right', lerp(from, RAY_FROM, ease(i / n)), slerpish(rayQ, aim, ease(i / n))); await pause(90); }
  handAt = RAY_FROM;
  rayQ = aim;
  await pause(hold);
  await pinch(1);
  await pause(250);
  await pinch(0);
}
/** Where a button on a panel is (world). */
const buttonAt = (expr, id) => page.evaluate(([expr, id]) => {
  const p = new Function('return ' + expr)();
  const b = p.buttons.find((x) => x.id === id);
  const g = p.mesh.geometry.parameters;
  const V = p.mesh.position.constructor;
  p.mesh.updateWorldMatrix(true, false);
  return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, 0)).toArray();
}, [expr, id]);
/** Pinch up the guest at the head of the line; returns it. */
async function pickHead() {
  for (let tries = 0; tries < 6; tries++) {
    const guest = await until(() => {
      const { guests, system } = window.__cafe;
      const V = system.cafe.position.constructor;
      const g = guests.line.find((x) => x.state === 'queued' && !x.walk && x.patience > 3.5);
      return g ? { id: g.id, grip: g.actor.grip.getWorldPosition(new V()).toArray() } : null;
    });
    if (!guest) continue;
    await reach(900, add(guest.grip, [0.02, 0.06, 0.04]));
    const now = await page.evaluate((id) => {
      const { guests, system } = window.__cafe;
      const g = guests.guests.find((x) => x.id === id && x.state === 'queued');
      return g ? g.actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray() : null;
    }, guest.id);
    if (now) {
      await reach(400, now);
      await pause(150);
      await pinch(1);
      await pause(300);
      if (await page.evaluate(() => !!window.__cafe.guests.carriedBy('right'))) return guest;
      await pinch(0);
    }
    await pause(300);
  }
  return null;
}
/** The seat the carried guest should go to: the open seat meeting the most of its wishes. */
const bestSeat = () => page.evaluate(() => {
  const { guests, system } = window.__cafe;
  const g = guests.carriedBy('right');
  if (!g) return null;
  const free = guests.seats.filter((s) => s.occupant === 0 && !s.locked && !s.dirty);
  let best = free[0];
  let score = -1;
  for (const s of free) {
    const k = guests.grantsEach(g, s).filter(Boolean).length;
    if (k > score) { score = k; best = s; }
  }
  return best ? system.cafe.localToWorld(best.position.clone()).toArray() : null;
});
/** Carry the held guest over a seat (`at`, world) and let go. */
async function drop(at, linger = 700) {
  await reach(1300, add(at, [0, HANG + 0.05, 0]));
  await reach(400, add(at, [0, HANG, 0]));
  await pause(linger);
  await pinch(0);
  await pause(500);
}
async function seatOne(linger = 700) {
  const g = await pickHead();
  if (!g) return false;
  const at = await bestSeat();
  if (!at) { await pinch(0); return false; }
  await drop(at, linger);
  return true;
}

// 1. The start card; NEW GAME (pointed at and pinched, as the menus are pressed).
await until(() => window.__cafe.game.phase === 'title');
await pause(2500);
await rayPinch(await buttonAt('window.__cafe.game.menu.card', 'new'), 1400, 900);
await until(() => window.__cafe.game.phase === 'tutorial' && window.__cafe.game.coach.open);
await pause(2500);
// The coach card's Skip, by the ray.
await rayPinch(await buttonAt('window.__cafe.game.coach', 'skip'), 1100, 800);
await until(() => window.__cafe.game.phase === 'run');
await rest();
await speed(1);
await page.evaluate(() => { const { guests } = window.__cafe; guests.mealSeconds = 10; });

// 2. Level 1: a guest pinched up and seated; the food comes; its mood bubble; the pay.
const lineView = await toWorld([0.4, 0.2, 0.34]);
await h.head(P(lineView), P(await toWorld([0.48, 0.04, 0.1])), 1400);
await until(() => window.__cafe.guests.line.some((g) => g.state === 'queued' && !g.walk));
await pause(1200);
await seatOne(900);
await overview();
await pause(1000);
// The next two as they come.
for (let i = 0; i < 2; i++) {
  await until(() => window.__cafe.guests.line.some((g) => g.state === 'queued' && !g.walk), null, 60000);
  await seatOne(500);
  await rest();
}
await h.head(P(await toWorld([0.12, 0.22, 0.3])), P(await toWorld([0, 0.05, 0])), 1200);
await pause(5000);

// 3. Open a table: the tip, the padlock pointed at, pinched, BUY.
await page.evaluate(() => { const { score } = window.__cafe; score.bank = Math.max(score.bank, 16); });
await until(() => window.__cafe.game.tipShown === 'table', null, 20000);
await pause(2200);
const tagAt = await page.evaluate(() => { const t = window.__cafe.game.tags.find((x) => x.table === 7) ?? window.__cafe.game.tags[0]; return t.panel.mesh.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray(); });
await overview(900);
await rayPinch(tagAt, 1300, 1300);
await until(() => window.__cafe.game.phase === 'buying', null, 10000);
await pause(1800);
await rayPinch(await buttonAt('window.__cafe.game.menu.card', 'buy-yes'), 700, 700);
await until(() => window.__cafe.game.phase === 'run', null, 10000);
await pause(1500);
await rest();

// 4. Seat on, serving the level; a dirty table gets cleaned along the way.
for (let i = 0; i < 3; i++) {
  await until(() => window.__cafe.guests.line.some((g) => g.state === 'queued' && !g.walk), null, 60000);
  await seatOne(400);
  await rest();
  await pause(800);
}
await until(() => window.__cafe.mess.dirtyCount > 0, null, 60000);
{
  const t = await page.evaluate(() => window.__cafe.mess.dirtyTables()[0]);
  const at = await page.evaluate((t) => { const { system } = window.__cafe; const V = system.cafe.position.constructor; const p = new V(); system.tableTop(t, p); return system.cafe.localToWorld(p).toArray(); }, t);
  await h.head(P([at[0] + 0.2, at[1] + 0.18, at[2] + 0.16]), P([at[0], at[1], at[2] - 0.02]), 1200);
  await until((t) => !window.__cafe.mess.isDirty(t), t, 60000);
  await pause(800);
  await overview();
}

// 5. A level reached: the bar's banner, the confetti and the next goal; the café keeps going.
while ((await page.evaluate(() => window.__cafe.game.levelServed < window.__cafe.score.levelGoal && window.__cafe.game.phase === 'run'))) {
  const seated = await until(() => window.__cafe.guests.line.some((g) => g.state === 'queued' && !g.walk) || window.__cafe.game.phase !== 'run', null, 60000);
  if (!seated) break;
  if ((await page.evaluate(() => window.__cafe.game.phase)) !== 'run') break;
  await seatOne(300);
  await rest();
}
await until(() => window.__cafe.strip.banner !== null, null, 90000);
await pause(4000);
await rest();

// 6. Level 2: a hurried guest and its tip; the shop, the janitor hired.
await until(() => window.__cafe.guests.guests.some((g) => g.hurried && g.state === 'queued'), null, 120000);
await h.head(P(lineView), P(await toWorld([0.48, 0.05, 0.1])), 1200);
await pause(3500);
await seatOne(600);
await rest();
await overview();
await page.evaluate(() => { const { score } = window.__cafe; score.bank = Math.max(score.bank, 180); });
await until(() => window.__cafe.game.tipShown === 'shop' || window.__cafe.shop.affordable, null, 20000);
await pause(1500);
await rayPinch(await buttonAt('window.__cafe.strip.panel', 'bar-shop'), 1300, 1000);
await until(() => window.__cafe.game.menu.cardKind === 'shop' && window.__cafe.game.menu.card.open, null, 10000);
await pause(2500);
await rayPinch(await buttonAt('window.__cafe.game.menu.card', 'hire-janitor'), 800, 800);
await pause(1200);
await rayPinch(await buttonAt('window.__cafe.game.menu.card', 'shop-close'), 700, 600);
await until(() => window.__cafe.game.phase === 'run', null, 10000);
await rest();
await until(() => window.__cafe.baristas.janitor !== null, null, 60000);
// The janitor at work.
await page.evaluate(() => { const { mess, shop } = window.__cafe; const t = shop.tables.find((x) => x !== 2 && x !== 8) ?? 8; mess.soil(t); });
await until(() => window.__cafe.baristas.janitor?.state === 'cleaning', null, 60000);
{
  const at = await page.evaluate(() => { const j = window.__cafe.baristas.janitor.barista.root; return j.getWorldPosition(new j.position.constructor()).toArray(); });
  await h.head(P([at[0] + 0.02, at[1] + 0.16, at[2] + 0.2]), P([at[0], at[1] + 0.03, at[2]]), 1200);
  await pause(2800);
  await overview();
}

// 7. Two friends, then a storm-out, then Pause and Resume.
await page.evaluate(() => { const { guests } = window.__cafe; guests.forcePair = true; });
await until(() => window.__cafe.guests.guests.filter((g) => g.friend && g.state === 'queued').length >= 2, null, 120000);
await h.head(P(lineView), P(await toWorld([0.48, 0.05, 0.1])), 1200);
await pause(3000);
await seatOne(600);
await rest();
await seatOne(600);
await rest();
await overview();
await pause(2500);
await page.evaluate(() => {
  const { guests } = window.__cafe;
  const g = guests.guests.filter((x) => x.state === 'seated' && !x.served && x.fuming < 0).sort((a, b) => b.id - a.id)[0];
  if (g) g.patience = Math.min(g.patience, 1.5);
});
await pause(5500);
await rayPinch(await buttonAt('window.__cafe.strip.panel', 'bar-pause'), 1200, 900);
await until(() => window.__cafe.game.phase === 'paused', null, 10000);
await pause(2500);
await rayPinch(await buttonAt('window.__cafe.game.menu.card', 'resume'), 800, 700);
await until(() => window.__cafe.game.phase === 'run', null, 10000);
await rest();
await pause(3000);

const stats = await page.evaluate(() => {
  const { guests, score, baristas, game, shop } = window.__cafe;
  return { phase: game.phase, level: game.level, served: game.levelServed, takings: score.takings, bank: score.bank, tables: shop.tables.length, staff: baristas.staff.length, seated: guests.seated, stormedOff: guests.stormedOff, gaveUp: guests.gaveUp };
});
const errors = await h.finish();
addTheme('artifacts/levels.mp4');
console.log(JSON.stringify(stats));
console.log(errors.length ? `console errors:\n${errors.slice(0, 5).join('\n')}` : 'no console errors');
console.log('artifacts/levels.mp4');

/** The game's theme under the video, as the headset plays it: looped, in over four seconds, out at the end. */
function addTheme(video) {
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString());
  const mixed = video.replace(/\.mp4$/, '.music.mp4');
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', video, '-stream_loop', '-1', '-i', 'public/audio/theme.mp3',
    '-filter_complex', `[1:a]volume=0.1,afade=t=in:d=4,afade=t=out:st=${(seconds - 2.5).toFixed(2)}:d=2.5[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', seconds.toFixed(2), '-movflags', '+faststart', mixed,
  ]);
  renameSync(mixed, video);
}
