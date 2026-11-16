/**
 * The whole game, recorded as the headset shows it (Quest 3 field of
 * view, no captions), in the real game with a fresh save (not test mode):
 * - the café pops up with the title card and the side board; a fingertip
 *   on How to play shows the three pictures, Got it returns;
 * - Open the café starts the first run: the guest at the gate is pinched
 *   up and seated, the server brings its tea, and the café opens at 0:00;
 * - the run: guests with wishes come. A hand over one brings up its card;
 *   carried, the seats that grant its wish show mint; seated there it
 *   gets a heart. One is seated against its wish (a shrug); one kept
 *   waiting for its food fumes and storms out;
 * - with the coins, a fingertip on Hire brings a second server, who waves;
 * - Pause, Resume; then the café's happiness runs out and it closes: the
 *   card with how long it stayed open.
 * The theme plays under it. (The café's own sounds play in the headset;
 * the emulator's recording has no way to capture them.)
 *
 * So it fits a short clip, guests eat for a few seconds, every guest has
 * a wish, and the happiness is run down at the end.
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
      guests.spawnSeconds = [5, 7];
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

/** The index fingertip sits at a fixed offset from the emulated hand (measured in `measureTip`). */
let tipOffset = [0, 0, 0];
async function measureTip() {
  const at = add(LAP.right, [0, 0, 0]);
  await handTo('right', at);
  await frames(3);
  tipOffset = add(await page.evaluate(() => window.__cafe.hold.tip.right.point.toArray()), at, -1);
}
const panelOf = (name) => (name === 'board' ? 'window.__cafe.board.panel' : `window.__cafe.game.${name}`);
/** A point `out` metres in front of a button on a card ('card', 'how', 'coach') or the side board ('board'). */
const buttonAt = (panel, id, out) =>
  page.evaluate(([panel, id, out]) => {
    const p = panel === 'board' ? window.__cafe.board.panel : window.__cafe.game[panel];
    const b = p.buttons.find((x) => x.id === id);
    const g = p.mesh.geometry.parameters;
    const V = p.mesh.position.constructor;
    const s = p.mesh.getWorldScale(new V()).z;
    return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, out / s)).toArray();
  }, [panel, id, out]);
