/**
 * The numbers that make Café Chaos a game: the levels, the café's
 * happiness, the money, and the staff the money hires. Everything that
 * tunes the scoring and the pace lives here.
 *
 * The café never closes. The player passes a level by serving a set
 * number of guests; each level more guests come, a little faster, and
 * wait a little less patiently in the line. When the café's happiness
 * runs out the level starts again (the coins are kept). Coins go into the
 * bank, which is kept between sessions and hires staff, who stay hired.
 *
 * Where a number comes from is marked: (measured) in the running game,
 * (source) from published guidance, (estimate) to be tuned by play. The
 * reasons are in docs/MECHANICS-PLAN.md.
 */

import { current, type CafeId } from '../cafe/style.js';

/**
 * The café's happiness: a meter from 0 to `max`. It starts each run
 * full; happy guests top it up, and guests who give up in the line or
 * storm out of their seats knock it down. At 0 the level starts again;
 * a new level starts with it full.
 */
export const HAPPINESS = { max: 100, start: 100 };

/**
 * What a guest who ate pays: one payment of `min` to `max` coins. `speed`
 * of it is for how quickly it was seated (all of it for one seated at
 * once, none for one seated as its patience ran out) and `wishes` for the
 * share of its wishes its seat met (a guest with no wishes counts as all
 * met). The café is `happiness` happier for each coin paid. (estimate:
 * the split; the range is the owner's.)
 */
export const PAY = { min: 1, max: 10, speed: 0.4, wishes: 0.6, happiness: 0.4 };

/** What a guest pays: `share` is how much of its line patience it had used when seated (0 to 1); `met` of `of` wishes. */
export function payFor(share: number, met: number, of: number): number {
  const speed = 1 - Math.min(1, Math.max(0, share));
  const wishes = of > 0 ? met / of : 1;
  return Math.round(PAY.min + (PAY.max - PAY.min) * (PAY.speed * speed + PAY.wishes * wishes));
}

/**
 * A guest who leaves unhappy costs the café happiness only: the bank is
 * never touched (coins are only ever earned). Storming out of a seat,
 * having been seated and then kept waiting for food, is the worse of the
 * two.
 */
export const LOSSES = {
  gaveUp: { coins: 0, happiness: 8 },
  stormedOff: { coins: 0, happiness: 10 },
};

/**
 * The levels.
 *
 * - `firstGoal`, `goalCap`, `capFrom`: guests to serve to pass level 1;
 *   each level after asks for more, and the step grows by one each time
 *   (5, 7, 10, 14, 19 ...); from level `capFrom` it is the cap. (source:
 *   accelerating thresholds; a fixed step is too slow early and too fast
 *   late.)
 * - `gaps`: seconds between arrivals at the start of levels 1, 2, 3 ...
 *   (the last holds from then on), never under `floor`. One barista
 *   serves a guest about every 16 seconds, two every 8, three every 5
 *   (measured), so the gaps follow the staff a player can have by then;
 *   5 seconds is also as fast as hands should be asked to work (source:
 *   Meta, avoid reflex-heavy events).
 * - `speedUp`: by the end of a level the gap is this share of its start.
 * - `rush`: every `every`-th level comes `gap` times as fast, and the one
 *   after it `after` times (a breather). The floor still wins, so from
 *   the level that reaches the floor there are no rush levels: variety
 *   there comes from the wishes, not speed.
 * - `queue`: how many may stand in the line, by level (the last holds).
 * - `linePatience`: seconds a guest waits in the line at level 1, less
 *   `perLevel` each level, never under `min`. (estimate)
 * - `seatedPatience`: seconds a seated guest waits for its food. With one
 *   barista the longest wait behind one other order is 35.5 seconds
 *   (measured), so 40 never fails for that.
 * - `wishes`: from each `from` level, the chances of 1, 2 or 3 wishes.
 *   `singerFrom`: singers come from this level. (estimate)
 * - `bonus`: coins for reaching a level, times its number.
 * - `breather`: seconds with no new guest after a level is reached (the
 *   café keeps going: a moment to look up at the bar, not a stop).
 *   (estimate; Meta: let players set their own pace, so a real break is
 *   one pinch away on Pause.)
 */
