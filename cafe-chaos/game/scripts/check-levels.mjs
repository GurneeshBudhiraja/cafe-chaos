/**
 * Levels check, in the real game from the seat (docs/MECHANICS-PLAN.md):
 *  1. a fresh game opens on level 1: the bar shows the level and 0 of 5,
 *     guests come about every 20 s, two at most in the line, 30 s of
 *     patience in the line and 40 s once seated;
 *  2. a guest pays once, 1 to 10 coins: 10 seated at once with every wish
 *     met, 1 seated at the last moment with none, in between otherwise;
 *     one who leaves unhappy pays nothing;
 *  3. each guest served is counted on the bar and saved, so a level left
 *     part-way is carried on from there;
 *  4. the level card waits while a hand carries a guest;
 *  5. the goal met: the café slows to a stop, the level card is up, the
 *     café is hidden behind it, confetti is thrown; the next level, its
 *     bonus and a full happiness are already saved;
 *  6. CONTINUE: the café shows and moves again, at the next level's pace;
 *  7. Pause shows the level; MAIN MENU saves it; the start card offers
 *     CONTINUE at that level, and it carries on with the count it had;
 *  8. happiness at zero: the retry card; TRY AGAIN starts the level from
 *     zero with the coins kept;
 *  9. a guest let go far from any free seat goes back to the line (it
 *     does not fly to a far seat); near a free seat it takes it;
 * 10. an old (v2) save keeps only its settings; no console errors.
 * Usage: dev server running, then `node scripts/check-levels.mjs`.
 * Output: PASS/FAIL lines; artifacts/levels-*.png.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 60000) => page.waitForFunction(fn, null, { timeout, polling: 100 }).then(() => true, () => false);
const state = () => page.evaluate(() => {
  const { game, guests, score, system, strip } = window.__cafe;
  const saved = JSON.parse(localStorage.getItem('cafe-chaos/save/v3') ?? 'null');
  return {
    phase: game.phase, level: game.level, served: game.levelServed, bar: [score.level, score.levelServed, score.levelGoal],
    gap: guests.spawnSeconds.map((v) => +v.toFixed(2)), queue: guests.queueCap, line: guests.patienceSeconds, seated: guests.seatedPatience,
    bank: score.bank, happiness: score.happiness, speed: +system.timeScale.toFixed(2), cafe: system.cafe.visible,
    card: game.menu.card.open ? game.menu.cardKind : null, buttons: game.menu.card.buttons.map((b) => b.id), handsOff: guests.handsOff,
    confetti: strip.celebrations, saved,
  };
});
/** A guest pays (as the game scores it): `share` of its line patience used, `met` of `of` wishes. */
const pay = (share, met, of) => page.evaluate(([share, met, of]) => {
  const { score, system } = window.__cafe;
  const before = score.bank;
  score.score({ kind: 'paid', guest: 0, share, at: new system.cafe.position.constructor(0, 0.1, 0), wishes: { met, of } });
  return score.bank - before;
}, [share, met, of]);
for (const k of ['left', 'right']) await page.evaluate((k) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: `hand-${k}`, position: { x: k === 'left' ? -1.4 : -0.3, y: 0.4, z: 0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }), k);

// 1. A fresh game: level 1.
await page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); });
await until(() => window.__cafe.game.phase === 'run');
let s = await state();
check('a fresh game opens on level 1: the bar shows it, 0 of 5 served', s.level === 1 && s.served === 0 && s.bar.join() === '1,0,5', JSON.stringify({ level: s.level, served: s.served, bar: s.bar }));
check('level 1: a guest about every 20 s, two in the line at most, 30 s in the line, 40 s seated', Math.abs((s.gap[0] + s.gap[1]) / 2 - 20) < 0.5 && s.queue === 2 && s.line === 30 && s.seated === 40, JSON.stringify({ gap: s.gap, queue: s.queue, line: s.line, seated: s.seated }));
await h.screenshot('artifacts/levels-1-level-1.png');

