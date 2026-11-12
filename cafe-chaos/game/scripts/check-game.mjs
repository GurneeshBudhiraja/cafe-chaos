/**
 * Game check: the evening around the café, in the real game (not test
 * mode), with a fresh save. With the viewer seated at the emulated table
 * it checks that:
 * 1. once the café is down, the title card shows, nobody arrives, and the
 *    café opens with one server;
 * 2. a hand over "Open the café" lights it and a pinch on it starts the
 *    walkthrough (the first time);
 * 3. the walkthrough: a guest walks up with its patience held; picking it
 *    up and seating it (real pinches) move the coach card on; the server
 *    brings its tea; the last step opens the café for a shift with the
 *    scoreboard and the clock;
 * 4. scoring: the walkthrough guest, seated quickly, pays the top tip and
 *    leaves a thumbs up and its coins;
 * 5. a seated guest whose food never comes fumes (cross face, vein mark)
 *    and storms out: a thumbs down, happiness and coins lost;
 * 6. the shop: a plaque the bank cannot pay for is refused with a shake;
 *    with the money, a server is hired (two on the staff) and the annex
 *    bought, after which the next server's plaque appears;
 * 7. closing time shows the night's card and saves the bank and what was
 *    bought; Next shift opens again with nobody about;
 * 8. happiness at zero closes the café early;
 * 9. no console errors.
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
const frames = (n) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const info = window.__cafe.world.renderer.info.render;
        const target = info.frame + n;
        const t = setInterval(() => {
          if (info.frame >= target) {
            clearInterval(t);
            resolve();
          }
        }, 8);
      }),
    n,
  );
// The pinch point sits at a fixed offset from the emulated hand: measure it once, away from everything.
const AWAY = [-0.3, 0.9, -0.1];
await handTo(AWAY);
await pinch(1);
await frames(3);
const offset = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
await pinch(0);
await frames(3);
// The open hand's point (between the thumb and forefinger tips) sits elsewhere: measured too, for hovering.
const openOffset = (await page.evaluate(() => window.__cafe.hold.pinch.right.point.toArray())).map((v, i) => v - AWAY[i]);
const openAt = (p) => handTo(p.map((v, i) => v - openOffset[i]));
const pinchAt = (p) => handTo(p.map((v, i) => v - offset[i]));
/** World position of a button's centre on a panel. */
const buttonAt = (panel, id) =>
  page.evaluate(
    ([panel, id]) => {
      const p = window.__cafe.game[panel];
      const b = p.buttons.find((x) => x.id === id);
      const g = p.mesh.geometry.parameters;
      const V = p.mesh.position.constructor;
      return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, 0.004)).toArray();
    },
    [panel, id],
  );
const state = () =>
  page.evaluate(() => {
    const { game, guests, baristas, score, unlocks } = window.__cafe;
    return {
      phase: game.phase, step: game.step, card: game.card.open, coach: game.coach.open, board: score.board.open,
      arrived: guests.arrived, onStage: guests.guests.length, staff: baristas.staff.length, staffSize: baristas.staffSize,
      bank: score.bank, happiness: score.happiness, up: score.up, down: score.down, clock: game.clock, log: score.log,
      popups: { ...guests.popups.shown }, owned: [...unlocks.owned], plaques: [...unlocks.plaques.keys()], refused: unlocks.refused,
    };
  });

// 1. The title.
await until(() => window.__cafe.game.phase === 'title');
await page.waitForTimeout(6000);
await until(() => window.__cafe.baristas.staff.length >= 1);
let s = await state();
check('the title card shows once the café is down, and nobody comes', s.phase === 'title' && s.card && !s.board && s.arrived === 0, `phase ${s.phase}, card ${s.card}, board ${s.board}, arrived ${s.arrived}`);
check('the café opens with one server', s.staff === 1 && s.staffSize === 1, `staff ${s.staff} (size ${s.staffSize})`);
await h.screenshot('artifacts/game-title.png');

// 2. A real pinch on "Open the café".
const open = await buttonAt('card', 'open');
await openAt(open);
await frames(3);
const lit = await page.evaluate(() => window.__cafe.game.card.hover);
await pinchAt(open);
await frames(2);
await pinch(1);
await frames(3);
await pinch(0);
await pinchAt(AWAY);
await until(() => window.__cafe.game.phase === 'tutorial', null, 15000);
s = await state();
check('a hand over the button lights it, and a pinch on it starts the walkthrough', lit === 'open' && s.phase === 'tutorial' && s.coach, `hovered ${lit}, phase ${s.phase}, coach ${s.coach}`);