export const LEVEL = {
  firstGoal: 5,
  goalCap: 60,
  capFrom: 10,
  // The first levels were 15 s apart with two in the line: the owner's playtest (Nov 17) found the start too slow.
  gaps: [11, 11, 11, 10, 9, 8, 7, 6, 5.5, 5],
  floor: 5,
  speedUp: 0.85,
  rush: { every: 5, gap: 0.85, after: 1.1 },
  queue: [3, 3, 3, 3, 3, 3, 3, 4],
  linePatience: { start: 30, perLevel: 1, min: 20 },
  seatedPatience: 40,
  // The owner's rule 2 (18 Nov 2026): about 1 in 3 guests have two wishes; from level 3 about half, and three-wish
  // guests begin; from level 5 up to three; mostly 2 or 3 from level 8. (The first 3 guests of a run have one:
  // guests/wish-plan.ts.)
  wishes: [
    { from: 1, weights: [2 / 3, 1 / 3, 0] },
    { from: 3, weights: [0.4, 0.5, 0.1] },
    { from: 5, weights: [0.4, 0.45, 0.15] },
    { from: 8, weights: [0.25, 0.45, 0.3] },
  ],
  singerFrom: 3,
  singer: 0.14,
  bonus: 5,
  breather: 5,
};

const byLevel = <T>(list: readonly T[], level: number): T => list[Math.min(list.length, Math.max(1, Math.floor(level))) - 1];

/** Guests to serve to pass `level` (1-based). */
export function levelGoal(level: number): number {
  const n = Math.max(0, Math.floor(level) - 1);
  if (n + 1 >= LEVEL.capFrom) return LEVEL.goalCap;
  return Math.min(LEVEL.goalCap, LEVEL.firstGoal + (n * (n + 3)) / 2);
}

/** Seconds between arrivals in `level`, `progress` (0 to 1) of the way through it. */
export function arrivalGap(level: number, progress = 0): number {
  const r = LEVEL.rush;
  // A breather only follows a rush the floor did not cancel.
  const rushed = level > r.every && level % r.every === 1 && byLevel(LEVEL.gaps, level - 1) * r.gap > LEVEL.floor;
  const rush = level > 1 && level % r.every === 0 ? r.gap : rushed ? r.after : 1;
  const within = 1 - (1 - LEVEL.speedUp) * Math.min(1, Math.max(0, progress));
  return Math.max(LEVEL.floor, byLevel(LEVEL.gaps, level) * rush * within);
}

/** How many guests may stand in the line in `level`. */
export function queueCap(level: number): number {
  return byLevel(LEVEL.queue, level);
}

/** Seconds a new guest waits in the line in `level`. */
export function linePatience(level: number): number {
  const p = LEVEL.linePatience;
  return Math.max(p.min, p.start - p.perLevel * (Math.max(1, level) - 1));
}

/** Coins for reaching `level`. */
export function levelBonus(level: number): number {
  return LEVEL.bonus * level;
}

/** How many wishes (1 to 3) a new guest has in `level`. */
export function wishCount(level: number, random: () => number = Math.random): number {
  const band = [...LEVEL.wishes].reverse().find((c) => level >= c.from) ?? LEVEL.wishes[0];
  let r = random();
  for (let i = 0; i < band.weights.length; i++) {
    r -= band.weights[i];
    if (r < 0) return i + 1;
  }
  return 1;
}

/**
 * A guest gets down from its chair once it has eaten for this long
 * (seconds). The sooner its food comes, the sooner its table is free for
 * the next guest: more servers means more guests through the door, and
 * more money.
 */
export const MEAL_SECONDS = 22;

/**
 * Hurried guests (from level `from`): a share of new guests, `chance`
 * rising by `perLevel` a level to `max`, who wait `line` times as long in
 * the line (never under `lineMin` seconds) and `seated` seconds for their
 * food (30: with one barista a hurried guest seated at a random moment
 * leaves about 2 % of the time, at 25 s about 10 %, measured), are served
 * first, and pay `pay` times as much (up to 15): more risk, more reward
 * (source: Diner Dash's customer types each have their own patience and
 * tips). Marked by an hourglass on the dot, not colour alone. (estimate:
 * the shares)
 */