// 2. The pay.
const best = await pay(0, 2, 2);
const worst = await pay(1, 0, 3);
const slowAllMet = await pay(1, 1, 1);
const quickNoneMet = await pay(0, 0, 1);
const half = await pay(0.5, 1, 2);
check('a guest pays once, 1 to 10 coins, by speed and wishes met', best === 10 && worst === 1 && slowAllMet === 6 && quickNoneMet === 5 && half === 6, `quick, all met ${best}; last moment, none met ${worst}; last moment, all met ${slowAllMet}; quick, none met ${quickNoneMet}; half way, half met ${half}`);
const bankBefore = (await state()).bank;
await page.evaluate(() => { const { score, system } = window.__cafe; score.score({ kind: 'stormedOff', guest: 0, share: 0.2, at: new system.cafe.position.constructor(0, 0.1, 0), wishes: { met: 0, of: 1 } }); });
s = await state();
check('a guest who storms out pays nothing and the café is less happy', s.bank === bankBefore && s.happiness < 100, `bank ${bankBefore} -> ${s.bank}, happiness ${s.happiness}`);

// 3. Counted and saved. (Five were paid above: that already met level 1's goal, so start the level again first.)
await until(() => window.__cafe.game.phase === 'levelup' || window.__cafe.game.level === 2, 10000);
await page.evaluate(() => { const { game } = window.__cafe; game.click('level-continue'); game.save.level = 1; game.save.levelServed = 0; game.toRun(true); });
await until(() => window.__cafe.game.level === 1 && window.__cafe.game.levelServed === 0 && window.__cafe.game.phase === 'run' && window.__cafe.system.timeScale === 1);
await pay(0.2, 1, 1);
await pay(0.2, 1, 1);
await until(() => window.__cafe.game.levelServed === 2);
s = await state();
check('each guest served is counted on the bar and saved', s.served === 2 && s.bar.join() === '1,2,5' && s.saved?.level === 1 && s.saved?.levelServed === 2, JSON.stringify({ served: s.served, bar: s.bar, saved: s.saved }));

// 4. The level card waits for empty hands.
// As if a hand were carrying a guest (the real pick-up is in check-seating).
await page.evaluate(() => Object.defineProperty(window.__cafe.guests, 'carrying', { get: () => true, configurable: true }));
await pay(0.2, 1, 1);
await pay(0.2, 1, 1);
await pay(0.2, 1, 1);
await page.waitForTimeout(800);
s = await state();
check('the goal met with a guest in the hand: the level card waits', s.phase === 'run' && s.card === null && s.level === 1, JSON.stringify({ phase: s.phase, card: s.card, level: s.level, served: s.served }));
const before = s;
await page.evaluate(() => { delete window.__cafe.guests.carrying; });

// 5. The level card.
await until(() => window.__cafe.game.phase === 'levelup');
const easing = await state();
await until(() => window.__cafe.game.menu.card.open && window.__cafe.game.menu.cardKind === 'level', 10000);
await page.waitForTimeout(600);
s = await state();
check('the goal met: the café slows to a stop and the level card is up, the café hidden behind it', s.phase === 'levelup' && s.card === 'level' && s.speed === 0 && !s.cafe && s.handsOff && s.buttons.join() === 'level-continue', JSON.stringify({ phase: s.phase, card: s.card, speed: s.speed, cafe: s.cafe, handsOff: s.handsOff, buttons: s.buttons, speedOnTheWay: easing.speed }));
check('level 2 is reached and saved at once: its bonus in the bank, the happiness full, confetti thrown', s.level === 2 && s.served === 0 && s.bank === before.bank + 10 && s.happiness === 100 && s.confetti === before.confetti + 1 && s.saved?.level === 2 && s.saved?.levelServed === 0 && s.saved?.bank === s.bank, JSON.stringify({ level: s.level, served: s.served, bank: [before.bank, s.bank], happiness: s.happiness, confetti: s.confetti, saved: s.saved }));
await h.screenshot('artifacts/levels-2-level-card.png');
// It waits: nothing is timed.
await page.waitForTimeout(3000);
check('the level card waits for CONTINUE (nothing is timed)', (await state()).phase === 'levelup', 'still up after 3 s');

