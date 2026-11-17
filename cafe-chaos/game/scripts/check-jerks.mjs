/**
 * Quick jerks check: with everything around the café on show at once (the
 * bar, a note under it, the padlock tags, a guest carried with its wishes
 * card and a seat tag, then the shop drawer), the head and the hand are
 * thrown about the way a player's are, and every frame each of those is
 * measured in the page:
 *  1. head turns of 40 to 80 degrees in about a tenth of a second (300 to
 *     700 degrees a second), pitches of 30 degrees, and 20 cm lurches:
 *     nothing jumps (the world-locked labels move under 2 cm a frame, the
 *     bar, which follows the eyes' height, eased), nothing goes broken
 *     (NaN), nothing comes within 20 cm of the eyes, and once the head
 *     stops every label faces the eyes again (under 10 degrees) within
 *     half a second;
 *  2. the carrying hand thrown 30 cm a frame back and forth: the guest
 *     stays in the hand and follows;
 *  3. the hand lost to the tracking for a moment (0.25 s): the guest waits
 *     and is carried on; lost for longer (1 s): it is let go, gently;
 *  4. the shop drawer through the same head jerks: it stays with the bar;
 *  5. no console errors.
 * It records artifacts/jerks.mp4 to look at.
 * Usage: dev server running, then `node scripts/check-jerks.mjs`.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  size: { width: 1100, height: 760 },
  record: 'jerks',
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
await page.evaluate(() => { const { guests, baristas } = window.__cafe; guests.patienceFrozen = true; guests.spawnSeconds = [1, 1.5]; baristas.serving = false; });
await until(() => window.__cafe.guests.line.filter((g) => g.state === 'queued' && !g.walk).length >= 2, 120000);
// Everything up: a dirty seat to hold a guest over (its tag), the padlocks affordable, and a note under the bar.
const scene = await page.evaluate(() => {
  const { guests, mess, system, score, game } = window.__cafe;
  guests.arrivals = false;
  const dirty = guests.seats.find((s) => s.table === 2);
  mess.soilSeat(dirty);
  score.bank = 20;
  game.addNote('Stress test', 'goal', 60);
  return { dirty: system.cafe.localToWorld(dirty.position.clone()).toArray(), scale: system.cafe.scale.x };
});

// The sampler: every frame, each label's world position and facing against the eyes.
await page.evaluate(() => {
  const c = window.__cafe;
  const V = c.game.head.constructor;
  const named = () => {
    const out = [['bar', c.strip.panel], ['note', c.game.note.panel], ['drawer', c.strip.drawer.panel]];
    c.game.tags.forEach((t) => out.push([`tag-${t.table}`, t.panel]));
    c.guests.seatTags.forEach((t, i) => out.push([`seatTag-${i}`, t.card.panel]));
    c.guests.cards.cards.forEach((card, i) => out.push([`wishCard-${i}`, { mesh: card.mesh, open: card.mesh.visible }]));
    return out;
  };
  const stats = {};
  const last = {};
  window.__jerk = { stats, frames: 0, worstFrameMs: 0, held: [] };
  let t0 = performance.now();
  const head = new V();
  const pos = new V();
  const fwd = new V();
  const to = new V();
  const tick = () => {
    const now = performance.now();
    window.__jerk.worstFrameMs = Math.max(window.__jerk.worstFrameMs, now - t0);
    t0 = now;
    window.__jerk.frames++;
    c.world.camera.getWorldPosition(head);
    for (const [name, p] of named()) {
      const mesh = p.mesh;
      const shown = (p.open ?? true) && mesh.visible && mesh.parent;
      if (!shown) { delete last[name]; continue; }
      mesh.updateWorldMatrix(true, false);
      mesh.getWorldPosition(pos);
      const s = (stats[name] ??= { maxJump: 0, nan: false, nearest: Infinity, facing: 0, frames: 0 });
      s.frames++;
      if (!Number.isFinite(pos.x + pos.y + pos.z)) s.nan = true;
      if (last[name]) s.maxJump = Math.max(s.maxJump, pos.distanceTo(last[name]));
      last[name] = (last[name] ?? new V()).copy(pos);
      s.nearest = Math.min(s.nearest, pos.distanceTo(head));
      fwd.set(0, 0, 1).transformDirection(mesh.matrixWorld);
      to.copy(head).sub(pos).normalize();
      s.facing = (Math.acos(Math.max(-1, Math.min(1, fwd.dot(to)))) * 180) / Math.PI;
    }
    const held = c.guests.guests.find((g) => g.state === 'held');
    window.__jerk.holding = held ? held.id : null;
    requestAnimationFrame(tick);
  };
  tick();
});
const take = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__jerk)));
const reset = () => page.evaluate(() => { const j = window.__jerk; for (const k of Object.keys(j.stats)) delete j.stats[k]; j.worstFrameMs = 0; j.frames = 0; });

// Pick the head of the line up and hold it low over the dirty seat (its tag shows).
const st = () => page.evaluate(() => {
  const { guests, system, hold } = window.__cafe;
  const V = system.cafe.position.constructor;
  const g = guests.line.find((x) => x.state === 'queued');
  return { grip: g ? g.actor.grip.getWorldPosition(new V()).toArray() : null, pinch: hold.pinch.right.point.toArray(), held: guests.guests.find((x) => x.state === 'held')?.id ?? null };
});
await pinch(1); await frames(3);
const offset = add((await st()).pinch, AWAY, -1);
await pinch(0); await frames(2);
const pinchTo = (p) => handTo('right', add(p, offset, -1));
const first = await st();
await pinchTo(add(first.grip, [0, 0.05, 0])); await frames(2);
await pinchTo(first.grip); await frames(2);
await pinch(1); await frames(4);
const over = add(scene.dirty, [0, 0.042 * scene.scale + 0.035, 0]);
const high = add(first.grip, [0, 0.1, 0]);
for (let i = 1; i <= 8; i++) { await pinchTo(add(high, add(add(over, [0, 0.06, 0]), high, -1), i / 8)); await frames(1); }
await pinchTo(over); await frames(8);
const ready = await page.evaluate(() => ({ held: window.__cafe.guests.guests.some((g) => g.state === 'held'), tag: window.__cafe.guests.seatTags.some((t) => t.card.panel.open), note: window.__cafe.game.note.panel.open, tags: window.__cafe.game.tags.filter((t) => t.panel.open).length }));
check('everything up at once: a guest held over a dirty seat (its tag), the note under the bar, the padlocks', ready.held && ready.tag && ready.note && ready.tags > 0, JSON.stringify(ready));

/** Head jerks: fast turns, pitches and lurches, then still. Returns the stats over the jerks and the facing half a second after. */
const LOOKS = (() => {
  const d = [LOOK.x - SEAT.x, LOOK.y - SEAT.y, LOOK.z - SEAT.z];
  const yaw = (deg) => { const r = (deg * Math.PI) / 180; return { x: SEAT.x + d[0] * Math.cos(r) - d[2] * Math.sin(r), y: LOOK.y, z: SEAT.z + d[0] * Math.sin(r) + d[2] * Math.cos(r) }; };
  return { yaw, pitch: (dy) => ({ x: LOOK.x, y: LOOK.y + dy, z: LOOK.z }) };
})();
const jerkHead = async () => {
  const moves = [
    [SEAT, LOOKS.yaw(40), 110], [SEAT, LOOKS.yaw(-40), 120], [SEAT, LOOKS.yaw(0), 90],
    [SEAT, LOOKS.pitch(0.35), 100], [SEAT, LOOKS.pitch(-0.25), 100], [SEAT, LOOK, 90],
    [{ x: SEAT.x - 0.2, y: SEAT.y - 0.05, z: SEAT.z }, LOOK, 120], [SEAT, LOOK, 120],
    [{ x: SEAT.x, y: SEAT.y, z: SEAT.z + 0.2 }, LOOKS.yaw(25), 100], [SEAT, LOOK, 100],
  ];
  for (const [p, l, ms] of moves) await h.head(p, l, ms);
};

