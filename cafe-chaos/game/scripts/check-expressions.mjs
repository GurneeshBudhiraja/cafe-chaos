/**
 * Guests check, part 3: expressions. With the viewer seated at the
 * emulated table and guests in the line, checks that:
 * 1. a guest in the line watches a hand that comes close (wide eyes that
 *    follow it), and stops when the hand goes away;
 * 2. picked up, it is startled, then, held at arm's length, wonders what
 *    is happening, its eyes moving;
 * 3. brought up to the player's face it goes through curious, confused,
 *    searching and worried, in that order, each with the face parts and
 *    the lean that belong to it, and never a pleased face;
 * 4. put back, its face is its own again; and no console errors.
 * Saves a close-up of each expression.
 *
 * Usage: dev server running, then `node scripts/check-expressions.mjs`.
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
/** Exactly one pair of eyes and one mouth are drawn. */
const oneFace = (g) => {
  const eyes = g.parts.filter((p) => p.startsWith('Eyes'));
  const mouths = g.parts.filter((p) => p.startsWith('Mouth'));
  // Mid-blink the clip itself shows the closing lids over the eyes for a frame or two.
  const blinking = eyes.length === 2 && eyes.includes('EyesClosed');
  return (eyes.length === 1 || blinking) && mouths.length === 1;
};

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => {
      const { guests, system } = window.__cafe;
      guests.spawnSeconds = [1.5, 2.5];
      guests.patienceSeconds = 100000;
      system.replace();
    });
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 20000 });
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => {
  const info = window.__cafe.world.renderer.info.render;
  const target = info.frame + n;
  const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8);
}), n);

/** One guest's state: what it is doing and which face parts are actually drawn. */
const guestState = (id) => page.evaluate((id) => {
  const { guests, hold, world } = window.__cafe;
  const V = world.camera.position.constructor;
  const x = guests.guests.find((g) => g.id === id) ?? guests.line[0];
  if (!x) return null;
  const prefix = x.actor.pose === 'standing' ? 'St-' : 'Se-';
  // A face part is drawn if its node is visible and not scaled to nothing (some are groups of several meshes).
  const shown = ['EyesOpen', 'EyesWide', 'EyesHappy', 'EyesClosed', 'EyesCross', 'MouthSmile', 'MouthOpen', 'MouthO', 'MouthFrown', 'MouthNom'].filter((name) => {
    const part = x.actor.root.getObjectByName(prefix + name);
    return part && part.visible && part.scale.x > 0.01;
  });
  const pupils = x.actor.root.getObjectByName(prefix + 'WidePupils');
  return {
    id: x.id, state: x.state, clip: x.actor.clip, watching: x.watching, mood: x.act ? x.act.acting.mood : null, seen: x.act ? [...x.act.seen] : [],
    eyes: shown.find((n) => n.startsWith('Eyes')), mouth: shown.find((n) => n.startsWith('Mouth')), parts: shown,
    pupils: pupils ? [pupils.position.x, pupils.position.y] : null, pupilsShown: !!pupils?.visible,
    roll: x.roll, pitch: x.pitch, grip: x.actor.grip.getWorldPosition(new V()).toArray(),
    distance: x.actor.grip.getWorldPosition(new V()).distanceTo(world.camera.getWorldPosition(new V())),
    pinch: hold.pinch.right.point.toArray(), line: guests.line.map((g) => g.id),
  };
}, id);

