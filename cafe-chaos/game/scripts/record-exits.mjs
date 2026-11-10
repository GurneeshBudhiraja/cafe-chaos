/**
 * A short look at how guests wait, are lifted and leave, recorded as the
 * headset shows it (Quest 3 field of view, no captions): the line forms
 * outside the door, a patience dial over each head; a guest is pinched
 * up and brought to the viewer's face, where it is startled, curious,
 * confused, looks for a way out and frets (never pleased); it and two
 * more are seated on the violet glow; someone in the line runs out of
 * patience, turns round and walks back the way it came; one picked up
 * too late fades away in the hand as its dial runs out; servers bring
 * each seated guest its tray; and the seated guests, done, hop down, come out of the room's front opening by the
 * Meta stone, and go left or right along the garden path, fading at its
 * ends. The theme plays under it, at the 5% the game plays it at.
 *
 * So it fits a short clip, guests give up after 27 seconds in the line
 * here and stay seated for 30 (in play: 32 seconds and a minute; see
 * src/guests/rules.ts).
 *
 * Usage: dev server running (`npm run dev`), then `npm run record:exits`.
 * Output: artifacts/exits.mp4
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
  record: 'exits',
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
      guests.patienceSeconds = 27;
      guests.seatedSeconds = 30;
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

// 1. Seated; the café pops up; the first guests are on their way.
await pause(3600);

// 2. Lean right over for a close look at the line: a patience dial over each head, running down.
const lineView = await toWorld([0.66, 0.17, 0.33]);
const lineAt = await toWorld([0.56, 0.045, 0.03]);
await h.head(P(lineView), P(lineAt), 2200);
await until(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 3);
await pause(2200);

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

// 3. Pick one up; at arm's length it is startled, then wonders; up at the face it is curious, confused, looks for a way out, and frets.
const first = await pickHead();
await reach(800, add(first.grip, [0.02, 0.13, 0.06]));
await pause(900);
const face = [SEAT.x - 0.125, SEAT.y - 0.03, SEAT.z + 0.004];
await Promise.all([h.head(SEAT, P(add(face, [0, -0.012, 0])), 1500), reach(1500, face)]);
await until((id) => {
  const act = window.__cafe.guests.guests.find((g) => g.id === id)?.act;
  return !!act && act.acting.mood === 'worried';
}, first.id);
await pause(2600);

// 4. Seat it on the violet glow, and two more after it, so there are three to watch leave.
await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.1, z: TABLE.z }, 1300);
await seatAt(0.037, 0.025, 1100);
await pickHead();
await seatAt(-0.093, 0.025);
await pickHead();
await seatAt(0.167, 0.025);
await reach(1100, LAP.right);

// 5. Someone in the line runs out of patience: it turns round and walks back the way it came.
await h.head(P(await toWorld([0.7, 0.2, 0.36])), P(await toWorld([0.62, 0.04, 0.05])), 1700);
await until(() => window.__cafe.guests.guests.some((g) => g.state === 'leaving' && g.side === null && g.actor.opacity === 1 && g.walk && g.walk.walked > 0.02));
await pause(3200);

// 5b. One picked up too late: its dial keeps running in the hand, runs out, and it fades away there.
{
  const late = await until(() => {
    const { guests, system } = window.__cafe;
    const V = system.cafe.position.constructor;
    const g = guests.line.filter((x) => x.state === 'queued' && !x.walk && x.patience > 2.5 && x.patience < 7).sort((a, b) => a.patience - b.patience)[0];
    return g ? { id: g.id, grip: g.actor.grip.getWorldPosition(new V()).toArray() } : null;
  });
  await reach(900, add(late.grip, [0.02, 0.05, 0.03]));
  await reach(350, late.grip);
  await pause(150);
  await pinch(1);
  await pause(300);
  await reach(900, add(late.grip, [-0.02, 0.11, 0.1]));
  await until((id) => !window.__cafe.guests.guests.some((g) => g.id === id), late.id);
  await pause(500);
  await pinch(0);
  await reach(900, LAP.right);
}

// 6. The seated guests, done: down from their chairs, out by the Meta stone, and off to the left and to the right.
await h.head(SEAT, P(await toWorld([0.06, 0.02, 0.2])), 1900);
await until(() => { const { guests } = window.__cafe; return guests.hoppedOff >= guests.seated && !guests.guests.some((g) => g.state === 'seated' || g.state === 'hop' || (g.state === 'leaving' && g.side !== null)); });
await pause(1500);

const stats = await page.evaluate(() => {
  const { guests } = window.__cafe;
  return { arrived: guests.arrived, seated: guests.seated, gaveUp: guests.gaveUp, left: guests.left, peak: guests.peak, traysServed: window.__cafe.baristas.servedCount };
});
const errors = await h.finish();
addTheme('artifacts/exits.mp4');
console.log(JSON.stringify(stats));
console.log(errors.length ? `console errors:\n${errors.slice(0, 5).join('\n')}` : 'no console errors');
console.log('artifacts/exits.mp4');

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
