/**
 * Guests check, part 3: expressions. With the viewer seated at the
 * emulated table and guests in the line, checks that:
 * 1. a guest in the line watches a hand that comes close (wide eyes that
 *    follow it), and stops when the hand goes away;
 * 2. picked up, it is surprised for a moment, then calm, and it stays
 *    calm: nothing cycles;
 * 3. carried, its eyes are on the seat it is held over (straight down
 *    when there is none);
 * 4. its face follows its patience dial: uneasy on amber, worried and
 *    drooping on coral;
 * 5. brought right up to the player's face it is puzzled, head on one
 *    side, looking straight at the player, until it is taken away;
 * 6. it only ever shows one face at a time, in that order; put back, its
 *    face is its own again; and no console errors.
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
    look: pupils ? [pupils.position.x - x.actor.pupilHome.standing.x, pupils.position.y - x.actor.pupilHome.standing.y] : null,
    target: x.target ? x.target.index : null, left: x.patience / x.patienceFull,
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

// 2. Picked up: surprised for a second, then calm, and it stays calm (nothing cycles).
await h.head(SEAT, { x: rest.grip[0], y: rest.grip[1], z: rest.grip[2] }, 300);
await pinchTo(add(rest.grip, [0, 0.05, 0]));
await frames(2);
await pinchTo(rest.grip);
await frames(2);
await pinch(1);
await frames(2);
const surprised = await guestState(id);
const up = add(rest.grip, [0.05, 0.14, 0.1]);
await drag(rest.grip, up, 4);
const moodIs = (mood) => page.waitForFunction(([id, mood]) => window.__cafe.guests.guests.find((x) => x.id === id)?.act?.acting.mood === mood || null, [id, mood], { timeout: 60000 }).then(() => frames(2)).then(() => guestState(id));
const calm = await moodIs('calm');
await h.screenshot('artifacts/expr-1-calm.png');
await page.waitForTimeout(7000);
await frames(2);
const later = await guestState(id);
check('picked up it is surprised for a moment, then calm, and stays so', surprised.state === 'held' && surprised.seen[0] === 'surprised' && calm.mouth === 'MouthSmile' && calm.distance > 0.33 && later.mood === 'calm' && later.seen.join() === 'surprised,calm',
  `first ${surprised.seen[0]} (${surprised.eyes}/${surprised.mouth}), then ${calm.mood} with ${calm.eyes}/${calm.mouth} at ${(calm.distance * 100).toFixed(0)} cm from the head; seven seconds on: ${later.seen.join(' > ')}`);

// 3. Held over a free seat, its eyes are on that seat; away from any seat it looks straight down.
let overSeat;
{
  const noSeat = await guestState(id);
  const spot = await page.evaluate(() => {
    const { guests, system } = window.__cafe;
    const V = system.cafe.position.constructor;
    // A free seat in the front row, and a point to hold the guest's grip at: above it and a little to one side.
    const seat = guests.seats.filter((s) => s.occupant === 0 && s.position.z > -0.02).sort((a, b) => Math.abs(a.position.x - 0.2) - Math.abs(b.position.x - 0.2))[0];
    const at = system.cafe.localToWorld(new V(seat.position.x + 0.03, seat.position.y + 0.07 + 0.042, seat.position.z));
    return { index: seat.index, at: at.toArray() };
  });
  await drag(up, spot.at, 5);
  await page.waitForFunction((id) => window.__cafe.guests.guests.find((x) => x.id === id)?.target != null || null, id, { timeout: 60000 });
  await frames(4);
  overSeat = { at: spot.at, ...(await guestState(id)) };
  await h.screenshot('artifacts/expr-2-eyes-on-the-seat.png');
  check('carried, it looks at the seat below it', noSeat.target === null && noSeat.look[1] < -0.0006 && Math.abs(noSeat.look[0]) < 0.0002 && overSeat.target === spot.index && overSeat.look[1] < -0.0004 && Math.abs(overSeat.look[0]) > 0.0002 && overSeat.mood === 'calm',
    `over no seat: eyes ${(noSeat.look[0] * 1000).toFixed(2)}, ${(noSeat.look[1] * 1000).toFixed(2)} mm from centre (straight down); over seat ${spot.index}, held 3 cm to one side: eyes ${(overSeat.look[0] * 1000).toFixed(2)}, ${(overSeat.look[1] * 1000).toFixed(2)} mm (down and across to it), aimed at seat ${overSeat.target}`);
}

// 4. Its face follows its dial: uneasy on amber, worried on coral, each steady.
const setPatience = (left) => page.evaluate(([id, left]) => { const g = window.__cafe.guests.guests.find((x) => x.id === id); g.patience = g.patienceFull * left; }, [id, left]);
await drag(overSeat.at, up, 4);
await setPatience(0.45);
const uneasy = await moodIs('uneasy');
await h.screenshot('artifacts/expr-3-uneasy.png');
await setPatience(0.2);
const worried = await moodIs('worried');
await page.waitForFunction((id) => window.__cafe.guests.guests.find((x) => x.id === id)?.pitch > 0.15 || null, id, { timeout: 60000 });
const drooped = await guestState(id);
await h.screenshot('artifacts/expr-4-worried.png');
check('its face follows its patience dial: uneasy on amber, worried and drooping on coral', uneasy.mouth === 'MouthO' && uneasy.left < 0.5 && worried.mouth === 'MouthFrown' && drooped.pitch > 0.15 && drooped.seen.join() === 'surprised,calm,uneasy,worried',
  `at ${(uneasy.left * 100).toFixed(0)}%: ${uneasy.mood}, ${uneasy.eyes}/${uneasy.mouth}; at ${(worried.left * 100).toFixed(0)}%: ${worried.mood}, ${worried.eyes}/${worried.mouth}, drooping ${drooped.pitch.toFixed(2)} rad; seen ${drooped.seen.join(' > ')}`);

// 5. Right up at the player's face: puzzled, head on one side, looking straight at the player, for as long as it is held there.
await setPatience(1);
await moodIs('calm');
const head = [SEAT.x, SEAT.y, SEAT.z];
const close = add(head, [-0.15, -0.035, 0.0]);
await drag(up, close, 6);
await h.head(SEAT, { x: close[0], y: close[1] - 0.012, z: close[2] }, 300);
const puzzled = await moodIs('puzzled');
await page.waitForFunction((id) => Math.abs(window.__cafe.guests.guests.find((x) => x.id === id)?.roll) > 0.2 || null, id, { timeout: 60000 });
await page.waitForTimeout(6000);
await frames(2);
const still = await guestState(id);
await h.screenshot('artifacts/expr-5-puzzled.png');
await h.head(SEAT, { x: rest.grip[0], y: rest.grip[1], z: rest.grip[2] }, 300);
await drag(close, up, 5);
const away = await moodIs('calm');
{
  const all = [surprised, calm, later, overSeat, uneasy, worried, drooped, puzzled, still, away];
  // Everything shown while held: the wide eyes (closed for a blink) and one mouth; never the pleased eyes.
  const faces = all.every((g) => (g.eyes === 'EyesWide' || g.eyes === 'EyesClosed') && g.parts.filter((p) => p.startsWith('Mouth')).length === 1 && !g.parts.includes('EyesHappy') && !g.parts.includes('EyesCross'));
  check('up at the face it is puzzled, head on one side, eyes on the player, until it is taken away', puzzled.distance < 0.25 && still.mood === 'puzzled' && Math.abs(still.roll) > 0.2 && still.mouth === 'MouthO' && Math.hypot(still.look[0], still.look[1]) < 0.0003 && away.mood === 'calm' && Math.abs(away.roll) < 0.2,
    `${(puzzled.distance * 100).toFixed(0)} cm from the head: ${still.mood} six seconds on, ${still.eyes}/${still.mouth}, head tilted ${still.roll.toFixed(2)} rad, eyes ${(Math.hypot(still.look[0], still.look[1]) * 1000).toFixed(2)} mm off centre; taken away: ${away.mood}`);
  check('one face at a time, in order, none of them at random', faces && away.seen.join() === 'surprised,calm,uneasy,worried,calm,puzzled,calm', `seen: ${away.seen.join(' > ')}; wide eyes and one mouth throughout ${faces}`);
}

// 6. Put back: its own face again.
await h.head(SEAT, LOOK, 300);
await drag(up, add(rest.grip, [0.1, 0.2, 0.25]), 5);
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
