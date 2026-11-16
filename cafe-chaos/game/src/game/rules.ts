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
 * - `firstGoal`, `goalCap`: guests to serve to pass level 1; each level
 *   after asks for more, and the step grows by one each time (5, 7, 10,
 *   14, 19 ...), up to the cap. (source: accelerating thresholds; a fixed
 *   step is too slow early and too fast late.)
 * - `gaps`: seconds between arrivals at the start of levels 1, 2, 3 ...
 *   (the last holds from then on), never under `floor`. One barista
 *   serves a guest about every 16 seconds, two every 8, three every 5
 *   (measured), so the gaps follow the staff a player can have by then;
 *   5 seconds is also as fast as hands should be asked to work (source:
 *   Meta, avoid reflex-heavy events).
 * - `speedUp`: by the end of a level the gap is this share of its start.
 * - `rush`: every `every`-th level comes `gap` times as fast, and the one
 *   after it `after` times (a breather).
 * - `queue`: how many may stand in the line, by level (the last holds).
 * - `linePatience`: seconds a guest waits in the line at level 1, less
 *   `perLevel` each level, never under `min`. (estimate)
 * - `seatedPatience`: seconds a seated guest waits for its food. With one
 *   barista the longest wait behind one other order is 35.5 seconds
 *   (measured), so 40 never fails for that.
 * - `wishes`: from each `from` level, the chances of 1, 2 or 3 wishes.
 *   `singerFrom`: singers come from this level. (estimate)
 * - `bonus`: coins for reaching a level, times its number.
 * - `rest`: seconds the café takes to slow to a stop for the level card,
 *   and to pick up again after it.
 */
export const LEVEL = {
  firstGoal: 5,
  goalCap: 60,
  gaps: [20, 18, 15, 12, 10, 8.5, 7, 6, 5.5, 5],
  floor: 5,
  speedUp: 0.85,
  rush: { every: 5, gap: 0.85, after: 1.1 },
  queue: [2, 2, 3, 3, 3, 3, 3, 4],
  linePatience: { start: 30, perLevel: 1, min: 20 },
  seatedPatience: 40,
  wishes: [
    { from: 1, weights: [1, 0, 0] },
    { from: 3, weights: [0.6, 0.4, 0] },
    { from: 5, weights: [0.4, 0.45, 0.15] },
    { from: 8, weights: [0.25, 0.45, 0.3] },
  ],
  singerFrom: 2,
  singer: 0.14,
  bonus: 5,
  rest: 0.3,
};

const byLevel = <T>(list: readonly T[], level: number): T => list[Math.min(list.length, Math.max(1, Math.floor(level))) - 1];

/** Guests to serve to pass `level` (1-based). */
export function levelGoal(level: number): number {
  const n = Math.max(0, Math.floor(level) - 1);
  return Math.min(LEVEL.goalCap, LEVEL.firstGoal + (n * (n + 3)) / 2);
}

/** Seconds between arrivals in `level`, `progress` (0 to 1) of the way through it. */
export function arrivalGap(level: number, progress = 0): number {
  const r = LEVEL.rush;
  const rush = level > 1 && level % r.every === 0 ? r.gap : level > r.every && level % r.every === 1 ? r.after : 1;
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
 * The staff. The café opens with `STARTING_STAFF` server; each further
 * one is hired with coins and stays hired (it is saved). `HIRE_PRICES[n]`
 * is the price of the server after the n-th hire, so the second server
 * costs the first price (it is needed early, so it is cheap; the third
 * is priced by what it adds). Three baristas in all: few enough that the café
 * never feels crowded and there is room to pick guests up between them.
 */
export const STARTING_STAFF = 1;
export const HIRE_PRICES = [50, 150];
export const MAX_STAFF = STARTING_STAFF + HIRE_PRICES.length;
