/**
 * A short video of pausing, from the seat: the café busy, a fingertip on
 * the round pause button beside the pill, the café dimming and the pause
 * card coming up, then Resume pressed: 3, 2, 1 with the café still frozen,
 * and the café moving again as the lamps come back up.
 * Usage: dev server running, then `node scripts/record-pause.mjs`.
 * Output: artifacts/pause.mp4.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const AWAY = [-0.3, 0.4, 0.9];
const h = await startHeadset({
  record: 'pause',
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
    await h.page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); });
    await h.page.evaluate((a) => { for (const k of ['left', 'right']) window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: k === 'left' ? { x: -1.4, y: 0.4, z: 0.9 } : { x: a[0], y: a[1], z: a[2] }, orientation: { x: 0, y: 0, z: 0, w: 1 } }); }, AWAY);
    // Let a few guests come in first.
    await h.page.waitForFunction(() => window.__cafe.guests.guests.length >= 3, null, { timeout: 120000 }).catch(() => {});
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const handTo = (p) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
const tipOff = (await page.evaluate(() => window.__cafe.hold.tip.right.point.toArray())).map((v, i) => v - AWAY[i]);
/** A point `out` metres in front of a button's centre on a panel. */
const at = (panel, id, out) => page.evaluate(([panel, id, out]) => {
  const p = window.__cafe.game[panel];
  const b = p.buttons.find((x) => x.id === id);
  const g = p.mesh.geometry.parameters;
  const V = p.mesh.position.constructor;
  const s = p.mesh.getWorldScale(new V()).z;
  return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, out / s)).toArray();
}, [panel, id, out]);
/** The fingertip comes in from the rest spot, pushes through the button, and goes back. */
async function press(panel, id) {
  // Where to go, worked out before the press: the card changes once it is pressed.
  const [near, through] = (await Promise.all([at(panel, id, 0.05), at(panel, id, -0.004)])).map((p) => p.map((v, i) => v - tipOff[i]));
  for (let i = 1; i <= 6; i++) { await handTo(AWAY.map((v, k) => v + (near[k] - v) * (i / 6))); await h.pause(110); }
  await h.pause(300);
  await handTo(through);
  await h.pause(350);
  await handTo(near);
  await h.pause(250);
  for (let i = 1; i <= 5; i++) { await handTo(near.map((v, k) => v + (AWAY[k] - v) * (i / 5))); await h.pause(110); }
}

await h.pause(2500);
// Pause: the button beside the pill.
await press('tab', 'tab');
await h.pause(3500);
// Resume on the card: 3, 2, 1.
await press('card', 'resume');
await page.waitForFunction(() => window.__cafe.game.phase === 'run', null, { timeout: 120000 });
await h.pause(4000);
const errors = await h.finish();
console.log(errors.length ? `errors: ${errors.slice(0, 3).join(' | ')}` : 'clean');