const Q = { x: 0, y: 0, z: 0, w: 1 };
const AWAY = { left: [-0.3, 0.9, 0.6], right: [-0.3, 0.9, -0.1] };
const handTo = (hand, p) => send('set_transform', { device: `hand-${hand}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const pinch = (value) => send('set_select_value', { device: 'hand-right', value });
await handTo('right', AWAY.right);
await handTo('left', AWAY.left);
await pinch(1);
await frames(3);
const pinchOffset = add((await guestState(-1))?.pinch ?? (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())), AWAY.right, -1);
await pinch(0);
await frames(2);
const pinchTo = (p) => handTo('right', add(p, pinchOffset, -1));
async function drag(from, to, steps = 6) {
  for (let i = 1; i <= steps; i++) {
    await pinchTo(add(from, add(to, from, -1), i / steps));
    await frames(1);
  }
}

await page.waitForFunction(() => window.__cafe.guests.line.length >= 2 && window.__cafe.guests.line.every((g) => g.state === 'queued' && !g.walk), null, { timeout: 180000 });
await page.evaluate(() => (window.__cafe.guests.arrivals = false));
await frames(2);
const id = (await guestState(-1)).line[0];
const rest = await guestState(id);

// 1. A hand comes close: the guest watches it.
{
  // Look at the head of the line from close, then bring the open hand up beside it.
  const eye = add(rest.grip, [0.16, 0.08, 0.02]);
  await h.head({ x: eye[0], y: eye[1], z: eye[2] }, { x: rest.grip[0], y: rest.grip[1], z: rest.grip[2] }, 300);
  await pinchTo(add(rest.grip, [0.01, 0.035, 0.025]));
  await frames(3);
  const near = await guestState(id);
  await h.screenshot('artifacts/expr-0-watching.png');
  await pinchTo(add(rest.grip, [0.01, 0.035, -0.035]));
  await frames(3);
  const moved = await guestState(id);
  await handTo('right', AWAY.right);
  await frames(3);
  const gone = await guestState(id);
  const followed = near.pupils && moved.pupils && Math.hypot(near.pupils[0] - moved.pupils[0], near.pupils[1] - moved.pupils[1]) > 0.0003;
  check('a guest in the line watches a hand that comes close', near.watching && near.eyes === 'EyesWide' && near.pupilsShown && followed && !gone.watching && !gone.parts.includes('EyesWide') && !gone.parts.includes('MouthO') && oneFace(gone),
    `${(Math.hypot(near.pinch[0] - near.grip[0], near.pinch[1] - near.grip[1], near.pinch[2] - near.grip[2]) * 100).toFixed(1)} cm away: watching ${near.watching} with ${near.eyes}/${near.mouth}, pupils followed the hand ${followed}; hand away: watching ${gone.watching}, ${gone.eyes}/${gone.mouth}`);
}

// 2. Picked up: startled, then wondering at arm's length.
await h.head(SEAT, { x: rest.grip[0], y: rest.grip[1], z: rest.grip[2] }, 300);
await pinchTo(add(rest.grip, [0, 0.05, 0]));
await frames(2);
await pinchTo(rest.grip);
await frames(2);
await pinch(1);
await frames(2);
const startled = await guestState(id);
const up = add(rest.grip, [0.05, 0.14, 0.1]);
await drag(rest.grip, up, 4);
const wondering = await page.waitForFunction((id) => {
  const g = window.__cafe.guests.guests.find((x) => x.id === id);
  return g?.act?.acting.mood === 'wondering' ? true : null;
}, id, { timeout: 60000 }).then(() => guestState(id));
{
  const a = wondering.pupils;
  await frames(2);
  const b = (await guestState(id)).pupils;
  const eyesMove = Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.0001;
  check('picked up it is startled, then wonders what is happening', startled.state === 'held' && startled.seen[0] === 'startled' && (wondering.eyes === 'EyesWide' || wondering.eyes === 'EyesClosed') && wondering.distance > 0.42 && eyesMove,
    `first mood ${startled.seen[0]}, then ${wondering.mood} with ${wondering.eyes}/${wondering.mouth} at ${(wondering.distance * 100).toFixed(0)} cm from the head, eyes moving ${eyesMove}`);
}
await h.screenshot('artifacts/expr-1-wondering.png');

// 3. Up to the face: the run of feelings, a close-up of each.
const head = [SEAT.x, SEAT.y, SEAT.z];
const close = add(head, [-0.15, -0.035, 0.0]);
await drag(up, close, 6);
await h.head(SEAT, { x: close[0], y: close[1] - 0.012, z: close[2] }, 300);
const WANT = ['curious', 'confused', 'searching', 'worried'];
const shots = {};
for (const mood of WANT) {
  // The emulator's frames are slow: stop the game clock the moment the guest is well into this mood, so the
  // reading and the picture are of the same instant, then let it run on.
  await page.evaluate(([id, mood]) => {
    window.__frozen = null;
    const { guests, system } = window.__cafe;
    const t = setInterval(() => {
      const act = guests.guests.find((x) => x.id === id)?.act;
      if (!act || act.acting.mood !== mood || act.t < 0.7) return;
      system.timeScale = 0;
      window.__frozen = mood;
      clearInterval(t);
    }, 15);
  }, [id, mood]);
  await page.waitForFunction((mood) => window.__frozen === mood, mood, { timeout: 180000 });
  await frames(2);
  shots[mood] = await guestState(id);
  await h.screenshot(`artifacts/expr-${2 + WANT.indexOf(mood)}-${mood}.png`);
  await page.evaluate(() => (window.__cafe.system.timeScale = 1));
}
{
  const seen = shots.worried.seen;
  const order = WANT.every((m, i) => seen.indexOf(m) >= 0 && (i === 0 || seen.indexOf(m) > seen.indexOf(WANT[i - 1])));
  const faces = {
    curious: shots.curious.eyes === 'EyesWide' || shots.curious.eyes === 'EyesClosed',
    confused: shots.confused.mouth === 'MouthFrown',
    searching: shots.searching.eyes === 'EyesWide' && shots.searching.mouth === 'MouthO',
    worried: shots.worried.mouth === 'MouthFrown' && (shots.worried.eyes === 'EyesOpen' || shots.worried.eyes === 'EyesClosed'),
  };
  const oneFace = WANT.every((m) => shots[m].parts.filter((p) => p.startsWith('Eyes')).length === 1 && shots[m].parts.filter((p) => p.startsWith('Mouth')).length === 1);
  // Everything shown while held belongs to being held: never the pleased faces.
  const pleased = [...WANT.map((m) => shots[m]), startled, wondering].some((g) => g.parts.includes('EyesHappy') || g.parts.includes('MouthSmile'));
  check('up at the face it goes through its feelings in order', order && shots.curious.distance < 0.4, `seen: ${seen.slice(0, 7).join(' > ')}; ${(shots.curious.distance * 100).toFixed(0)} cm from the head`);
  check('each shows its own face, one pair of eyes and one mouth at a time, and none of them pleased', Object.values(faces).every(Boolean) && oneFace && !pleased && !seen.includes('happy'), WANT.map((m) => `${m}: ${shots[m].eyes}/${shots[m].mouth}${faces[m] ? '' : ' (wrong)'}`).join(', ') + `; a pleased face shown ${pleased}`);
  check('it leans with its feelings: droops when worried, tilts its head when confused', shots.worried.pitch > 0.1 && Math.abs(shots.curious.pitch) < 0.16 && Math.abs(shots.confused.roll) > 0.03, `pitch worried ${shots.worried.pitch.toFixed(2)}, curious ${shots.curious.pitch.toFixed(2)}; roll confused ${shots.confused.roll.toFixed(2)}`);
}

// 4. Put back: its own face again.
await h.head(SEAT, LOOK, 300);
await drag(close, add(rest.grip, [0.1, 0.2, 0.25]), 5);
await pinch(0);
await page.waitForFunction((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'queued', id, { timeout: 60000 });
await handTo('right', AWAY.right);
await frames(3);
{
  const back = await guestState(id);
  check('put back, its face is its own again', back.state === 'queued' && back.mood === null && oneFace(back) && !back.parts.includes('EyesHappy') && !back.parts.includes('EyesWide') && !back.parts.includes('EyesCross') && Math.abs(back.roll) < 0.01 && Math.abs(back.pitch) < 0.01, `${back.state}, clip ${back.clip}, showing ${back.parts.join('+')}, lean ${back.roll.toFixed(2)}/${back.pitch.toFixed(2)}`);
}

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
