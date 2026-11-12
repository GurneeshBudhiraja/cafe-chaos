/**
 * The whole evening, recorded as the headset shows it (Quest 3 field of
 * view, no captions), in the real game with a fresh save (not test mode):
 * - the café pops up and the title card floats over it; How to play shows
 *   the rules, Back returns;
 * - Open the café starts the walkthrough (the first time): the guest at
 *   the gate is picked up and seated with the hand, the one server brings
 *   its tea, Next, and Open the café! starts the shift;
 * - the shift: the scoreboard comes up; guests are seated as they come;
 *   those seated quickly pay with a thumbs up and coins; one kept waiting
 *   for its food fumes and storms out (a thumbs down);
 * - with the money, the server plaque is pinched and a second server
 *   appears behind the counter and waves;
 * - closing time: the night's card.
 * The theme plays under it. (The café's own sounds play in the headset;
 * the emulator's recording has no way to capture them.)
 *
 * So it fits a short clip, guests eat for a few seconds instead of a
 * minute, and the clock is moved on to closing time at the end.
 *
 * Usage: dev server running, then `npm run record:game`.
 * Output: artifacts/game.mp4
 */

import { execFileSync } from 'node:child_process';
import { renameSync } from 'node:fs';

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const TABLE = { x: -1.3, y: 0.79, z: 0.28 };
const LAP = { left: [-0.7, 0.85, 0.42], right: [-0.7, 0.85, 0.14] };
const Q = { x: 0, y: 0, z: 0, w: 1 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
let pinchOffset = [0, 0, 0];
let openOffset = [0, 0, 0];
let page;

const h = await startHeadset({
  record: process.env.NORECORD ? null : 'game',
  maxSpeedUp: 30,
  async prepare(h) {
    page = h.page;
    await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z });
    await page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 60000 });
    for (const hand of ['left', 'right']) await handTo(hand, LAP[hand]);
    await frames(6);
    await pinch(1);
    await frames(3);
    pinchOffset = add(await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray()), LAP.right, -1);
    await pinch(0);
    await frames(3);
    openOffset = add(await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray()), LAP.right, -1);
    await page.evaluate((timeScale) => {
      const { system, guests } = window.__cafe;
      system.timeScale = timeScale;
      guests.spawnSeconds = [6, 8];
      guests.seatedSeconds = 9;
      system.replace();
    }, 1 / h.speedUp);
    await page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 60000 });
  },
});
const { pause } = h;

