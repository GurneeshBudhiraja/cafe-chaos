/**
 * Game check: the evening around the café, in the real game (not test
 * mode), with a fresh save. With the viewer seated at the emulated table
 * it checks that:
 * 1. once the café is placed, the start card shows (the café waits, hidden),
 *    nobody arrives, and the café has one server;
 * 2. a fingertip pushed through "Open the café" starts the first run;
 * 3. the first run: a guest waits with its patience held; picking it up
 *    and seating it (real pinches) move the coach card on; the server
 *    brings its tea, and the café opens: the run, the clock at 0:00;
 * 4. the clock counts up, and the pace builds with it;
 * 5. the first run's guest, seated quickly, pays the top tip;
 * 6. a seated guest whose food never comes fumes and storms out: a
 *    thumbs down and happiness lost, the bank untouched; and the server
 *    is not left frozen beside it;
 * 7. hiring: refused while the bank is short; with the money a server is
 *    hired, the price taken, and it is saved;
 * 8. Pause stops the clock and the café; Resume carries on;
 * 9. happiness at zero closes the café: the card, the record and the
 *    staff saved; Play again starts at 0:00 with nobody about.
 *
 * Usage: dev server running, then `node scripts/check-game.mjs`.
 * Output: artifacts/game-*.png, and a pass/fail line.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 30000 });
  },
});
const { page } = h;
const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 250 }).then(() => true, () => false);
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const Q = { x: 0, y: 0, z: 0, w: 1 };
const handTo = (p) => send('set_transform', { device: 'hand-right', position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });
const pinch = (value) => send('set_select_value', { device: 'hand-right', value });
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);

// The emulated hand's pinch point (closed) and index fingertip sit at fixed offsets from it: measured once.
const AWAY = [-0.9, 1.05, 0.7];
await handTo(AWAY);
await pinch(1);
await frames(3);
const offset = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
await pinch(0);
await frames(3);
const tipOffset = (await page.evaluate(() => window.__cafe.hold.tip.right.point.toArray())).map((v, i) => v - AWAY[i]);
const pinchAt = (p) => handTo(p.map((v, i) => v - offset[i]));
const tipTo = (p) => handTo(p.map((v, i) => v - tipOffset[i]));
/** A point `out` metres in front of a button on one of the game's cards ('card', 'coach') or the pause button ('tab'). */
const buttonAt = (panel, id, out) =>
  page.evaluate(([panel, id, out]) => {
    const p = (panel === 'menu' ? window.__cafe.game.menu.card : window.__cafe.game[panel]);
    const b = p.buttons.find((x) => x.id === id);
    const g = p.mesh.geometry.parameters;
    const V = p.mesh.position.constructor;
    const s = p.mesh.getWorldScale(new V()).z;
    return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, out / s)).toArray();
  }, [panel, id, out]);
/** Push the index fingertip through a button and draw it back. */
async function poke(panel, id) {
  await tipTo(await buttonAt(panel, id, 0.04));
  await frames(3);
  const lit = await page.evaluate(([panel]) => ((panel === 'menu' ? window.__cafe.game.menu.card : window.__cafe.game[panel])).hover, [panel]);
  await tipTo(await buttonAt(panel, id, -0.004));
  await frames(3);
  await handTo(AWAY);
  await frames(2);
  return lit;
}
const state = () =>
  page.evaluate(() => {
    const { game, guests, baristas, score, shop, strip } = window.__cafe;
    return {
      phase: game.phase, step: game.step, card: game.card.open || game.menu.card.open, coach: game.coach.open, board: strip.panel.open, live: strip.live,
      arrived: guests.arrived, onStage: guests.guests.length, staff: baristas.staff.length, hires: shop.hires, price: shop.price,
      bank: score.bank, happiness: score.happiness, up: score.up, down: score.down, clock: game.clock, log: score.log,
      popups: { ...guests.popups.shown }, refused: shop.refused, pace: guests.spawnPace, patience: guests.patienceSeconds,
    };
  });

// 1. The title.
await until(() => window.__cafe.game.phase === 'title');
await page.waitForTimeout(3000);
let s = await state();
const waiting = await page.evaluate(() => ({ waiting: window.__cafe.system.waiting, visible: window.__cafe.system.cafe.visible }));
check('the start card shows at the table; the café waits hidden, no scoreboard, nobody comes', s.phase === 'title' && s.card && !s.board && waiting.waiting && !waiting.visible && s.arrived === 0, `phase ${s.phase}, card ${s.card}, board ${s.board}, ${JSON.stringify(waiting)}, arrived ${s.arrived}`);
check('the café has one server', s.staff === 1 && s.hires === 0 && s.price === 60, `staff ${s.staff}, next costs ${s.price}`);
await h.screenshot('artifacts/game-title.png');