export const HURRY = { from: 2, chance: 0.1, perLevel: 0.02, max: 0.2, line: 0.6, lineMin: 15, seated: 30, pay: 1.5 };

/** The share of new guests in a hurry in `level`. */
export function hurryChance(level: number): number {
  if (level < HURRY.from) return 0;
  return Math.min(HURRY.max, HURRY.chance + HURRY.perLevel * (level - HURRY.from));
}

/**
 * The Canadian café's cold guests (docs/CANADA-CHALLENGES.md), from level
 * `from`: a share of new guests (`chance`, or the day's forecast's) who
 * always wish to sit by the fireplace (the bonfire warms them too), wait
 * `line` times as long in the line, and seated outside anywhere but the
 * bonfire `outside` times as long for their food. A snowflake on the dot,
 * a pale blue tint and a shiver. (estimate)
 */
export const COLD = { from: 2, chance: 0.12, line: 0.75, outside: 0.75 };

/**
 * The snowstorm (game/events.ts): always `at` of the way into level
 * `level`, then every few levels by the forecast. For `seconds`, a share
 * `cold` of new guests are cold, nobody new wishes for outside, the lake
 * or upstairs, and guests seated outside (not at the bonfire) lose patience
 * `outside` times as fast. Snow drifts over the plate. (estimate)
 */
export const STORM = { level: 2, at: 0.33, seconds: 60, cold: 0.6, outside: 1.3 };

/**
 * Today's forecast (game/forecast.ts), picked from the local date: how
 * many days a week each comes, its share of cold guests, how often a storm
 * blows in after level 2 (every `stormEvery` levels; 0 never) and for how
 * long, and the wishes it leans the cards toward (twice as often).
 */
export type ForecastId = 'sunny' | 'snap' | 'snow';
export interface Forecast {
  id: ForecastId;
  name: string;
  /** One line on the start card. */
  line: string;
  days: number;
  cold: number;
  stormEvery: number;
  stormSeconds: number;
  lean: ('outside' | 'lake' | 'upstairs' | 'warm' | 'bonfire' | 'inside')[];
}
export const FORECASTS: Record<ForecastId, Forecast> = {
  sunny: { id: 'sunny', name: 'Sunny', line: 'Today: sunny. Guests want outside.', days: 3, cold: 0.08, stormEvery: 0, stormSeconds: 0, lean: ['outside', 'lake', 'upstairs'] },
  snap: { id: 'snap', name: 'Cold snap', line: 'Today: cold snap. Many cold guests.', days: 2, cold: 0.25, stormEvery: 4, stormSeconds: 60, lean: ['warm', 'bonfire', 'inside'] },
  snow: { id: 'snow', name: 'Snow day', line: 'Today: snow day. Storms blow in.', days: 2, cold: 0.15, stormEvery: 2, stormSeconds: 75, lean: ['inside'] },
};

/** The share of new guests who are cold in `level` on this forecast (none before COLD.from). */
export function coldChance(level: number, forecast: Forecast | null): number {
  if (level < COLD.from) return 0;
  return forecast ? forecast.cold : COLD.chance;
}

/**
 * Pairs (from level `from`): two friends arrive together and wish to sit
 * at the same table (each has the `friend` wish, besides its others). A
 * new arrival is a pair with `chance`, rising by `perLevel` a level to
 * `max`, when the line has room for both. (estimate)
 */
export const PAIRS = { from: 4, chance: 0.15, perLevel: 0.02, max: 0.25 };

/** The share of arrivals that are pairs in `level`. */
export function pairChance(level: number): number {
  if (level < PAIRS.from) return 0;
  return Math.min(PAIRS.max, PAIRS.chance + PAIRS.perLevel * (level - PAIRS.from));
}

