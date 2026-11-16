/**
 * A short video of the bar, from the seat: the café busy; the right hand
 * comes up and points at the bar, the ray lights Pause, a pinch pauses
 * (the café dims, the pause card comes up in front); RESUME pressed with
 * a fingertip: 3, 2, 1; then the hand points at Shop and pinches: the
 * shop, HIRE pressed, CLOSE, and the count back into the evening.
 * Usage: dev server running, then `node scripts/record-bar.mjs`.
 * Output: artifacts/bar.mp4.
 */

process.env.APP_URL = `${process.env.APP_URL_GAME ?? 'https://localhost:8082/'}?hands=cream`;
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.86, z: 0.28 };
const REST = [-0.6, 0.55, 0.7];
const POINT_FROM = [-1.1, 1.0, 0.12];
const Q = { x: 0, y: 0, z: 0, w: 1 };
const h = await startHeadset({
  record: 'bar',
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
    await h.page.evaluate(() => window.__cafe.game.click('open'));
    await h.page.waitForFunction(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving, null, { timeout: 60000 });
    await h.page.evaluate(() => window.__cafe.game.click('skip'));
    await h.page.waitForFunction(() => window.__cafe.game.phase === 'run', null, { timeout: 60000 });
    await h.page.evaluate((r) => {
      for (const k of ['left', 'right']) window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: k === 'left' ? { x: -1.4, y: 0.4, z: 0.9 } : { x: r[0], y: r[1], z: r[2] }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
      const { score, guests } = window.__cafe;
      score.bank = 75;
      guests.spawnSeconds = [1, 2];
    }, REST);
    await h.page.waitForFunction(() => window.__cafe.guests.guests.length >= 3, null, { timeout: 120000 }).catch(() => {});
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const handTo = (p, q = Q) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: q });
const pinch = (v) => send('set_select_value', { device: 'hand-right', value: v });
const tipOff = (await page.evaluate(() => window.__cafe.hold.tip.right.point.toArray())).map((v, i) => v - REST[i]);
/** A point `out` metres in front of a button's centre on a panel ('bar' or 'menu'). */
const at = (panel, id, out) => page.evaluate(([panel, id, out]) => {
  const p = panel === 'bar' ? window.__cafe.strip.panel : window.__cafe.game.menu.card;
  const b = p.buttons.find((x) => x.id === id);
  const g = p.mesh.geometry.parameters;
  const V = p.mesh.position.constructor;
  const s = p.mesh.getWorldScale(new V()).z;
  return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, out / s)).toArray();
}, [panel, id, out]);
/** The hand's turn that points its ray (-Z) from `from` at `to`. */
const aim = (from, to) => {
  const d = to.map((v, i) => v - from[i]);
  const len = Math.hypot(...d);
  const n = d.map((v) => v / len);
  const c = [n[1], -n[0], 0];
  const w = 1 - n[2];
  const l = Math.hypot(c[0], c[1], c[2], w);
  return { x: c[0] / l, y: c[1] / l, z: c[2] / l, w: w / l };
};
const slerpish = (a, b, t) => {
  const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t };
  const l = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
};
/** Raise the hand from rest and point it at a bar button, pinch, and lower it again. */
async function pointAndPinch(id) {
  const target = await at('bar', id, 0);
  const q = aim(POINT_FROM, target);
  for (let i = 1; i <= 8; i++) { await handTo(REST.map((v, k) => v + (POINT_FROM[k] - v) * (i / 8)), slerpish(Q, q, i / 8)); await h.pause(90); }
  await h.pause(700);
  await pinch(1);
  await h.pause(250);
  await pinch(0);
  await h.pause(500);
  for (let i = 1; i <= 6; i++) { await handTo(POINT_FROM.map((v, k) => v + (REST[k] - v) * (i / 6)), slerpish(q, Q, i / 6)); await h.pause(90); }
}
/** The fingertip comes in from rest, pushes through a card button, and goes back. */
async function poke(id) {
  const [near, through] = (await Promise.all([at('menu', id, 0.05), at('menu', id, -0.004)])).map((p) => p.map((v, i) => v - tipOff[i]));
  for (let i = 1; i <= 6; i++) { await handTo(REST.map((v, k) => v + (near[k] - v) * (i / 6))); await h.pause(100); }
  await h.pause(300);
  await handTo(through);
  await h.pause(350);
  await handTo(near);
  await h.pause(250);
  for (let i = 1; i <= 5; i++) { await handTo(near.map((v, k) => v + (REST[k] - v) * (i / 5))); await h.pause(100); }
}

await h.pause(2000);
await pointAndPinch('bar-pause');
await h.pause(2500);
await poke('resume');
await page.waitForFunction(() => window.__cafe.game.phase === 'run', null, { timeout: 120000 });
await h.pause(2000);
await pointAndPinch('bar-shop');
await h.pause(1800);
await poke('hire');
await h.pause(1500);
await poke('shop-close');
await page.waitForFunction(() => window.__cafe.game.phase === 'run', null, { timeout: 120000 });
await h.pause(2500);
const errors = await h.finish();
console.log(errors.length ? `errors: ${errors.slice(0, 3).join(' | ')}` : 'clean');