function send(m, p) {
  return page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
}
function frames(n) {
  return page.evaluate((n) => new Promise((resolve) => {
    const info = window.__cafe.world.renderer.info.render;
    const target = info.frame + n;
    const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8);
  }), n);
}
function handTo(hand, p) {
  return send('set_transform', { device: `hand-${hand}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
}
function pinch(value) {
  return send('set_select_value', { device: 'hand-right', value });
}
let handAt = null;
/** Move the right hand so its pinch point (the open hand's, with `open`) travels to `to` over `ms`, eased. */
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
const until = (predicate, arg) => page.waitForFunction(predicate, arg, { timeout: 30 * 60 * 1000, polling: 100 }).then((r) => r.jsonValue());
const HANG = 0.042 + 0.03;
const overview = () => h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z }, 1300);

/** World position of a button's centre on a card ('card' or 'coach'), a hair in front of it. */
const buttonAt = (panel, id) =>
  page.evaluate(([panel, id]) => {
    const p = window.__cafe.game[panel];
    const b = p.buttons.find((x) => x.id === id);
    const g = p.mesh.geometry.parameters;
    const V = p.mesh.position.constructor;
    return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, 0.004)).toArray();
  }, [panel, id]);
/** Reach for a button (it lights), pinch it, and let go. */
async function press(panel, id) {
  const at = await buttonAt(panel, id);
  await reach(1100, add(at, [0.01, 0.02, 0.03]), true);
  await reach(400, at);
  await pause(500);
  await pinch(1);
  await pause(300);
  await pinch(0);
  await pause(200);
}
/** Pinch up the guest at the head of the line; returns it. */
async function pickHead() {
  for (;;) {
    const guest = await until(() => {
      const { guests, system } = window.__cafe;
      const V = system.cafe.position.constructor;
      const g = guests.line.find((x) => x.state === 'queued' && !x.walk && x.patience > 3.5);
      return g ? { id: g.id, grip: g.actor.grip.getWorldPosition(new V()).toArray() } : null;
    });
    await reach(1000, add(guest.grip, [0.02, 0.06, 0.04]));
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
}
/** Carry the held guest to the free seat nearest (x, z) and let go. */
async function seatAt(x, z, linger = 500) {
  const seat = await page.evaluate(([x, z]) => {
    const { guests, system } = window.__cafe;
    const free = guests.seats.filter((s) => s.occupant === 0);
    const s = free.reduce((best, s) => (Math.hypot(s.position.x - x, s.position.z - z) < Math.hypot(best.position.x - x, best.position.z - z) ? s : best));
    return { index: s.index, at: system.cafe.localToWorld(s.position.clone()).toArray() };
  }, [x, z]);
  await reach(1300, add(seat.at, [0, HANG + 0.05, 0]));
  await reach(400, add(seat.at, [0, HANG, 0]));
  await pause(linger);
  await pinch(0);
  await pause(500);
  return seat;
}

// 1. Seated: the café pops up, the title card over it.
await until(() => window.__cafe.game.phase === 'title');
await pause(3500);

// 2. How to play, then Back.
await press('card', 'rules');
await pause(5500);
await press('card', 'back');
await pause(1500);

// 3. Open the café: the walkthrough, the first time.
await press('card', 'open');
await rest();
await pause(3000);
// Step 1: the guest at the gate, picked up. Step 2: seated.
const lineView = await toWorld([0.4, 0.2, 0.34]);
await h.head(P(lineView), P(await toWorld([0.48, 0.04, 0.1])), 1600);
await until(() => window.__cafe.guests.line.some((g) => g.state === 'queued' && !g.walk));
await pause(1000);
await pickHead();
await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z }, 1100);
await pause(1500);
await seatAt(0.167, 0.025, 800);
await rest();
// Step 3: the dial runs until the server brings the tea.
await pause(2500);
await until(() => window.__cafe.game.step >= 3);
await pause(2500);
// Step 4, Next; step 5, Open the café!
await press('coach', 'next');
await pause(3500);
await press('coach', 'start');
await rest();

// 4. The shift: guests seated as they come; quick ones pay with a thumbs up and coins.
const spots = [[0.05, 0.025], [-0.12, 0.025], [0.05, -0.15], [-0.2, -0.15], [0.25, -0.15]];
for (const [x, z] of spots.slice(0, 3)) {
  await pickHead();
  await seatAt(x, z);
  await rest();
  await pause(800);
}
console.error('three seated', JSON.stringify(await page.evaluate(() => ({ bank: window.__cafe.score.bank, log: window.__cafe.score.log, phase: window.__cafe.game.phase, running: window.__cafe.score.running }))));
// One kept waiting for its food loses its temper and storms out (its patience run down, so it shows here).
await until(() => window.__cafe.guests.guests.some((g) => g.state === 'seated' && !g.served && g.fuming < 0 && g.seatedFor > 2));
await page.evaluate(() => {
  const { guests } = window.__cafe;
  const g = guests.guests.filter((x) => x.state === 'seated' && !x.served && x.fuming < 0).sort((a, b) => b.id - a.id)[0];
  if (g) g.patience = Math.min(g.patience, 2.5);
});
await pause(6000);
for (const [x, z] of spots.slice(3)) {
  await pickHead();
  await seatAt(x, z);
  await rest();
  await pause(800);
}
await pause(6000);

// 5. The shop: with the coins in, hire a second server.
// If the coins are not in yet (guests who gave up cost some), seat a few more until they are.
for (let more = 0; more < 8 && (await page.evaluate(() => window.__cafe.score.bank)) < 40; more++) {
  await overview();
  await pickHead();
  await seatAt(spots[more % spots.length][0], spots[more % spots.length][1]);
  await rest();
  await pause(9000);
}
console.error('before the shop', JSON.stringify(await page.evaluate(() => ({ bank: window.__cafe.score.bank, staff: window.__cafe.baristas.staff.length, log: window.__cafe.score.log, gaveUp: window.__cafe.guests.gaveUp, stormedOff: window.__cafe.guests.stormedOff }))));
{
  const grip = await page.evaluate(() => window.__cafe.unlocks.plaques.get('server2').grip.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
  await h.head(P(add(grip, [0.12, 0.17, 0.12])), P(grip), 1400);
  await reach(1200, add(grip, [0.01, 0.03, 0.02]), true);
  await pause(1500);
  // Pinch the plaque; if the pinch missed it (or the coins were short), lift the hand and try again.
  for (let attempt = 0; attempt < 4 && (await page.evaluate(() => !window.__cafe.unlocks.owned.has('server2'))); attempt++) {
    await reach(400, grip);
    await pause(150);
    await pinch(1);
    await pause(500);
    await pinch(0);
    await pause(400);
    console.error('shop attempt', attempt, JSON.stringify(await page.evaluate(() => ({ bank: window.__cafe.score.bank, owned: [...window.__cafe.unlocks.owned], refused: window.__cafe.unlocks.refused }))));
    if (await page.evaluate(() => !window.__cafe.unlocks.owned.has('server2'))) await reach(500, add(grip, [0.01, 0.03, 0.02]), true);
  }
  await rest();
  await h.head(SEAT, P(await toWorld([0, 0.08, -0.16])), 1500);
  await page.waitForFunction(() => window.__cafe.baristas.staff.length >= 2, null, { timeout: 5 * 60 * 1000, polling: 100 }).catch(() => console.error('no second server'));
  await pause(4000);
}

// 6. Keep going a little, then closing time.
await overview();
await pickHead();
await seatAt(0.25, 0.025);
await rest();
await pause(6000);
await page.evaluate(() => (window.__cafe.game.clock = Math.min(window.__cafe.game.clock, 4)));
await until(() => window.__cafe.game.phase === 'closed');
await pause(6000);

const stats = await page.evaluate(() => {
  const { guests, score, baristas, game } = window.__cafe;
  return { phase: game.phase, takings: score.takings, bank: score.bank, up: score.up, down: score.down, staff: baristas.staff.length, seated: guests.seated, stormedOff: guests.stormedOff, gaveUp: guests.gaveUp };
});
const errors = await h.finish();
addTheme('artifacts/game.mp4');
console.log(JSON.stringify(stats));
console.log(errors.length ? `console errors:\n${errors.slice(0, 5).join('\n')}` : 'no console errors');
console.log('artifacts/game.mp4');

/** Put the game's theme under the video, as the headset plays it: looped, coming in over four seconds, fading out at the end. */
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