// 1. Head jerks with everything up.
await reset();
await jerkHead();
const during = await take();
await page.waitForTimeout(500);
await frames(10);
const settled = await take();
const world = Object.entries(during.stats).filter(([n]) => n !== 'bar' && n !== 'drawer' && !n.startsWith('wishCard'));
const worstJump = world.reduce((a, [n, s]) => (s.maxJump > a.v ? { n, v: s.maxJump } : a), { n: '', v: 0 });
const broken = Object.entries(during.stats).filter(([, s]) => s.nan).map(([n]) => n);
const tooNear = Object.entries(during.stats).filter(([, s]) => s.nearest < 0.2).map(([n, s]) => `${n} ${s.nearest.toFixed(2)}`);
check('head jerks: no world-locked label jumps (under 2 cm a frame), none broken, none within 20 cm of the eyes', worstJump.v < 0.02 && !broken.length && !tooNear.length, JSON.stringify({ worstJump: { ...worstJump, v: +(worstJump.v * 100).toFixed(2) + ' cm' }, broken, tooNear, frames: during.frames }));
check('the bar follows the eyes eased, never jumping (under 3 cm a frame)', (during.stats.bar?.maxJump ?? 0) < 0.03, `${((during.stats.bar?.maxJump ?? 0) * 100).toFixed(2)} cm`);
const facing = Object.entries(settled.stats).filter(([n]) => !n.startsWith('wishCard')).map(([n, s]) => [n, +s.facing.toFixed(1)]);
const off = facing.filter(([, f]) => f > 10);
check('half a second after the head stops every label faces the eyes again (under 10 degrees)', off.length === 0, JSON.stringify(off.length ? off : facing.slice(0, 6)));
check('the guest is still in the hand after the head jerks', settled.holding !== null, `holding ${settled.holding}`);

