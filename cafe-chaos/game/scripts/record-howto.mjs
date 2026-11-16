/**
 * The videos for How to play (game/how-to-play.ts), recorded from the game
 * itself in one session, then cut into short, silent 16:9 loops:
 * - pinch: the hand comes over the first guest at the gate (it glows) and
 *   pinches it up;
 * - seat: the guest carried over the café, let go over a seat that glows;
 *   it hops in;
 * - happy: the café and the bar above it; coins come in, the meter fills;
 * - bar: the hand comes up, points at the bar (the ray lights Pause), and
 *   pinches: the pause card comes up.
 * The cream model hands are drawn (`?hands=cream`), since the player's real
 * hands cannot be filmed; the emulator's grey room is hidden.
 *
 * Usage: dev server running, then `node scripts/record-howto.mjs`.
 * Output: public/howto/pinch.mp4, seat.mp4, happy.mp4, bar.mp4 (and the
 * whole take in artifacts/howto.mp4).
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

process.env.APP_URL = `${process.env.APP_URL_GAME ?? 'https://localhost:8082/'}?hands=cream`;
const { startHeadset } = await import('./lib/headset.mjs');
mkdirSync('public/howto', { recursive: true });

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const REST = [-0.62, 0.62, 0.62];
const Q = { x: 0, y: 0, z: 0, w: 1 };
/** 16:9 frames, a little closer than the headset's own view. */
const h = await startHeadset({
  size: { width: 1280, height: 720 },
  fovDeg: 62,
  record: 'howto',
  maxSpeedUp: 6,
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title' && window.__cafe.mood.lampsUp > 0.99, null, { timeout: 60000 });
    await h.page.evaluate((r) => {
      for (const c of document.querySelectorAll('canvas')) if (getComputedStyle(c).zIndex === '1') c.style.visibility = 'hidden';
      document.body.style.background = '#241d19';
      const { game, guests } = window.__cafe;
      for (const c of guests.cards.cards) c.mesh.layers.set(7);
      for (const k of ['left', 'right']) window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: k === 'left' ? { x: -1.4, y: 0.4, z: 0.9 } : { x: r[0], y: r[1], z: r[2] }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
      game.click('open');
      guests.spawnSeconds = [0.4, 0.8];
      guests.spawnPace = 1;
      guests.patienceFrozen = true;
    }, REST);
    await h.page.waitForFunction(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving, null, { timeout: 60000 });
    await h.page.evaluate(() => window.__cafe.game.click('skip'));
    await h.page.waitForFunction(() => window.__cafe.game.phase === 'run', null, { timeout: 60000 });
    await h.page.evaluate(() => (window.__cafe.guests.patienceFrozen = true));
    await h.page.waitForFunction(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 3, null, { timeout: 180000 });
    await h.page.evaluate(() => {
      window.__cafe.guests.arrivals = false;
      window.__cafe.strip.panel.show(false);
    });
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const handTo = (p, q = Q) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: q });
const pinch = (v) => send('set_select_value', { device: 'hand-right', value: v });
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const add = (a, b) => a.map((v, i) => v + b[i]);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
/** Where we are in the finished video (seconds). */
const now = async () => ((await page.evaluate(() => performance.now() / 1000)) - h.pageOrigin) / h.speedUp;
const marks = {};

// The pinch point's offset from the hand, open and closed (so the pinch lands where it is aimed).
await handTo(REST);
await frames(3);
const open = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - REST[i]);
await pinch(1);
await frames(3);
const closed = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - REST[i]);
await pinch(0);
await frames(3);
/** Move the pinch point from `a` to `b` (world) over `ms` of video time, in small steps. */
async function glide(a, b, ms, isOpen) {
  const off = isOpen ? open : closed;
  const n = Math.max(6, Math.round(ms / 70));
  for (let i = 1; i <= n; i++) {
    await handTo(lerp(a, b, ease(i / n)).map((v, k) => v - off[k]));
    await h.pause(ms / n);
  }
}

// 1. Pinch: the hand comes over the first guest at the gate, which glows, and pinches it up.
const guest = await page.evaluate(() => { const { guests, system } = window.__cafe; const g = guests.line[0]; return g.actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray(); });
await h.head(P(add(guest, [0.3, 0.22, 0.1])), P(add(guest, [-0.02, 0, 0])), 300);
const startAt = add(guest, [0.1, 0.12, 0.06]);
await handTo(startAt.map((v, k) => v - open[k]));
await h.pause(400);
marks.pinch = await now();
await h.pause(500);
await glide(startAt, add(guest, [0.004, 0.025, 0]), 1300, true);
await h.pause(700);
await glide(add(guest, [0.004, 0.025, 0]), guest, 300, true);
await pinch(1);
await h.pause(500);
await glide(guest, add(guest, [0, 0.07, 0]), 900, false);
await h.pause(800);
marks.pinchEnd = await now();

