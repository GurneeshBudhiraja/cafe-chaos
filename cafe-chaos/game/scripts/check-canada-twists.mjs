/**
 * The Canadian café's twists (docs/CANADA-CHALLENGES.md), in the real game
 * (not test mode), in the desktop preview:
 * 1. cold guests: none at level 1; from level 2 a cold guest wishes for the
 *    fireplace, waits COLD.line as long in the line, is tinted ice-blue and
 *    carries a snowflake on its dot; the "A cold guest!" tip comes once;
 * 2. the snowstorm: a third of the way into level 2 it starts, its note goes
 *    up, snow falls, most new guests are cold and none wishes for outside,
 *    the lake or upstairs; it ends on time and the snow fades;
 * 3. the trial ends after its levels with the Trial over card;
 * 4. the Japanese café has no cold guests and no storm.
 * Screenshots in artifacts/canada-*.png.
 *
 * Usage: dev server running, then `node scripts/check-canada-twists.mjs`.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset, OUT_DIR } = await import('./lib/headset.mjs');

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
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 250 }).then(() => true, () => false);
const shot = (name) => page.screenshot({ path: `${OUT_DIR}/canada-${name}.png` });

// Into the Canadian café (its trial), past the lesson, into a run.
await page.evaluate(() => window.__cafe.game.startCafe('canada', 'trial'));
await until(() => ['run', 'tutorial'].includes(window.__cafe.game.phase), null, 240000);
await page.evaluate(() => {
  const g = window.__cafe.game;
  g.save.tutorialDone = true;
  if (g.phase !== 'run') g.toRun();
});
await until(() => window.__cafe.game.phase === 'run');

// 1. Level 1: nobody cold.
const l1 = await page.evaluate(() => {
  const { game, guests } = window.__cafe;
  game.pace();
  return { chance: guests.coldChance, level: game.level };
});
check('no cold guests at level 1', l1.level === 1 && l1.chance === 0, JSON.stringify(l1));

// Level 2, everyone cold for a moment: the next guest.
await page.evaluate(() => {
  const { game, guests } = window.__cafe;
  game.level = 2;
  game.servedMark = game.score.servedGuests;
  game.levelServed = 0;
  game.pace();
  // The tips before the cold one in TIP_ORDER count as seen, so the cold tip is the next due (this checks it, not the order).
  for (const id of ['goal', 'card', 'hurry']) if (!game.save.tips.includes(id)) game.save.tips.push(id);
  guests.coldChance = 1;
  guests.nextSpawnIn = 0;
});
await until(() => window.__cafe.guests.guests.some((x) => x.cold && x.state === 'queued'), null, 60000);
const cold = await page.evaluate(() => {
  const { guests, game } = window.__cafe;
  const c = guests.guests.find((x) => x.cold);
  const skin = c.actor.materials.find((m) => m.color);
  return { wishes: c.wishes, full: c.patienceFull, line: guests.patienceSeconds, color: skin.color.getHexString(), warm: skin.userData.warmColor?.getHexString(), tipShown: game.tipShown, saved: game.save.tips.includes('cold'), dot: c.dial.drawn };
});
check('a cold guest wishes for the fireplace', cold.wishes.includes('warm'), cold.wishes.join(','));
check('a cold guest waits 0.75 as long in the line', cold.full <= cold.line * 0.75 * (1 + 0.16) + 0.01, `${cold.full.toFixed(1)} s of ${cold.line} s`);
check('a cold guest is tinted and its dot has the snowflake', cold.color !== cold.warm && /\|true$/.test(cold.dot ?? ''), `${cold.warm} -> ${cold.color}, dot ${cold.dot}`);
// Other tips may come first (the wish card's); the cold one follows within a few tips.
await until(() => window.__cafe.game.save.tips.includes('cold'), null, 60000);
const tip = await page.evaluate(() => ({ shown: window.__cafe.game.tipShown, saved: window.__cafe.game.save.tips.includes('cold') }));
check('the cold tip comes, once', tip.saved, JSON.stringify(tip));
await shot('cold-guest');

// 2. The storm: a third of the way into level 2.
await page.evaluate(() => {
  const { game, guests } = window.__cafe;
  game.pace();
  game.levelServed = Math.ceil(0.34 * game.score.levelGoal);
  game.servedMark = game.score.servedGuests - game.levelServed;
});
const started = await until(() => window.__cafe.game.events.storming, null, 10000);
const st = await page.evaluate(() => {
  const { game, guests } = window.__cafe;
  return { left: game.events.stormLeft, storm: guests.storm, cold: guests.coldChance, note: game.notes[0]?.title };
});
check('the level-2 storm starts, with its note', started && st.storm && Math.abs(st.cold - 0.6) < 1e-9 && st.left > 50 && st.note === 'Snowstorm!', JSON.stringify(st));
await until(() => window.__cafe.game.snow.material.opacity > 0.85, null, 10000);
// New guests in the storm.
const pool = await page.evaluate(() => {
  const { guests } = window.__cafe;
  const out = [];
  let cold = 0;
  for (let i = 0; i < 200; i++) {
    const c = Math.random() < guests.coldChance;
    if (c) cold++;
    out.push(...guests.planFor('beavertail', c, false, 30).wishes);
  }
  return { outdoor: out.filter((w) => ['outside', 'lake', 'upstairs'].includes(w)).length, cold };
});
const snow = await page.evaluate(() => ({ visible: window.__cafe.game.snow.points.visible, opacity: window.__cafe.game.snow.material.opacity }));
check('it snows and nobody new wishes for outdoors', snow.visible && snow.opacity > 0.85 && pool.outdoor === 0 && pool.cold > 90, JSON.stringify({ ...snow, ...pool }));
await page.evaluate(() => (window.__cafe.game.notes.length = 0));
await shot('storm');
// Its end: wind the clock on to the last second.
await page.evaluate(() => (window.__cafe.game.events.stormLeft = 0.5));
const ended = await until(() => !window.__cafe.game.events.storming && !window.__cafe.guests.storm, null, 10000);
await until(() => !window.__cafe.game.snow.points.visible, null, 10000);
const after = await page.evaluate(() => ({ cold: window.__cafe.guests.coldChance, snow: window.__cafe.game.snow.points.visible }));
check('the storm ends on time and the snow fades', ended && !after.snow && after.cold < 0.3, JSON.stringify(after));
// Not twice in the level.
await page.waitForTimeout(1500);
check('one storm a level', !(await page.evaluate(() => window.__cafe.game.events.storming)), 'calm');

// 3. The trial ends after its levels: the café pauses and the Trial over card is up; RESUME brings the card back.
await page.evaluate(async () => {
  const { game } = window.__cafe;
  const { levelGoal } = await import('/src/game/rules.ts');
  game.level = 3;
  game.pace();
  game.servedMark = game.score.servedGuests - levelGoal(3);
});
const over = await until(() => window.__cafe.game.phase === 'paused' && window.__cafe.game.menu.sheetKind === 'trialDone', null, 10000);
const td = await page.evaluate(() => ({ phase: window.__cafe.game.phase, sheet: window.__cafe.game.menu.sheetKind, level: window.__cafe.game.level, buttons: window.__cafe.game.menu.sheet.buttons.map((b) => b.id) }));
await page.evaluate(() => window.__cafe.game.click('resume'));
await page.waitForTimeout(500);
const back = await page.evaluate(() => ({ phase: window.__cafe.game.phase, sheet: window.__cafe.game.menu.sheetKind }));
check('the trial ends after level 3 with the Trial over card, and RESUME does not go on', over && td.level === 4 && td.buttons.includes('trial-japan') && td.buttons.includes('trial-menu') && back.phase === 'paused' && back.sheet === 'trialDone', JSON.stringify({ ...td, back }));
await shot('trial-over');
await page.evaluate(() => window.__cafe.game.click('trial-menu'));
await until(() => window.__cafe.game.phase === 'title', null, 10000);

// 4. Japanese café: no cold guests, no storm.
await page.evaluate(() => window.__cafe.game.startCafe('japan', 'continue'));
await until(() => ['run', 'tutorial'].includes(window.__cafe.game.phase), null, 240000);
const jp = await page.evaluate(() => {
  const { game, guests } = window.__cafe;
  game.level = 2;
  game.pace();
  return { cold: guests.coldChance, storm: guests.storm, events: game.events.storming };
});
check('the Japanese café: no cold guests, no storm', jp.cold === 0 && !jp.storm && !jp.events, JSON.stringify(jp));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');

await h.finish?.();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