// 6. CONTINUE.
await page.evaluate(() => window.__cafe.game.click('level-continue'));
await until(() => window.__cafe.system.timeScale === 1, 10000);
s = await state();
check('CONTINUE: the café shows and moves again, at level 2 (a guest about every 18 s, 29 s in the line)', s.phase === 'run' && s.cafe && s.speed === 1 && !s.handsOff && s.card === null && Math.abs((s.gap[0] + s.gap[1]) / 2 - 18) < 0.5 && s.line === 29 && s.bar.join() === '2,0,7', JSON.stringify({ phase: s.phase, cafe: s.cafe, speed: s.speed, gap: s.gap, line: s.line, bar: s.bar }));
await h.screenshot('artifacts/levels-3-level-2.png');

// 7. Pause, MAIN MENU, CONTINUE.
await pay(0.2, 1, 1);
await pay(0.2, 1, 1);
await pay(0.2, 1, 1);
await until(() => window.__cafe.game.levelServed === 3);
await page.evaluate(() => window.__cafe.game.click('bar-pause'));
await until(() => window.__cafe.game.phase === 'paused');
s = await state();
check('Pause shows the level card buttons: RESUME, How to play, Settings, MAIN MENU', s.card === 'pause' && s.buttons.join() === 'resume,how,settings,end', JSON.stringify(s.buttons));
await h.screenshot('artifacts/levels-4-paused.png');
await page.evaluate(() => window.__cafe.game.click('end'));
await until(() => window.__cafe.game.phase === 'title');
s = await state();
check('MAIN MENU saves the level as it stands; the start card offers CONTINUE', s.card === 'start' && s.buttons.includes('continue') && s.saved?.level === 2 && s.saved?.levelServed === 3 && s.speed === 1, JSON.stringify({ card: s.card, buttons: s.buttons, saved: s.saved, speed: s.speed }));
await page.waitForTimeout(600);
await h.screenshot('artifacts/levels-5-continue.png');
await page.evaluate(() => window.__cafe.game.click('continue'));
await until(() => window.__cafe.game.phase === 'run');
s = await state();
check('CONTINUE carries the level on with the count it had', s.level === 2 && s.served === 3 && s.bar.join() === '2,3,7', JSON.stringify({ level: s.level, served: s.served, bar: s.bar }));

// 8. Happiness at zero.
const bank = s.bank;
await page.evaluate(() => { window.__cafe.score.happiness = 0; });
await until(() => window.__cafe.game.phase === 'closed');
await until(() => window.__cafe.game.menu.card.open, 10000);
s = await state();
check('happiness at zero: the retry card (TRY AGAIN, MAIN MENU), the café hidden, the level saved from its start', s.card === 'failed' && s.buttons.join() === 'again,menu' && !s.cafe && s.saved?.level === 2 && s.saved?.levelServed === 0 && s.saved?.bank === bank, JSON.stringify({ card: s.card, buttons: s.buttons, cafe: s.cafe, saved: s.saved }));
await page.waitForTimeout(600);
await h.screenshot('artifacts/levels-6-retry.png');
await page.evaluate(() => window.__cafe.game.click('again'));
await until(() => window.__cafe.game.phase === 'run');
s = await state();
check('TRY AGAIN: level 2 from zero, the happiness full, the coins kept', s.level === 2 && s.served === 0 && s.happiness === 100 && s.bank === bank && s.cafe, JSON.stringify({ level: s.level, served: s.served, happiness: s.happiness, bank: [bank, s.bank], cafe: s.cafe }));