// 2. The carrying hand thrown about: 30 cm a frame, back and forth.
await reset();
for (let k = 0; k < 8; k++) { await pinchTo(add(over, [k % 2 ? 0.3 : -0.3, 0.12, k % 2 ? -0.1 : 0.1])); await frames(1); }
await pinchTo(add(over, [0, 0.1, 0])); await frames(10);
const thrown = await take();
const follows = await page.evaluate(() => { const { guests, hold, system } = window.__cafe; const g = guests.guests.find((x) => x.state === 'held'); const V = system.cafe.position.constructor; return g ? +g.actor.grip.getWorldPosition(new V()).distanceTo(hold.pinch.right.point).toFixed(3) : null; });
check('the carrying hand thrown 30 cm a frame: the guest stays in it and follows (back at the pinch within 10 frames)', thrown.holding !== null && follows !== null && follows < 0.05, JSON.stringify({ holding: thrown.holding, gripFromPinch: follows }));

// 3. The hand lost to the tracking: a moment (0.25 s) and it carries on; longer (1 s) and the guest is let go.
await send('set_connected', { device: 'hand-right', connected: false });
await page.waitForTimeout(250);
await send('set_connected', { device: 'hand-right', connected: true });
await pinch(1);
await frames(6);
const short = await take();
check('the hand lost for a moment (0.25 s) and back pinching: still carrying the guest', short.holding !== null, `holding ${short.holding}`);
await send('set_connected', { device: 'hand-right', connected: false });
await page.waitForTimeout(1000);
const long = await take();
await send('set_connected', { device: 'hand-right', connected: true });
const where = await page.evaluate((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state, short.holding);
check('the hand lost for a second: the guest is let go gently (back to its place, hopping)', long.holding === null && (where === 'hop' || where === 'queued' || where === 'seated'), JSON.stringify({ holding: long.holding, state: where }));
await pinch(0);
await handTo('right', AWAY);
await frames(6);

// 4. The shop drawer through the same jerks.
await page.evaluate(() => window.__cafe.game.click('bar-shop'));
await until(() => window.__cafe.strip.drawer.panel.open && window.__cafe.game.phase === 'shopping', 10000);
await page.waitForTimeout(600);
await reset();
await jerkHead();
const shop = await take();
await page.waitForTimeout(500);
await frames(10);
const shopSettled = await take();
const gap = await page.evaluate(() => { const { strip } = window.__cafe; const V = strip.panel.mesh.position.constructor; return +strip.panel.mesh.getWorldPosition(new V()).distanceTo(strip.drawer.panel.mesh.getWorldPosition(new V())).toFixed(3); });
check('the shop drawer through the head jerks: it stays with the bar (no jump over 3 cm a frame), faces the eyes again after', (shop.stats.drawer?.maxJump ?? 1) < 0.03 && gap < 0.2 && (shopSettled.stats.drawer?.facing ?? 99) < 10, JSON.stringify({ jump: +((shop.stats.drawer?.maxJump ?? 0) * 100).toFixed(2) + ' cm', barToDrawer: gap, facing: +(shopSettled.stats.drawer?.facing ?? -1).toFixed(1) }));
await page.evaluate(() => window.__cafe.game.click('shop-close'));
console.log(`(slowest frame ${during.worstFrameMs.toFixed(0)} ms in the emulator's software rendering; not the headset's frame rate)`);

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