/**
 * The tables. The café opens with `START_TABLES` (indices into the café's
 * pieces, cafe/layout.ts: the centre back table and the centre front
 * two-seater, four seats); every other table, the bar and the quiet
 * corner stand locked, grey and see-through with a padlock and a price
 * over them, and the player points at one and pinches to buy it. Which
 * one is the player's choice (a near table is served sooner, a window or
 * door table meets more wishes); the price depends only on how many have
 * been bought: `TABLE_PRICES[n]` is the n-th table bought. The step grows
 * each time (source: a growing step suits a small fixed set of unlocks;
 * doubling would reach tens of thousands). The café's floor never grows:
 * only its own ten tables unlock (the owner's call).
 *
 * The prices were set for the simulation's bots (7 to 10 coins a guest)
 * and the first playtest found them hard: a new player earns far less,
 * and could open hardly a table and no barista early on. So the early
 * steps are cheap, a few tables and a second barista within the first
 * three levels (about 22 guests, some 110 to 150 coins), and the rest
 * grows from there; the challenge is meant to come from the guests (the
 * pace, the wishes, the hurried and the pairs), not the prices.
 * (playtest; the simulation's table is in docs/MECHANICS-PLAN.md)
 */
export const START_TABLES = [2, 8];
/** The Canadian café's two window tables (cafe/canada-layout.ts). */
export const CANADA_START_TABLES = [1, 2];
/** The tables a café opens with. */
export function startTables(id: CafeId = current.id): number[] {
  return id === 'canada' ? CANADA_START_TABLES : START_TABLES;
}
export const TABLE_PRICES = [8, 14, 22, 32, 45, 62, 85, 115, 150, 190];

/** What the next table costs once `bought` have been bought (the last price holds). */
export function tablePrice(bought: number): number {
  return TABLE_PRICES[Math.min(TABLE_PRICES.length - 1, Math.max(0, bought))];
}

/**
 * Cleaning. A table is dirty from the moment its last guest leaves until
 * a member of staff has wiped it for `seconds`; nobody is seated at a
 * dirty table. A barista cleans when it has nothing to serve: on its way
 * back from a table, a dirty one within `near` metres of walking; from
 * the bar, the nearest; an order always comes first, and a barista
 * cleaning when one comes in leaves the table and goes to serve. The
 * janitor (one, `JANITOR_PRICE`, bought in the shop) only cleans, the
 * longest dirty first, from its spot by the counter's end (`home`, café
 * space). The mess is sized to each table (MESS) and shrinks away over
 * `vanish` seconds.
 * (estimate: 3 s, a wipe's worth; with one barista a round trip is 16 s
 * measured, so a stop to clean adds a fifth)
 */
export const CLEAN = { seconds: 3, near: 0.3, vanish: 0.4, home: { x: 0.17, z: -0.2, reach: 0.1 } };
/**
 * The mess is sized to its table: it covers at most `fit` of the top's
 * shorter side (measured from the models, metres), so it always sits
 * well inside the top, small and tidy, whatever the table (the owner:
 * minimal, never crowding a table). Each guest leaves its own mess at its
 * place, so on a table with more than one seat each is `place` of that
 * (a table left by a full party still looks tidy). The mess model is
 * `size` across.
 */
export const MESS = { size: 0.032, fit: 0.65, place: 0.6, tops: { 'table-2': 0.046, 'table-4': 0.04, 'bar-2': 0.026, 'quiet-corner': 0.024, 'table-ca-2': 0.042, 'table-ca-4': 0.04, 'patio-table': 0.034, 'dock-bench': 0.02, 'fire-chair': 0.022 } as Record<string, number> };
export const JANITOR_PRICE = 80;
/** Where the Canadian café's janitors wait (café space): on the deck by the cabin door, clear of the stairs and the heater. */
export const CANADA_CLEAN_HOMES = [
  { x: 0.15, z: -0.08, reach: 0.08 },
  { x: 0.2, z: -0.13, reach: 0.08 },
];
/** The Canadian café's second janitor (barista-cedar). */
export const JANITOR2_PRICE = 150;
/** The Canadian café's musicians, bought one after the other: the fiddler on the patio stage, then the pianist on the upper deck. */
export const MUSICIAN_PRICES = [60, 140];

/**
 * The staff. The café opens with `STARTING_STAFF` server; each further
 * one is hired with coins and stays hired (it is saved). `HIRE_PRICES[n]`
 * is the price of the server after the n-th hire, so the second server
 * costs the first price (it is needed early, so it is cheap; the third
 * is priced by what it adds). Three baristas in all: few enough that the café
 * never feels crowded and there is room to pick guests up between them.
 */
export const STARTING_STAFF = 1;
export const HIRE_PRICES = [40, 120];
export const MAX_STAFF = STARTING_STAFF + HIRE_PRICES.length;
