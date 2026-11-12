/**
 * The numbers that make Café Chaos a game: the run, the café's
 * happiness, the money, and the staff the money hires. Everything that
 * tunes the scoring and the pace lives here.
 *
 * The game is one endless evening. The clock counts up from 0:00, guests
 * come faster and wait less patiently as it goes on, and the café closes
 * when its happiness runs out: the time it stayed open is the score.
 * Coins earned go into the bank, which is kept between sessions and
 * hires servers, who stay hired.
 */

/**
 * The café's happiness: a meter from 0 to `max`. It starts each run
 * full; happy guests top it up, and guests who give up in the line or
 * storm out of their seats knock it down. At 0 the café closes: the run
 * is over.
 */
export const HAPPINESS = { max: 100, start: 100 };

/**
 * What a guest who ate pays, and how much happier the café is for it, by
 * how quickly it was seated (`share`: how much of its patience it had
 * used when it sat down). Taken from the gate and seated within the
 * first quarter of its patience, it is delighted and tips well; seated at
 * the last moment it still pays and still lifts the café, a little.
 */
export const PAY_TIERS: { upTo: number; name: string; coins: number; happiness: number }[] = [
  { upTo: 0.25, name: 'quick', coins: 12, happiness: 5 },
  { upTo: 0.6, name: 'fair', coins: 8, happiness: 3 },
  { upTo: 1, name: 'late', coins: 5, happiness: 1 },
];

/**
 * A guest who leaves unhappy costs the café happiness only: the bank is
 * never touched (coins are only ever earned). Storming out of a seat,
 * having been seated and then kept waiting for food, is the worse of the
 * two.
 */
export const LOSSES = {
  gaveUp: { coins: 0, happiness: 8 },
  stormedOff: { coins: 0, happiness: 12 },
};

/**
 * The evening gets busier. `minutes` is how long the café has been open.
 *
 * - Arrivals: the gaps between guests (guests/rules.ts SPAWN_SECONDS) are
 *   `pace.start` times longer at opening, and shrink by `pace.perMinute`
 *   each minute down to `pace.min`. At opening a guest comes about every
 *   16 seconds, which one server can keep up with (a server's round is
 *   about 18 seconds); by the fourth minute it takes three.
 * - Patience: guests wait `patience.perMinute` times as long each minute,
 *   down to `patience.min` of the opening patience, so late in the
 *   evening a full line cannot all be saved and the end comes.
 */
export const RAMP = {
  pace: { start: 3.2, perMinute: 0.8, min: 0.55 },
  patience: { perMinute: 0.95, min: 0.5 },
};

/** How much longer the gaps between arrivals are than SPAWN_SECONDS, `seconds` into the run. */
export function arrivalPace(seconds: number): number {
  return Math.max(RAMP.pace.min, RAMP.pace.start * RAMP.pace.perMinute ** (seconds / 60));
}

/** How patient new guests are, as a share of the opening patience, `seconds` into the run. */
export function patienceShare(seconds: number): number {
  return Math.max(RAMP.patience.min, RAMP.patience.perMinute ** (seconds / 60));
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
 * costs the first price. There are six baristas in all.
 */
export const STARTING_STAFF = 1;
export const HIRE_PRICES = [40, 80, 120, 160, 200];
export const MAX_STAFF = STARTING_STAFF + HIRE_PRICES.length;
