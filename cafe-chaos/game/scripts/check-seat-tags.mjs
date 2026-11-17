/**
 * Seat tags check, in the real game, carrying a guest with the emulated
 * hand (ui/seat-tag.ts):
 *  1. held low over a dirty seat: it glows amber and a tag over it says
 *     "Dirty" (staff will clean it);
 *  2. over a locked table's seat: "Locked", open tables in the Shop;
 *  3. over a taken seat: "Taken";
 *  4. over a free seat: no tag, and a soft tick from that seat;
 *  5. let go over the dirty seat: the guest goes back to the line, the
 *     "uh-uh" plays, the tag stays a moment and then goes;
 *  6. no console errors.
 * Usage: dev server running, then `node scripts/check-seat-tags.mjs`.
 * Output: PASS/FAIL lines; artifacts/seat-tag-*.png.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => { localStorage.removeItem('cafe-chaos/save/v3'); window.__cafe.system.replace(); });
    await h.page.waitForFunction(() => window.__cafe?.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 60000, arg = null) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const frames = (n) => page.evaluate((n) => new Promise((ok) => { const info = window.__cafe.world.renderer.info.render; const t0 = info.frame + n; const t = setInterval(() => { if (info.frame >= t0) { clearInterval(t); ok(); } }, 8); }), n);
const Q = { x: 0, y: 0, z: 0, w: 1 };
const handTo = (hand, p) => send('set_transform', { device: `hand-${hand}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const pinch = (v) => send('set_select_value', { device: 'hand-right', value: v });
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const AWAY = [-0.3, 0.9, -0.1];

await handTo('left', [-1.4, 0.4, 0.9]);
await handTo('right', AWAY);
await page.evaluate(() => { const g = window.__cafe.game; g.save.tips = ['goal', 'table', 'shop', 'dirty', 'hurry', 'pair']; g.save.tutorialDone = true; g.click('open'); });
await until(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving);
await page.evaluate(() => window.__cafe.game.click('skip'));
await until(() => window.__cafe.game.phase === 'run');
await page.evaluate(() => { const { guests } = window.__cafe; guests.patienceFrozen = true; guests.spawnSeconds = [1, 1.5]; });
await until(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 2, 120000);
// The scene: table 2's seats, one dirty and one taken (the café opens with tables 2 and 8; table 6 stays locked).
const plan = await page.evaluate(() => {
  const { guests, mess, system, baristas } = window.__cafe;
  guests.arrivals = false;
  // The staff stand still (nobody cleans the dirty seat or serves the seated guest away) while the tags are looked at.
  baristas.serving = false;
  const at2 = guests.seats.filter((s) => s.table === 2);
  const sitter = guests.line.filter((g) => g.state === 'queued')[1];
  guests.seatGuest(sitter.id, at2[1].index);
  mess.soilSeat(at2[0]);
  const locked = guests.seats.find((s) => s.table === 6);
  const free = guests.seats.find((s) => s.table === 8 && s.occupant === 0 && !s.dirty);
  const w = (s) => system.cafe.localToWorld(s.position.clone()).toArray();
  return { dirty: { index: at2[0].index, at: w(at2[0]) }, taken: { index: at2[1].index, at: w(at2[1]) }, locked: { index: locked.index, at: w(locked) }, free: { index: free.index, at: w(free) }, scale: system.cafe.scale.x };
});
await page.waitForTimeout(2500);
await page.evaluate(async () => { const { HANDS } = await import('/src/lib/hand-pinch.ts'); window.__rightHand = HANDS.indexOf('right'); });
const st = () => page.evaluate(() => {
  const { guests, system, hold, sound } = window.__cafe;
  const V = system.cafe.position.constructor;
  const g = guests.line.find((x) => x.state === 'queued');
  // The right hand's slot (the order of HANDS, lib/hand-pinch.ts).
  const i = window.__rightHand;
  const tag = guests.seatTags[i];
  const r = guests.refusals[i];
  return {
    grip: g ? g.actor.grip.getWorldPosition(new V()).toArray() : null, pinch: hold.pinch.right.point.toArray(),
    held: guests.guests.find((x) => x.state === 'held')?.id ?? null,
    refusal: r ? { seat: r.seat.index, why: r.why } : null,
    tag: tag.card.panel.open ? tag.card.drawn : null, aimed: guests.aimedSeats, refused: guests.refusedSeats,
    sounds: { aimed: sound.played.aimed ?? 0, refuse: sound.played.refuse ?? 0 },
  };
});
// Where the pinch sits from the hand's pose, then pick up the head of the line.
await pinch(1); await frames(3);
const offset = add((await st()).pinch, AWAY, -1);
await pinch(0); await frames(2);
const pinchTo = (p) => handTo('right', add(p, offset, -1));
const first = await st();
await pinchTo(add(first.grip, [0, 0.05, 0])); await frames(2);
await pinchTo(first.grip); await frames(2);
await pinch(1); await frames(4);
const heldId = (await st()).held;
/** Carry the guest low over a seat (its grip a few cm above the seat, as a player sets one down). */
const over = async (seat) => {
  const from = (await st()).pinch;
  const to = add(seat.at, [0, 0.042 * plan.scale + 0.035, 0]);
  const high = add(from, [0, 0.08, 0]);
  for (let i = 1; i <= 6; i++) { await pinchTo(add(from, add(high, from, -1), i / 6)); await frames(1); }
  const top = add(to, [0, 0.08, 0]);
  for (let i = 1; i <= 8; i++) { await pinchTo(add(high, add(top, high, -1), i / 8)); await frames(1); }
  for (let i = 1; i <= 4; i++) { await pinchTo(add(top, add(to, top, -1), i / 4)); await frames(1); }
  await frames(8);
};

