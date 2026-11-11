/**
 * This round, recorded as the headset shows it (Quest 3 field of view, no
 * captions):
 * - the line by the door, turned to run toward the viewer;
 * - a hand comes close to the guest at the head of the line and it lights
 *   up (a warm ring round its feet): a pinch takes exactly it; it is
 *   seated on the violet glow;
 * - the stone plaque in front lights up as the hand comes close, and a
 *   pinch on it pops the padlock off: the left wall goes and the café
 *   grows wider with four more tables, one room with one exit;
 * - the seated guest, done, walks out through that one exit, in the new
 *   outer wall.
 * The theme plays under it. (The café's own sounds play in the headset;
 * the emulator's recording has no way to capture them.)
 *
 * So it fits a short clip, a seated guest stays 22 seconds here (a
 * minute in play).
 *
 * Usage: dev server running (`npm run dev`), then `npm run record:extend`.
 * Output: artifacts/extend.mp4
 */

import { execFileSync } from 'node:child_process';
import { renameSync } from 'node:fs';
import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const TABLE = { x: -1.3, y: 0.79, z: 0.28 };
const LAP = { left: [-0.7, 0.85, 0.42], right: [-0.7, 0.85, 0.14] };
const Q = { x: 0, y: 0, z: 0, w: 1 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const P = (a) => ({ x: a[0], y: a[1], z: a[2] });
/** The pinch point relative to the right hand's pose (measured in prepare). */
let pinchOffset = [0, 0, 0];
let page;

const h = await startHeadset({
  record: 'extend',
  maxSpeedUp: 30,
  async prepare(h) {
    page = h.page;
    await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.12, z: TABLE.z });
    for (const hand of ['left', 'right']) await handTo(hand, LAP[hand]);
    await pinch(1);
    await frames(3);
    pinchOffset = add(await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray()), LAP.right, -1);
    await pinch(0);
    await page.evaluate((timeScale) => {
      const { system, guests } = window.__cafe;
      system.timeScale = timeScale;
      guests.spawnSeconds = [1.3, 1.9];
      guests.patienceSeconds = 90;
      guests.seatedSeconds = 22;
      system.replace();
    }, 1 / h.speedUp);
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
/** Where the right hand's pinch point is now. */
let at = LAP.right;
/** Move the right hand so its pinch point travels to `to` over `ms`, eased, a pose per frame. */
async function reach(ms, to) {
  const from = at;
  const real = ms * h.speedUp;
  const t0 = performance.now();
  for (;;) {
    const t = Math.min(1, (performance.now() - t0) / real);
    await handTo('right', add(lerp(from, to, ease(t)), pinchOffset, -1));
    if (t >= 1) break;
    await frames(1);
  }
  at = to;
}
/** A café-space point in the world. */
const toWorld = (local) => page.evaluate((l) => { const { system } = window.__cafe; return system.cafe.localToWorld(new system.cafe.position.constructor(...l)).toArray(); }, local);
/** Wait (the recording runs on) until `predicate` holds in the page. */
const until = (predicate, arg) => page.waitForFunction(predicate, arg, { timeout: 30 * 60 * 1000, polling: 100 }).then((r) => r.jsonValue());
const lineHead = () => page.evaluate(() => {
  const { guests, system } = window.__cafe;
  const V = system.cafe.position.constructor;
  const g = guests.line.find((x) => x.state === 'queued' && !x.walk);
  return g ? { id: g.id, grip: g.actor.grip.getWorldPosition(new V()).toArray() } : null;
});
const seatWorld = (x, z) => page.evaluate(([x, z]) => {
  const { guests, system } = window.__cafe;
  const free = guests.seats.filter((s) => s.occupant === 0);
  const seat = free.reduce((best, s) => (Math.hypot(s.position.x - x, s.position.z - z) < Math.hypot(best.position.x - x, best.position.z - z) ? s : best));
  return { index: seat.index, at: system.cafe.localToWorld(seat.position.clone()).toArray() };
}, [x, z]);
/** The height above a seat at which a carried guest hangs with its feet just clear of the cushion. */
const HANG = 0.042 + 0.03;

/** Pinch up the guest at the head of the line (trying again if it gave up and left as the hand arrived); returns it. */
async function pickHead() {
  for (;;) {
    let guest = await until(() => {
      const { guests, system } = window.__cafe;
      const V = system.cafe.position.constructor;
      // One with a little patience left, so it is still there when the hand arrives.
      const g = guests.line.find((x) => x.state === 'queued' && !x.walk && x.patience > 3.5);
      return g ? { id: g.id, grip: g.actor.grip.getWorldPosition(new V()).toArray() } : null;
    });
    await reach(1100, add(guest.grip, [0.02, 0.06, 0.04]));
    const now = await page.evaluate((id) => {
      const { guests, system } = window.__cafe;
      const g = guests.guests.find((x) => x.id === id && x.state === 'queued');
      return g ? g.actor.grip.getWorldPosition(new system.cafe.position.constructor()).toArray() : null;
    }, guest.id);
    if (now) {
      await reach(450, now);
      await pause(200);
      await pinch(1);
      await pause(350);
      if (await page.evaluate(() => !!window.__cafe.guests.carriedBy('right'))) return guest;
      await pinch(0);
    }
    await pause(300);
  }
}
/** Carry the held guest to a free seat near (x, z) in the café, show the glow, and let go. */
async function seatAt(x, z, linger = 700) {
  const seat = await seatWorld(x, z);
  await reach(1500, add(seat.at, [0, HANG + 0.05, 0]));
  await reach(450, add(seat.at, [0, HANG, 0]));
  await pause(linger);
  await pinch(0);
  await pause(600);
  return seat;
}

// 1. Seated; the café pops up; the first guests are on their way.
await pause(3000);

// 2. Lean over the right side: the line by the door, running toward the viewer, a dial over each head.
const lineView = await toWorld([0.3, 0.3, 0.5]);
await h.head(P(lineView), P(await toWorld([0.48, 0.04, 0.1])), 2000);
await until(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 3);
await pause(1500);

// 3. A hand comes close to the head of the line: that guest lights up. Then a pinch takes it, and it is seated.
{
  const guest = await until(() => {
    const { guests, system } = window.__cafe;
    const V = system.cafe.position.constructor;
    const g = guests.line.find((x) => x.state === 'queued' && !x.walk);
    return g ? { id: g.id, grip: g.actor.grip.getWorldPosition(new V()).toArray() } : null;
  });
  await reach(1300, add(guest.grip, [0.015, 0.035, 0.03]));
  await until((id) => window.__cafe.guests.hovered.some((g) => g && g.id === id), guest.id);
  await pause(1800);
  await reach(450, guest.grip);
  await pause(150);
  await pinch(1);
  await pause(500);
  await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.1, z: TABLE.z }, 1300);
  await seatAt(0.167, 0.025, 900);
  await reach(900, LAP.right);
}