// 2. A fingertip on "Open the café".
const lit = await poke('menu', 'new');
await until(() => window.__cafe.game.phase === 'tutorial', null, 15000);
s = await state();
check('a fingertip near NEW GAME on the start card lights it, and pushed through it starts the first run', lit === 'new' && s.phase === 'tutorial' && s.coach, `lit ${lit}, phase ${s.phase}, coach card ${s.coach}`);

// 3. The first run: the guest at the gate, picked up and seated with real pinches.
await until(() => window.__cafe.guests.guests.some((g) => g.state === 'queued'), null, 120000);
const patienceBefore = await page.evaluate(() => window.__cafe.guests.guests[0].patience);
await page.waitForTimeout(4000);
const patienceAfter = await page.evaluate(() => window.__cafe.guests.guests[0].patience);
check('the first guest waits at the gate with its patience held', patienceAfter === patienceBefore, `patience ${patienceBefore.toFixed(2)} -> ${patienceAfter.toFixed(2)}`);
await h.screenshot('artifacts/game-first-run.png');
const grip = await page.evaluate(() => window.__cafe.guests.guests[0].actor.grip.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
await pinchAt(grip);
await frames(3);
await pinch(1);
await until(() => window.__cafe.guests.pickedUp >= 1, null, 20000);
await until(() => window.__cafe.game.step === 1, null, 20000);
const step1 = (await state()).step;
const over = await page.evaluate(() => {
  const { guests, system } = window.__cafe;
  const seat = guests.seats.find((x) => x.occupant === 0 && x.position.z > 0 && Math.abs(x.position.x) < 0.1) ?? guests.seats.find((x) => x.occupant === 0);
  const p = seat.position.clone();
  p.y += 0.06;
  return system.cafe.localToWorld(p).toArray();
});
await pinchAt(over);
await frames(25);
await pinch(0);
await handTo(AWAY);
await until(() => window.__cafe.guests.seated >= 1, null, 30000);
await until(() => window.__cafe.game.step === 2, null, 20000);
s = await state();
check('picking the guest up and seating it move the coach card on', step1 === 1 && s.step === 2, `step after pick-up ${step1}, after seating ${s.step}`);
// The server brings the tea; then the last step teaches the wrist menu (check-wrist.mjs opens it with a palm): Open! starts the run.
const menuStep = await until(() => window.__cafe.game.step === 3, null, 240000);
check('after the tea, the last first-run step teaches the wrist menu', menuStep && (await state()).coach, `step ${(await state()).step}`);
await page.evaluate(() => window.__cafe.game.click('start'));
const opened = await until(() => window.__cafe.game.phase === 'run', null, 20000);
s = await state();
check('Open! starts the run: the clock near 0:00, the coach card away', opened && s.phase === 'run' && !s.coach && s.live && s.clock < 20, `phase ${s.phase}, coach ${s.coach}, clock ${s.clock.toFixed(1)}`);
await page.evaluate(() => {
  // From here guests eat quickly and nobody in the line gives up, so each outcome below is the one asked for.
  window.__cafe.guests.mealSeconds = 4;
  window.__cafe.guests.patienceFrozen = false;
});

// 4. The clock counts up and the pace builds.
const c0 = s.clock;
const p0 = s.pace;
await page.waitForTimeout(6000);
s = await state();
check('the clock counts up, and guests come faster as it does', s.clock > c0 && s.pace < p0, `clock ${c0.toFixed(1)} -> ${s.clock.toFixed(1)}, arrival pace ${p0.toFixed(3)} -> ${s.pace.toFixed(3)}`);

// 5. The first guest, seated quickly, pays the top tip.
await until(() => window.__cafe.score.log.some((e) => e.kind === 'paid'), null, 240000);
s = await state();
const paid = s.log.find((e) => e.kind === 'paid');
check('a guest seated quickly pays the top tip, with a thumbs up and coins', paid?.tier === 'quick' && paid.coins === 12 && s.up === 1 && s.bank === 12 && s.popups.up >= 1 && s.popups.coins >= 1, `tier ${paid?.tier}, coins ${paid?.coins}, bank ${s.bank}, up ${s.up}`);
await h.screenshot('artifacts/game-paid.png');

// 6. A guest whose food never comes storms out.
await until(() => window.__cafe.guests.line.some((g) => g.state === 'queued'), null, 240000);
const before = await state();
const fumer = await page.evaluate(() => {
  const { guests, baristas } = window.__cafe;
  baristas.serving = false;
  guests.arrivals = false;
  guests.patienceFrozen = true;
  const g = guests.line.find((x) => x.state === 'queued');
  const seat = guests.seats.find((x) => x.occupant === 0);
  guests.seatGuest(g.id, seat.index);
  // Watch for the fuming from inside the page: at the emulator's frame time it can come and go between two looks from here.
  window.__fumed = null;
  const watch = setInterval(() => {
    const now = guests.guests.find((x) => x.id === g.id);
    if (!now) return clearInterval(watch);
    if (now.fuming >= 0 && !window.__fumed) window.__fumed = { clip: now.actor.clip, anger: !!now.anger };
  }, 20);
  return g.id;
});
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', fumer, 120000);
await page.evaluate((id) => { window.__cafe.guests.patienceFrozen = false; window.__cafe.guests.guests.find((g) => g.id === id).patience = 0.5; }, fumer);
await until(() => window.__cafe.score.log.some((e) => e.kind === 'stormedOff'), null, 120000);
s = await state();
const fuming = await page.evaluate(() => window.__fumed);
const stormed = s.log.find((e) => e.kind === 'stormedOff');
check('a guest kept waiting for its food fumes, then storms out: a thumbs down and happiness lost, no coins',
  fuming?.clip === 'SitUnhappy' && fuming.anger && s.down === before.down + 1 && stormed?.happiness === -10 && s.bank === before.bank && s.happiness === before.happiness - 10,
  `clip ${fuming?.clip}, vein mark ${fuming?.anger}, happiness ${before.happiness} -> ${s.happiness}, bank ${before.bank} -> ${s.bank}`);
await page.evaluate(() => { window.__cafe.baristas.serving = true; window.__cafe.guests.patienceFrozen = true; });

// 7. Hiring (from the wrist menu; check-wrist.mjs presses it with a fingertip).
await page.evaluate(() => (window.__cafe.score.bank = 20));
await frames(3);
await page.evaluate(() => window.__cafe.game.click('hire'));
await frames(2);
s = await state();
check('Hire is refused while the bank is short', s.refused === 1 && s.staff === 1 && s.bank === 20, `refused ${s.refused}, staff ${s.staff}, bank ${s.bank}`);
await page.evaluate(() => (window.__cafe.score.bank = 100));
await frames(3);
await page.evaluate(() => window.__cafe.game.click('hire'));
await until(() => window.__cafe.baristas.staff.length === 2, null, 60000);
s = await state();
const savedHire = await page.evaluate(() => JSON.parse(localStorage.getItem('cafe-chaos/save/v2') ?? 'null'));
check('with the money a server is hired, the price taken, and it is saved', s.staff === 2 && s.bank === 40 && s.price === 120 && savedHire?.hires === 1 && savedHire.bank === 40, `staff ${s.staff}, bank ${s.bank}, next ${s.price}, saved ${JSON.stringify(savedHire)}`);
await h.screenshot('artifacts/game-hired.png');

// 8. Pause (the pause button beside the pill) and Resume.
await poke('tab', 'tab');
s = await state();
const pausedAt = s.clock;
await page.waitForTimeout(4000);
const stillAt = (await state()).clock;
check('Pause stops the clock', s.phase === 'paused' && s.card && stillAt === pausedAt, `phase ${s.phase}, clock ${pausedAt.toFixed(2)} -> ${stillAt.toFixed(2)}`);
await h.screenshot('artifacts/game-paused.png');
await poke('card', 'resume');
// Resume counts 3, 2, 1 first (on real time), then the café moves again.
await until(() => window.__cafe.game.phase === 'run', null, 60000);
await page.waitForTimeout(3000);
s = await state();
check('Resume carries on', s.phase === 'run' && s.clock > pausedAt, `phase ${s.phase}, clock ${s.clock.toFixed(2)}`);

// 9. Happiness at zero closes the café.
const openFor = s.clock;
await page.evaluate(() => (window.__cafe.score.happiness = 0));
await until(() => window.__cafe.game.phase === 'closed', null, 20000);
s = await state();
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cafe-chaos/save/v2') ?? 'null'));
check('happiness at zero closes the café, and the record and the staff are saved', s.phase === 'closed' && s.card && saved?.bestSeconds >= openFor && saved.hires === 1 && saved.runs === 1 && saved.tutorialDone === true, `phase ${s.phase}, saved ${JSON.stringify(saved)}`);
await h.screenshot('artifacts/game-closed.png');
const again = await page.evaluate(() => {
  window.__cafe.game.click('again');
  const { game, guests, score, baristas } = window.__cafe;
  return { phase: game.phase, clock: game.clock, onStage: guests.guests.length, happiness: score.happiness, staffSize: baristas.staffSize };
});
check('Play again opens at 0:00 with nobody about, the staff kept', again.phase === 'run' && again.clock === 0 && again.onStage === 0 && again.happiness === 100 && again.staffSize === 2, JSON.stringify(again));

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