// 2. Seat: carried over the café to a free seat, which glows; let go, and it hops in.
const seat = await page.evaluate(() => {
  const { guests, system } = window.__cafe;
  const free = guests.seats.filter((s) => s.occupant === 0);
  const s = free.reduce((best, s) => (Math.hypot(s.position.x - 0.1, s.position.z - 0.04) < Math.hypot(best.position.x - 0.1, best.position.z - 0.04) ? s : best));
  return system.cafe.localToWorld(s.position.clone()).toArray();
});
const lifted = add(guest, [0, 0.07, 0]);
const over = add(seat, [0, 0.09, 0]);
marks.seat = await now();
await h.head(P(add(lerp(guest, seat, 0.5), [0.36, 0.26, 0.08])), P(lerp(guest, seat, 0.55)), 900);
await glide(lifted, over, 1800, false);
await h.pause(700);
await pinch(0);
await h.pause(1800);
marks.seatEnd = await now();
await handTo(REST);

// 3. Keep guests happy: the café and the bar over it; coins come in and the meter fills.
await page.evaluate(() => {
  const { strip, score } = window.__cafe;
  score.happiness = 50;
  score.bank = 30;
  strip.settle();
  strip.panel.show(true);
});
const barAt = await page.evaluate(() => window.__cafe.strip.panel.mesh.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
const cafeAt = await page.evaluate(() => window.__cafe.system.cafe.position.toArray());
await h.head(SEAT, P(lerp(cafeAt, barAt, 0.55)), 600);
await h.pause(600);
marks.happy = await now();
await h.pause(900);
for (const [bank, happy] of [[42, 60], [55, 70], [70, 82]]) {
  await page.evaluate(([b, hp]) => { window.__cafe.score.bank = b; window.__cafe.score.happiness = hp; }, [bank, happy]);
  await h.pause(1300);
}
await h.pause(600);
marks.happyEnd = await now();

// 4. The bar: the hand comes up and points at it (the ray lights Pause), then pinches: the pause card.
const pauseAt = await page.evaluate(() => {
  const p = window.__cafe.strip.panel;
  const b = p.buttons.find((x) => x.id === 'bar-pause');
  const g = p.mesh.geometry.parameters;
  const V = p.mesh.position.constructor;
  return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, 0)).toArray();
});
const FROM = [-1.1, 1.0, 0.12];
const d = pauseAt.map((v, i) => v - FROM[i]);
const len = Math.hypot(...d);
const n = d.map((v) => v / len);
const c = [n[1], -n[0], 0];
const w = 1 - n[2];
const ql = Math.hypot(c[0], c[1], c[2], w);
const aim = { x: c[0] / ql, y: c[1] / ql, z: c[2] / ql, w: w / ql };
const slerpish = (a, b, t) => { const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t }; const l = Math.hypot(q.x, q.y, q.z, q.w); return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }; };
await h.head(SEAT, P(lerp(cafeAt, barAt, 0.75)), 500);
marks.bar = await now();
await h.pause(500);
for (let i = 1; i <= 12; i++) { await handTo(lerp(REST, FROM, ease(i / 12)), slerpish(Q, aim, ease(i / 12))); await h.pause(90); }
await h.pause(1300);
await pinch(1);
await h.pause(250);
await pinch(0);
await h.pause(2200);
marks.barEnd = await now();

const errors = await h.finish();
console.log(errors.length ? `errors: ${errors.slice(0, 3).join(' | ')}` : 'no console errors');
console.log(JSON.stringify(marks));
for (const id of ['pinch', 'seat', 'happy', 'bar']) {
  const from = marks[id];
  const to = marks[`${id}End`];
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-ss', from.toFixed(2), '-t', (to - from).toFixed(2), '-i', 'artifacts/howto.mp4', '-an',
    '-vf', 'scale=640:360,fps=24', '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '27', '-movflags', '+faststart',
    `public/howto/${id}.mp4`,
  ]);
  console.log(`public/howto/${id}.mp4: ${(to - from).toFixed(1)} s`);
}
process.exit(0);