// 3. The walkthrough: the guest at the gate, picked up and seated with real pinches.
await until(() => window.__cafe.guests.guests.some((g) => g.state === 'queued'), null, 120000);
const patienceBefore = await page.evaluate(() => window.__cafe.guests.guests[0].patience);
await page.waitForTimeout(4000);
const patienceAfter = await page.evaluate(() => window.__cafe.guests.guests[0].patience);
check('the walkthrough guest waits at the gate with its patience held', patienceAfter === patienceBefore, `patience ${patienceBefore.toFixed(2)} -> ${patienceAfter.toFixed(2)}`);
await h.screenshot('artifacts/game-walkthrough.png');
const grip = await page.evaluate(() => window.__cafe.guests.guests[0].actor.grip.getWorldPosition(new window.__cafe.system.cafe.position.constructor()).toArray());
await pinchAt(grip);
await frames(3);
await pinch(1);
await until(() => window.__cafe.guests.pickedUp >= 1, null, 20000);
await until(() => window.__cafe.game.step === 1, null, 20000);
const step1 = (await state()).step;
// Over a free seat in the front row, a little above it, and let go.
const over = await page.evaluate(() => {
  const { guests, system } = window.__cafe;
  const seat = guests.seats.find((x) => x.occupant === 0 && x.position.z > 0.05) ?? guests.seats.find((x) => x.occupant === 0);
  const p = seat.position.clone();
  p.y += 0.06;
  return system.cafe.localToWorld(p).toArray();
});
await pinchAt(over);
await frames(25);
await pinch(0);
await pinchAt(AWAY);
await until(() => window.__cafe.guests.seated >= 1, null, 20000);
await until(() => window.__cafe.game.step === 2, null, 20000);
s = await state();
check('picking the guest up and seating it move the coach card on', step1 === 1 && s.step === 2, `step after pick-up ${step1}, after seating ${s.step}`);
// The one server brings the tea, which moves the walkthrough on by itself.
const served = await until(() => window.__cafe.game.step === 3, null, 180000);
check('the server brings the walkthrough guest its tea', served, `step ${(await state()).step}, served ${await page.evaluate(() => window.__cafe.baristas.servedCount)}`);
await page.evaluate(() => {
  window.__cafe.game.click('next');
});
await until(() => window.__cafe.game.step === 4, null, 10000);
await h.screenshot('artifacts/game-walkthrough-shop.png');
await page.evaluate(() => {
  window.__cafe.game.click('start');
  // From here (the shift, so it is scored) guests eat quickly and nobody in the line gives up, so each outcome below is the one asked for.
  window.__cafe.guests.seatedSeconds = 8;
  window.__cafe.guests.patienceSeconds = 100000;
});
s = await state();
check('the last step opens the café: a shift, the scoreboard and the clock', s.phase === 'shift' && s.board && !s.coach && s.clock > 230, `phase ${s.phase}, board ${s.board}, coach ${s.coach}, clock ${s.clock.toFixed(0)}`);

// 4. The walkthrough guest, seated quickly, pays the top tip.
await until(() => window.__cafe.score.log.some((e) => e.kind === 'paid'), null, 120000);
s = await state();
const paid = s.log.find((e) => e.kind === 'paid');
check('a guest seated quickly pays the top tip, with a thumbs up and coins', paid?.tier === 'quick' && paid.coins === 12 && s.up === 1 && s.bank === 12 && s.popups.up >= 1 && s.popups.coins >= 1,
  `tier ${paid?.tier}, coins ${paid?.coins}, bank ${s.bank}, up ${s.up}, popups ${JSON.stringify(s.popups)}`);
await h.screenshot('artifacts/game-paid.png');