/** Move the right hand so its index fingertip travels to `to` over `ms`, eased. */
async function touchTo(ms, to) {
  const from = handAt ?? LAP.right;
  const goal = add(to, tipOffset, -1);
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
/** Bring the fingertip to a button (it lights), push it through, and draw back. */
async function press(panel, id) {
  await touchTo(1200, await buttonAt(panel, id, 0.045));
  await pause(450);
  await touchTo(260, await buttonAt(panel, id, -0.005));
  await pause(220);
  await touchTo(300, await buttonAt(panel, id, 0.05));
  await pause(150);
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

/** The seat a carried guest should go to: one that grants its wish if any is free (`grant`), else one that does not. */
const seatFor = (grant) => page.evaluate((grant) => {
  const { guests, system } = window.__cafe;
  const g = guests.carriedBy('right');
  const free = guests.seats.filter((s) => s.occupant === 0);
  const fits = free.filter((s) => guests.wouldGrant(g, s) === grant);
  const from = fits.length ? fits : free;
  // The nearest to the middle of the room, so it is in view.
  const s = from.reduce((best, s) => (Math.hypot(s.position.x, s.position.z + 0.03) < Math.hypot(best.position.x, best.position.z + 0.03) ? s : best));
  return system.cafe.localToWorld(s.position.clone()).toArray();
}, grant);
/** Carry the held guest over a seat (`at`, world) and let go. */
async function drop(at, linger = 700) {
  await reach(1400, add(at, [0, HANG + 0.05, 0]));
  await reach(400, add(at, [0, HANG, 0]));
  await pause(linger);
  await pinch(0);
  await pause(600);
}
// Every guest in the recording has a wish (the game sets the share each frame: hold it here), and they eat quickly.
const pacer = setInterval(() => page.evaluate(() => { const g = window.__cafe.guests; if (window.__cafe.game.phase === 'run') { g.spawnPace = 1.4; g.mealSeconds = 6; } }).catch(() => {}), 120);

await measureTip();
// 1. Seated: the café pops up, the title card over it, the side board beside it.
await until(() => window.__cafe.game.phase === 'title');
await pause(3500);

// 2. How to play: three pictures. Got it.
await press('card', 'rules');
await rest();
await pause(6000);
await press('how', 'back');
await rest();
await pause(1200);

// 3. Open the café: the first run.
await press('card', 'open');
await rest();
await pause(2500);
const lineView = await toWorld([0.4, 0.2, 0.34]);
await h.head(P(lineView), P(await toWorld([0.48, 0.04, 0.1])), 1600);
await until(() => window.__cafe.guests.line.some((g) => g.state === 'queued' && !g.walk));
await pause(1200);
await pickHead();
await overview();
await pause(1200);
await seatAt(0.04, 0.03, 800);
await rest();
// The server brings the tea; the café opens.
await until(() => window.__cafe.game.phase === 'run');
await pause(2500);

// 4. The run. A guest with a wish: the hand over it brings up its card; carried, the seats that grant it are mint.
await h.head(P(lineView), P(await toWorld([0.5, 0.05, 0.12])), 1500);
await until(() => window.__cafe.guests.line.some((g) => g.state === 'queued' && !g.walk && g.wishes.length > 1));
{
  const grip = await page.evaluate(() => { const { guests, system } = window.__cafe; const g = guests.line.find((x) => x.state === 'queued' && !x.walk); return g.actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray(); });
  await reach(1200, add(grip, [0.012, 0.035, 0.005]), true);
  await pause(2600);
}
await pickHead();
await overview();
await pause(2200);
await drop(await seatFor(true), 1100);
await rest();
await pause(2200);
// Another, granted too.
await pickHead();
await pause(900);
await drop(await seatFor(true));
await rest();
await pause(1500);
// One seated against its wish: a shrug.
await pickHead();
await pause(600);
await drop(await seatFor(false));
await rest();
await pause(2500);
// One kept waiting for its food loses its temper and storms out (its patience run down, so it shows here).
await pickHead();
await drop(await seatFor(true));
await rest();
await page.evaluate(() => {
  const { guests } = window.__cafe;
  const g = guests.guests.filter((x) => x.state === 'seated' && !x.served && x.fuming < 0).sort((a, b) => b.id - a.id)[0];
  if (g) g.patience = Math.min(g.patience, 2.5);
});
await pause(6500);

// 5. The side board: with the coins in, a fingertip on Hire.
for (let more = 0; more < 6 && (await page.evaluate(() => !window.__cafe.shop.affordable)); more++) {
  await pickHead();
  await drop(await seatFor(true));
  await rest();
  await pause(7000);
}
{
  const board = await page.evaluate(() => window.__cafe.board.panel.mesh.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
  await h.head(SEAT, P(board), 1300);
  await pause(1800);
  await press('board', 'hire');
  await rest();
  await h.head(SEAT, P(await toWorld([0, 0.08, -0.16])), 1500);
  await page.waitForFunction(() => window.__cafe.baristas.staff.length >= 2, null, { timeout: 5 * 60 * 1000, polling: 100 }).catch(() => console.error('no second server'));
  await pause(4000);
  // Pause, and Resume.
  await h.head(SEAT, P(board), 1200);
  await press('board', 'pause');
  await rest();
  await overview();
  await pause(2500);
  await press('card', 'resume');
  await rest();
}

// 6. A little more of the evening, then the café's happiness runs out and it closes.
await pickHead();
await drop(await seatFor(true));
await rest();
await pause(5000);
await page.evaluate(() => (window.__cafe.score.happiness = 9));
await page.evaluate(() => { const { guests } = window.__cafe; for (const g of guests.line) g.patience = Math.min(g.patience, 2 + Math.random() * 3); });
await until(() => window.__cafe.game.phase === 'closed');
await pause(6500);
clearInterval(pacer);

const stats = await page.evaluate(() => {
  const { guests, score, baristas, game } = window.__cafe;
  return { phase: game.phase, openFor: Math.round(game.clock), takings: score.takings, bank: score.bank, up: score.up, down: score.down, wishesGranted: score.wishesGranted, staff: baristas.staff.length, seated: guests.seated, stormedOff: guests.stormedOff, gaveUp: guests.gaveUp };
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