// 9a. A guest served while the card waits for empty hands counts toward the next level; happiness carried on even with none served.
await page.evaluate(() => { const { game } = window.__cafe; game.save.level = 1; game.save.levelServed = 0; game.toRun(true); });
await until(() => window.__cafe.game.level === 1 && window.__cafe.game.levelServed === 0 && window.__cafe.game.phase === 'run');
await page.evaluate(() => Object.defineProperty(window.__cafe.guests, 'carrying', { get: () => true, configurable: true }));
for (let i = 0; i < 6; i++) await pay(0.2, 1, 1);
await page.waitForTimeout(500);
await page.evaluate(() => { delete window.__cafe.guests.carrying; });
await until(() => window.__cafe.game.phase === 'levelup');
s = await state();
check('a sixth guest served while the level card waited counts toward level 2', s.level === 2 && s.served === 1, JSON.stringify({ level: s.level, served: s.served }));
await until(() => window.__cafe.game.menu.card.open && window.__cafe.game.menu.cardKind === 'level', 10000);
await page.evaluate(() => window.__cafe.game.click('level-continue'));
await until(() => window.__cafe.game.phase === 'run' && window.__cafe.system.timeScale === 1, 10000);
await page.evaluate(() => { window.__cafe.score.happiness = 40; });
await page.waitForTimeout(300);
await page.evaluate(() => window.__cafe.game.click('bar-pause'));
await until(() => window.__cafe.game.phase === 'paused');
await page.evaluate(() => window.__cafe.game.click('end'));
await until(() => window.__cafe.game.phase === 'title');
await page.evaluate(() => window.__cafe.game.click('continue'));
await until(() => window.__cafe.game.phase === 'run');
s = await state();
check('MAIN MENU then CONTINUE carries the happiness on (40), even with the count it had', s.happiness === 40 && s.level === 2 && s.served === 1, JSON.stringify({ happiness: s.happiness, level: s.level, served: s.served }));

// 9. Letting go: only a seat near where the hand points.
const aim = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const V = guests.seats[0].position.constructor;
  const taken = guests.seats.map((x) => x.occupant);
  // One free seat only: the one furthest to the left.
  // One free seat only: the furthest left of the seats on open tables (the far left ones are on locked tables).
  const free = [...guests.seats].filter((x) => !x.locked).sort((a, b) => a.position.x - b.position.x)[0];
  for (const x of guests.seats) x.occupant = x === free ? 0 : 999;
  const far = [...guests.seats].sort((a, b) => b.position.x - a.position.x)[0];
  const over = (seat) => new V(seat.position.x, seat.position.y + 0.05, seat.position.z);
  const near = guests.seatAimed(over(free), over(free), null, null);
  const away = guests.seatAimed(over(far), over(far), null, null);
  const gap = Math.hypot(far.position.x - free.position.x, far.position.z - free.position.z);
  guests.seats.forEach((x, i) => { x.occupant = taken[i]; });
  return { near: near === free, away: away === null, gap: +gap.toFixed(2) };
});
check('let go over a free seat the guest takes it; let go far from any free seat it goes back to the line', aim.near && aim.away, JSON.stringify(aim));

// 10. The level series and the pace table, from the rules themselves.
const rules = await page.evaluate(async () => {
  const r = await import('/src/game/rules.ts');
  const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20];
  return { goals: levels.map((l) => r.levelGoal(l)), gaps: levels.map((l) => +r.arrivalGap(l).toFixed(2)), queue: levels.map((l) => r.queueCap(l)), line: levels.map((l) => r.linePatience(l)) };
});
check('goals 5, 7, 10, 14, 19, 25, 32, 40, 49, then 60 from level 10', rules.goals.join() === '5,7,10,14,19,25,32,40,49,60,60,60', rules.goals.join());
check('gaps 20, 18, 15, 12, 8.5 (rush), 9.35 (breather), 7, 6, 5.5, then 5 (the floor); the line 2, 2, 3 ... 4; patience 30 down to 20', rules.gaps.join() === '20,18,15,12,8.5,9.35,7,6,5.5,5,5,5' && rules.queue.join() === '2,2,3,3,3,3,3,4,4,4,4,4' && rules.line[0] === 30 && rules.line[11] === 20, JSON.stringify(rules));

// 11. An old save keeps only its settings.
const migrated = await page.evaluate(async () => {
  localStorage.removeItem('cafe-chaos/save/v3');
  localStorage.setItem('cafe-chaos/save/v2', JSON.stringify({ bank: 900, hires: 2, tutorialDone: true, bestSeconds: 400, bestCoins: 300, runs: 9, music: 4, sounds: 1, size: 120 }));
  const { loadSave } = await import('/src/game/save.ts');
  return loadSave();
});
check('an old save starts fresh at level 1 with no coins or hires; its settings and the first run are kept', migrated.bank === 0 && migrated.hires === 0 && migrated.level === 1 && migrated.music === 4 && migrated.sounds === 1 && migrated.size === 120 && migrated.tutorialDone === true, JSON.stringify(migrated));

const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