// 5. A guest whose food never comes storms out.
await until(() => window.__cafe.guests.line.some((g) => g.state === 'queued'), null, 120000);
await page.evaluate(() => {
  const { guests, baristas } = window.__cafe;
  baristas.serving = false;
  guests.arrivals = false;
});
const happyBefore = (await state()).happiness;
const fumer = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const g = guests.line.find((x) => x.state === 'queued');
  const seat = guests.seats.find((x) => x.occupant === 0);
  guests.seatGuest(g.id, seat.index);
  return g.id;
});
await until((id) => window.__cafe.guests.guests.find((g) => g.id === id)?.state === 'seated', fumer, 120000);
await page.evaluate((id) => (window.__cafe.guests.guests.find((g) => g.id === id).patience = 0.5), fumer);
await until((id) => (window.__cafe.guests.guests.find((g) => g.id === id)?.fuming ?? -1) >= 0, fumer, 120000);
const fuming = await page.evaluate((id) => {
  const g = window.__cafe.guests.guests.find((x) => x.id === id);
  return { clip: g.actor.clip, anger: !!g.anger };
}, fumer);
await h.screenshot('artifacts/game-fuming.png');
await until(() => window.__cafe.score.log.some((e) => e.kind === 'stormedOff'), null, 120000);
s = await state();
const stormed = s.log.find((e) => e.kind === 'stormedOff');
check('a guest kept waiting for its food fumes, then storms out: thumbs down, happiness and coins lost',
  fuming.clip === 'SitUnhappy' && fuming.anger && s.down === 1 && stormed?.happiness === -13 && stormed.coins === -4 && s.happiness <= happyBefore - 13 && s.popups.anger >= 1 && s.popups.down >= 1,
  `clip ${fuming.clip}, vein mark ${fuming.anger}, down ${s.down}, happiness ${happyBefore} -> ${s.happiness}, coins ${stormed?.coins}`);
await page.evaluate(() => (window.__cafe.baristas.serving = true));

// 6. The shop.
const refused = await page.evaluate(() => window.__cafe.unlocks.press('annex'));
s = await state();
check('a plaque the bank cannot pay for is refused', refused === false && s.refused === 1 && !s.owned.includes('annex'), `bank ${s.bank}, refused ${s.refused}, owned ${JSON.stringify(s.owned)}`);
await page.evaluate(() => (window.__cafe.score.bank = 300));
const hired = await page.evaluate(() => window.__cafe.unlocks.press('server2'));
await until(() => window.__cafe.baristas.staff.length === 2, null, 30000);
s = await state();
check('with the money, a second server is hired', hired && s.staff === 2 && s.bank === 270, `hired ${hired}, staff ${s.staff}, bank ${s.bank}`);
const before3 = s.plaques.includes('server3');
await page.evaluate(() => window.__cafe.unlocks.press('annex'));
await until(() => window.__cafe.unlocks.plaques.has('server3'), null, 30000);
s = await state();
check('buying the annex puts out the next server\'s plaque', !before3 && s.owned.includes('annex') && s.plaques.includes('server3') && s.bank === 190, `server3 before ${before3}, after ${s.plaques.includes('server3')}, bank ${s.bank}`);
await until(() => window.__cafe.system.annexOpen, null, 60000);
await h.screenshot('artifacts/game-shop.png');

// 7. Closing time, and the save.
await page.evaluate(() => (window.__cafe.game.clock = 0.5));
await until(() => window.__cafe.game.phase === 'closed', null, 20000);
s = await state();
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cafe-chaos/save/v1') ?? 'null'));
check('closing time shows the night\'s card and saves the bank and what was bought', s.card && saved?.bank === s.bank && saved.owned.includes('annex') && saved.owned.includes('server2') && saved.tutorialDone === true,
  `card ${s.card}, saved ${JSON.stringify(saved)}`);
await h.screenshot('artifacts/game-closed.png');
// Read in the same breath as the press: the first guest of the new shift is on its way a moment later.
const onStageAtOnce = await page.evaluate(() => {
  window.__cafe.game.click('again');
  return window.__cafe.guests.guests.length;
});
s = await state();
check('Next shift opens again with nobody about', s.phase === 'shift' && onStageAtOnce === 0 && s.up === 0 && s.happiness === 100, `phase ${s.phase}, on stage ${onStageAtOnce}, happiness ${s.happiness}`);

// 8. Happiness at zero closes the café early.
await page.evaluate(() => (window.__cafe.score.happiness = 0));
await until(() => window.__cafe.game.phase === 'closed', null, 20000);
const early = await page.evaluate(() => window.__cafe.game.endedEarly);
check('happiness at zero closes the café early', early === true, `ended early ${early}`);

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
