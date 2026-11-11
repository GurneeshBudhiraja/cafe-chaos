/**
 * A short, close look at how a held guest takes it, recorded as the
 * headset shows it (Quest 3 field of view, no captions). One steady face
 * at a time, each with a cause the player can see:
 *
 * - a guest is pinched out of the line: surprised for a second, then
 *   calm, a small smile;
 * - carried over the seats its eyes go to the seat it is held over (the
 *   one glowing violet);
 * - brought right up to the viewer's face it is puzzled: still, its head
 *   on one side, looking straight at the viewer, until taken away;
 * - seated, it is pleased;
 * - a second guest is held while its patience dial runs down: calm while
 *   the ring is mint, uneasy on amber, worried and drooping on coral;
 *   then it too is seated, in time.
 * The clip ends on the whole café (the front-right corner by the gate
 * now clear: the waiting bench is gone). The theme plays under it.
 *
 * So it fits a short clip, the second guest's dial is hurried along once
 * it is in the hand (20 seconds from full, in play 32: see
 * src/guests/rules.ts); nobody else gives up meanwhile.
 *
 * Usage: dev server running (`npm run dev`), then `npm run record:faces`.
 * Output: artifacts/faces.mp4
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
  record: 'faces',
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
      guests.patienceSeconds = 70;
      guests.seatedSeconds = 60;
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

// 2. Lean in over the front right corner, by the door; the line forms.
const VIEW = [0.3, 0.3, 0.52];
const HOLD = [0.3, 0.2, 0.17];
const view = await toWorld(VIEW);
const hold = await toWorld(HOLD);
await h.head(P(view), P(await toWorld([0.48, 0.05, 0.04])), 2000);
await until(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 3);
await pause(1200);
const moodIs = (id, mood) => until(([id, mood]) => window.__cafe.guests.guests.find((g) => g.id === id)?.act?.acting.mood === mood, [id, mood]);

// 3. Pick one up and hold it out in front: surprised for a second, then calm.
const first = await pickHead();
await Promise.all([h.head(P(view), P(hold), 1100), reach(1100, hold)]);
await moodIs(first.id, 'calm');
await pause(2400);

// 4. Over the seats: its eyes go to the seat it is held over, which glows.
const seatA = await seatWorld(0.167, 0.025);
const seatB = await seatWorld(0.037, 0.025);
await Promise.all([h.head(P(view), P(add(seatA.at, [0, 0.05, 0])), 1300), reach(1300, add(seatA.at, [0.012, HANG + 0.04, 0]))]);
await pause(1700);
await reach(1100, add(seatB.at, [-0.012, HANG + 0.04, 0]));
await pause(1500);

// 5. Right up to the face: puzzled, still, its head on one side, looking straight at the viewer.
const face = await toWorld(add(VIEW, [0, -0.045, -0.15]));
await Promise.all([h.head(P(view), P(add(face, [0, -0.01, 0])), 1400), reach(1400, face)]);
await moodIs(first.id, 'puzzled');
await pause(3400);

// 6. Seat it: pleased.
await Promise.all([h.head(P(view), P(add(seatA.at, [0, 0.04, 0])), 1300), reach(1300, add(seatA.at, [0, HANG + 0.05, 0]))]);
await reach(450, add(seatA.at, [0, HANG, 0]));
await pause(700);
await pinch(0);
await pause(1900);

// 7. A second guest, held while its dial runs down: calm, then uneasy on amber, then worried and drooping on coral.
const second = await pickHead();
await page.evaluate((id) => {
  const g = window.__cafe.guests.guests.find((x) => x.id === id);
  // Hurried along for the clip: 20 seconds from full, with 60% of it left.
  g.patienceFull = 20;
  g.patience = 12;
}, second.id);
await Promise.all([h.head(P(view), P(hold), 1100), reach(1100, hold)]);
await moodIs(second.id, 'uneasy');
await pause(2600);
await moodIs(second.id, 'worried');
await pause(2400);

// 8. Seated in time.
await Promise.all([h.head(P(view), P(add(seatB.at, [0, 0.04, 0])), 1200), reach(1200, add(seatB.at, [0, HANG + 0.05, 0]))]);
await reach(400, add(seatB.at, [0, HANG, 0]));
await pause(500);
await pinch(0);
await pause(1800);
await reach(1000, LAP.right);

// 9. Sit back: the whole café, the corner by the gate clear.
await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.1, z: TABLE.z }, 1800);
await pause(3200);

const stats = await page.evaluate(([a, b]) => {
  const { guests } = window.__cafe;
  return { arrived: guests.arrived, seated: guests.seated, gaveUp: guests.gaveUp };
}, [first.id, second.id]);
const errors = await h.finish();
addTheme('artifacts/faces.mp4');
console.log(JSON.stringify(stats));
console.log(errors.length ? `console errors:\n${errors.slice(0, 5).join('\n')}` : 'no console errors');
console.log('artifacts/faces.mp4');

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
