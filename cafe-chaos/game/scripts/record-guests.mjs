/**
 * The café alive, recorded as the headset shows it (Quest 3 field of
 * view, no captions): the viewer sits at the table and the café pops up,
 * blossom falling from the tree; a lean in to the counter, where the
 * servers are at work under the rising steam; guests of all three kinds walk up and line up
 * outside the door, and the viewer leans over for a look at the line; a
 * hand comes close and a guest watches it, is pinched up, surprised, and
 * brought up to the viewer's face, where it is puzzled, still, its head
 * on one side; it is carried over the café, its eyes on the seat under
 * it, which glows violet, and let go to sit down; a second guest is seated;
 * someone in the line loses patience and leaves along the front path;
 * and the first guest, its meal over, hops off its chair, walks out of
 * the door, down the side and along the front path, fading at its end,
 * while the baristas go on serving the tables. The theme plays under it
 * all, mixed into the video at the level the game plays it.
 *
 * So the whole story fits in one video, guests give up after about half
 * a minute in the line here and stay seated for half a minute (in play:
 * 40 seconds and a minute; see src/guests/rules.ts).
 *
 * Usage: dev server running (`npm run dev`), then `npm run record:guests`.
 * Output: artifacts/guests.mp4
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
  record: 'guests',
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
      guests.spawnSeconds = [1.7, 2.5];
      guests.patienceSeconds = 34;
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

// 1. Seated; the café pops up, the room dims, the lamps come up; the first guests are on their way.
await pause(4200);

// 1b. A lean in to the counter: the servers at work behind it, under the steam.
await h.head(P(await toWorld([-0.02, 0.27, 0.2])), P(await toWorld([-0.08, 0.08, -0.17])), 2200);
await pause(3600);

// 2. Lean right over for a close look at the line as it forms outside the door.
const lineView = await toWorld([0.66, 0.17, 0.33]);
const lineAt = await toWorld([0.56, 0.04, 0.03]);
await h.head(P(lineView), P(lineAt), 2400);
await until(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 3);
await pause(2000);

// 3. A hand comes close: the guest at the head of the line watches it; a pinch picks it up.
let first = await lineHead();
await reach(1500, add(first.grip, [0.03, 0.07, 0.05]));
await pause(900);
first = (await lineHead()) ?? first;
await reach(600, first.grip);
await pause(250);
await pinch(1);
await pause(500);
const lifted = add(first.grip, [0.02, 0.13, 0.06]);
await reach(900, lifted);
await pause(1200);

// 4. Up to the face: back in the seat, the guest held a hand's breadth away, puzzled, its head on one side.
const face = [SEAT.x - 0.125, SEAT.y - 0.03, SEAT.z + 0.004];
await Promise.all([h.head(SEAT, P(add(face, [0, -0.012, 0])), 1700), reach(1700, face)]);
await until((id) => {
  const act = window.__cafe.guests.guests.find((g) => g.id === id)?.act;
  return !!act && act.acting.mood === 'puzzled';
}, first.id);
await pause(2700);

// 5. Over the café: free seats show blue dots, the seat under the guest glows; try one, then choose its neighbour, and let go.
const seatA = await seatWorld(0.167, 0.025);
const seatNear = await seatWorld(0.093, 0.025);
await Promise.all([h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.1, z: TABLE.z }, 1500), reach(1700, add(seatNear.at, [0, HANG + 0.05, 0]))]);
await reach(600, add(seatNear.at, [0, HANG, 0]));
await pause(1100);
await reach(900, add(seatA.at, [0, HANG, 0]));
await pause(1300);
await pinch(0);
await pause(1800);

// 6. A second guest, straight from the line to a seat at a four-seater.
const second = await until(() => {
  const { guests, system } = window.__cafe;
  const V = system.cafe.position.constructor;
  const g = guests.line.find((x) => x.state === 'queued' && !x.walk);
  return g ? { id: g.id, grip: g.actor.grip.getWorldPosition(new V()).toArray() } : null;
});
await reach(1500, add(second.grip, [0.01, 0.06, 0.02]));
const second2 = (await lineHead()) ?? second;
await reach(500, second2.grip);
await pause(250);
await pinch(1);
await pause(400);
await reach(700, add(second2.grip, [0, 0.12, 0.03]));
const seatB = await seatWorld(0.023, -0.095);
await reach(1900, add(seatB.at, [0, HANG + 0.04, 0]));
await reach(500, add(seatB.at, [0, HANG, 0]));
await pause(900);
await pinch(0);
await pause(700);
await reach(1300, LAP.right);

// 7. Someone in the line has had enough: it comes onto the plate, goes down the side and away along the front path.
await h.head(SEAT, P(await toWorld([0.42, 0.03, 0.18])), 1500);
await until(() => window.__cafe.guests.guests.some((g) => g.state === 'leaving' && g.actor.root.position.z > 0.14 && g.actor.opacity === 1));
await h.head(SEAT, P(await toWorld([0.15, 0.02, 0.28])), 2200);
await pause(5200);

// 8. The first guest's meal is over: a closer look as it hops off its chair, then watch it out of the door and away.
const seatView = await toWorld([0.26, 0.2, 0.3]);
await h.head(P(seatView), P(add(seatA.at, [0, 0.02, 0])), 2200);
await until((id) => {
  const g = window.__cafe.guests.guests.find((x) => x.id === id);
  return !g || g.state === 'leaving';
}, first.id);
await pause(1800);
await h.head(SEAT, P(await toWorld([0.38, 0.03, 0.16])), 2000);
await until((id) => {
  const g = window.__cafe.guests.guests.find((x) => x.id === id);
  return !g || (g.actor.root.position.z > 0.2 && g.actor.root.position.x < 0.34);
}, first.id);
await h.head(SEAT, P(await toWorld([0.0, 0.02, 0.27])), 2400);
await until((id) => !window.__cafe.guests.guests.find((x) => x.id === id), first.id);
await h.head(SEAT, { x: TABLE.x, y: TABLE.y + 0.1, z: TABLE.z }, 1500);
await pause(2500);

const stats = await page.evaluate(() => {
  const { guests } = window.__cafe;
  return { arrived: guests.arrived, seated: guests.seated, gaveUp: guests.gaveUp, left: guests.left, peak: guests.peak, traysServed: window.__cafe.baristas.servedCount };
});
const errors = await h.finish();
addTheme('artifacts/guests.mp4');
console.log(JSON.stringify(stats));
console.log(errors.length ? `console errors:\n${errors.slice(0, 5).join('\n')}` : 'no console errors');
console.log('artifacts/guests.mp4');

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
