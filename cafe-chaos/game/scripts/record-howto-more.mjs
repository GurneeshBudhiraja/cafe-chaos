/**
 * The How to play videos for the mechanics added with the levels
 * (game/how-to-play.ts), recorded from the game the way record-howto.mjs
 * records the first four, then cut into short silent 16:9 loops with a
 * still from each:
 * - tables: a locked table; the hand points at its padlock (the tag opens
 *   into the price), pinches, and BUY: the table opens;
 * - clean: a table left dirty; a barista walks over and wipes it; the mess
 *   goes;
 * - guests (a still): a guest in a hurry (the hourglass) and two friends
 *   (the hearts) waiting at the gate.
 * Cream model hands (`?hands=cream`), the emulator's grey room hidden.
 *
 * Usage: dev server running, then `node scripts/record-howto-more.mjs`.
 * Output: public/howto/tables.mp4, clean.mp4; public/ui/howto-tables.jpg,
 * howto-clean.jpg, howto-guests.jpg (and artifacts/howto-more.mp4).
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
const h = await startHeadset({
  size: { width: 1280, height: 720 },
  fovDeg: 62,
  record: 'howto-more',
  maxSpeedUp: 6,
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => { localStorage.removeItem('cafe-chaos/save/v3'); window.__cafe.system.replace(); });
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title' && window.__cafe.mood.lampsUp > 0.99, null, { timeout: 60000 });
    await h.page.evaluate((r) => {
      for (const c of document.querySelectorAll('canvas')) if (getComputedStyle(c).zIndex === '1') c.style.visibility = 'hidden';
      document.body.style.background = '#241d19';
      const { game, guests } = window.__cafe;
      for (const c of guests.cards.cards) c.mesh.layers.set(7);
      for (const k of ['left', 'right']) window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: k === 'left' ? { x: -1.4, y: 0.4, z: 0.9 } : { x: r[0], y: r[1], z: r[2] }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
      // No tips in the videos (they would cover what is shown).
      game.save.tips = ['table', 'shop', 'dirty', 'hurry', 'pair'];
      game.click('open');
    }, REST);
    await h.page.waitForFunction(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving, null, { timeout: 60000 });
    await h.page.evaluate(() => window.__cafe.game.click('skip'));
    await h.page.waitForFunction(() => window.__cafe.game.phase === 'run', null, { timeout: 60000 });
    await h.page.evaluate(() => { const { guests } = window.__cafe; guests.arrivals = false; guests.patienceFrozen = true; guests.clear(); });
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const handTo = (p, q = Q) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: q });
const pinch = (v) => send('set_select_value', { device: 'hand-right', value: v });
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
const now = async () => ((await page.evaluate(() => performance.now() / 1000)) - h.pageOrigin) / h.speedUp;
const marks = {};
/** A quaternion turning the hand's forward (-Z) toward `n`. */
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
const cafeAt = await page.evaluate(() => window.__cafe.system.cafe.position.toArray());

// 1. Open more tables: point at a padlock, pinch, BUY.
await page.evaluate(() => { window.__cafe.score.bank = 30; });
const tagAt = await page.evaluate(() => { const t = window.__cafe.game.tags.find((x) => x.table === 7) ?? window.__cafe.game.tags[0]; window.__tagTable = t.table; return t.panel.mesh.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray(); });
await h.head(SEAT, P(lerp(cafeAt, tagAt, 0.7)), 400);
await h.pause(500);
marks.tables = await now();
await h.pause(700);
const FROM = [-1.08, 0.98, 0.16];
const aim = aimQ(FROM, tagAt);
for (let i = 1; i <= 14; i++) { await handTo(lerp(REST, FROM, ease(i / 14)), slerpish(Q, aim, ease(i / 14))); await h.pause(90); }
await h.pause(1400);
await pinch(1);
await h.pause(250);
await pinch(0);
await h.pause(1500);
// BUY on the card (pointed at and pinched as well).
const buyAt = await page.evaluate(() => {
  const p = window.__cafe.game.menu.card;
  const b = p.buttons.find((x) => x.id === 'buy-yes');
  const g = p.mesh.geometry.parameters;
  const V = p.mesh.position.constructor;
  p.mesh.updateWorldMatrix(true, false);
  return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, 0)).toArray();
});
const aim2 = aimQ(FROM, buyAt);
for (let i = 1; i <= 8; i++) { await handTo(FROM, slerpish(aim, aim2, ease(i / 8))); await h.pause(90); }
await h.pause(900);
await pinch(1);
await h.pause(250);
await pinch(0);
await h.pause(1800);
marks.tablesEnd = await now();
await handTo(REST);
await h.pause(300);

// 2. Dirty tables: a table left dirty; a barista walks over and wipes it.
await page.evaluate(() => { const { mess, game } = window.__cafe; mess.soil(8); });
const dirtyAt = await page.evaluate(() => { const { system } = window.__cafe; const V = system.cafe.position.constructor; const p = new V(); system.tableTop(8, p); return system.cafe.localToWorld(p).toArray(); });
await h.head(P([dirtyAt[0] + 0.24, dirtyAt[1] + 0.2, dirtyAt[2] + 0.18]), P([dirtyAt[0] - 0.01, dirtyAt[1], dirtyAt[2] - 0.03]), 400);
await h.pause(400);
marks.clean = await now();
await page.waitForFunction(() => !window.__cafe.mess.isDirty(8), null, { timeout: 120000, polling: 100 });
await h.pause(1200);
marks.cleanEnd = await now();

// 3. Special guests (a still): one in a hurry, two friends, waiting at the gate.
await page.evaluate(() => {
  const { guests } = window.__cafe;
  guests.level = 6;
  guests.queueCap = 4;
  guests.hurryIn(1);
  guests.spawn();
  const a = guests.spawn();
  const b = guests.spawn();
  guests.pair(a, b);
});
await page.waitForFunction(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 3, null, { timeout: 120000 });
const lineAt = await page.evaluate(() => { const { guests, system } = window.__cafe; const g = guests.line[1]; return g.actor.root.getWorldPosition(new system.cafe.position.constructor()).toArray(); });
await h.head(P([lineAt[0] + 0.13, lineAt[1] + 0.1, lineAt[2] + 0.08]), P([lineAt[0] - 0.01, lineAt[1] + 0.07, lineAt[2]]), 300);
await h.pause(1200);
marks.guests = await now();
await h.pause(400);

const errors = await h.finish();
console.log(errors.length ? `errors: ${errors.slice(0, 3).join(' | ')}` : 'no console errors');
console.log(JSON.stringify(marks));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
for (const id of ['tables', 'clean']) {
  const from = marks[id];
  const to = marks[`${id}End`];
  ff(['-ss', from.toFixed(2), '-t', (to - from).toFixed(2), '-i', 'artifacts/howto-more.mp4', '-an', '-vf', 'scale=640:360,fps=24', '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '27', '-movflags', '+faststart', `public/howto/${id}.mp4`]);
  // The still: a frame two thirds of the way in.
  ff(['-ss', (from + (to - from) * 0.66).toFixed(2), '-i', 'artifacts/howto-more.mp4', '-frames:v', '1', '-vf', 'scale=960:540', '-q:v', '4', `public/ui/howto-${id}.jpg`]);
  console.log(`public/howto/${id}.mp4: ${(to - from).toFixed(1)} s`);
}
ff(['-ss', marks.guests.toFixed(2), '-i', 'artifacts/howto-more.mp4', '-frames:v', '1', '-vf', 'scale=960:540', '-q:v', '4', 'public/ui/howto-guests.jpg']);
console.log('public/ui/howto-guests.jpg');
process.exit(0);