await over(plan.dirty);
let s = await st();
check('held over a dirty seat: "Dirty", staff will clean it, over that seat', !!heldId && s.refusal?.why === 'dirty' && s.refusal.seat === plan.dirty.index && s.tag === 'Dirty|Staff will clean it', JSON.stringify(s));
await h.screenshot('artifacts/seat-tag-1-dirty.png');

await over(plan.locked);
s = await st();
const price = await page.evaluate(() => window.__cafe.shop.tablePrice);
check('held over a locked table: "Locked", open tables in the Shop', s.refusal?.why === 'locked' && s.refusal.seat === plan.locked.index && s.tag === 'Locked|Open tables in the Shop', JSON.stringify({ ...s, price }));
await h.screenshot('artifacts/seat-tag-2-locked.png');

await over(plan.taken);
s = await st();
check('held over a taken seat: "Taken"', s.refusal?.why === 'taken' && s.refusal.seat === plan.taken.index && s.tag === 'Taken|Someone sits here', JSON.stringify(s));
await h.screenshot('artifacts/seat-tag-3-taken.png');

const aimedBefore = s.aimed;
await over(plan.free);
s = await st();
check('held over a free seat: no tag, and a soft tick from that seat', s.refusal === null && s.tag === null && s.aimed > aimedBefore && s.sounds.aimed >= 1, JSON.stringify(s));

// 5. Let go over the dirty seat: back to the line, the "uh-uh", the tag a moment longer.
await over(plan.dirty);
const refusedBefore = (await st()).refused;
await pinch(0);
await frames(2);
s = await st();
const back = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state, heldId);
check('let go over the dirty seat: back to the line, the "uh-uh" plays, the tag stays a moment', (back === 'hop' || back === 'queued') && s.refused === refusedBefore + 1 && s.sounds.refuse >= 1 && s.tag === 'Dirty|Staff will clean it', JSON.stringify({ back, ...s }));
// Then it goes (its 1.5 s are counted in the page's frames, which the emulator runs slower than real time).
const gone = await until((i) => !window.__cafe.guests.seatTags[i].card.panel.open, 15000, await page.evaluate(() => window.__rightHand));
check('then the tag goes', gone, `gone ${gone}`);

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