// 4. The plaque in front: it lights up as the hand comes close; a pinch on it, and the café grows.
{
  const grip = await page.evaluate(() => window.__cafe.unlocks.annexPlaque.grip.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
  await h.head(SEAT, P(add(grip, [0.05, 0, -0.08])), 1500);
  await reach(1300, add(grip, [0.01, 0.03, 0.02]));
  await until(() => !!window.__cafe.unlocks.hovered);
  await pause(1600);
  await reach(400, grip);
  await pause(150);
  await pinch(1);
  await pause(600);
  await pinch(0);
  await Promise.all([reach(1000, LAP.right), h.head(SEAT, P(await toWorld([-0.42, 0.03, -0.02])), 1600)]);
  await until(() => window.__cafe.system.annexOpen);
  await pause(2600);
}

// 5. The seated guest, done: out through the one exit, in the new outer wall.
await h.head(SEAT, P(await toWorld([-0.38, 0.03, 0.06])), 1500);
await until(() => window.__cafe.guests.hoppedOff >= 1);
await until(() => !window.__cafe.guests.guests.some((g) => g.state === 'leaving' && g.side === 'exit'));
await pause(1200);

// 6. Sit back: the whole café, one room, wider.
await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.1, z: TABLE.z }, 1800);
await pause(2800);

const stats = await page.evaluate(() => {
  const { guests, system } = window.__cafe;
  return { arrived: guests.arrived, seated: guests.seated, left: guests.left, gaveUp: guests.gaveUp, seats: guests.seats.length, extended: system.annexOpen, sounds: window.__cafe.sound.played };
});
const errors = await h.finish();
addTheme('artifacts/extend.mp4');
console.log(JSON.stringify(stats));
console.log(errors.length ? `console errors:\n${errors.slice(0, 5).join('\n')}` : 'no console errors');
console.log('artifacts/extend.mp4');

/**
 * Put the game's theme under the video, as the headset would play it: the
 * same track (looped if the video is longer), coming in over four
 * seconds as it does in the game, and fading out at the end.
 */
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
