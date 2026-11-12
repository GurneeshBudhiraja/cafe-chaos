/**
 * The numbers that make Café Chaos a game: the shift, the café's
 * happiness, the money, and what the money buys. Everything that tunes
 * the scoring and the shop lives here.
 */

/** A shift lasts this long (seconds): the café opens, guests come, and at the end the takings are counted. */
export const SHIFT_SECONDS = 240;

/**
 * The café's happiness: a meter from 0 to `max`. It starts full; happy
 * guests top it up, and guests who give up in the line or storm out of
 * their seats knock it down. At 0 the café closes early: the shift is
 * over.
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
  { upTo: 0.25, name: 'quick', coins: 12, happiness: 6 },
  { upTo: 0.6, name: 'fair', coins: 8, happiness: 4 },
  { upTo: 1, name: 'late', coins: 5, happiness: 2 },
];

/**
 * A guest who leaves unhappy costs the café happiness only: the bank is
 * never touched (coins are only ever earned). Storming out of a seat,
 * having been seated and then kept waiting for food, is the worse of the
 * two.
 */
export const LOSSES = {
  gaveUp: { coins: 0, happiness: 6 },
  stormedOff: { coins: 0, happiness: 10 },
};

/**
 * Word gets around: the more servers the café has, the more guests come.
 * The gaps between arrivals (guests/rules.ts SPAWN_SECONDS) are this many
 * times longer with one server, two, three, and four or more (up to all six). A server's
 * round takes about 18 seconds, so each pace brings guests about as fast
 * as that staff can serve them: a player who seats them promptly keeps
 * everyone fed, and each hire makes the evening both busier and richer.
 */
export const ARRIVAL_PACE = [3.2, 1.7, 1.2, 1];

/**
 * A guest gets down from its chair once it has eaten for this long
 * (seconds). The sooner its food comes, the sooner its table is free for
 * the next guest: more servers means more guests through the door, and
 * more money.
 */
export const MEAL_SECONDS = 22;

/**
 * The shop: the stone plaques in the gravel in front of the café. Each
 * shows its price and is bought with a pinch, once the bank has the
 * money. The café starts with one server; the others are hired here.
 * The garden annex is bought here too, and once it is open, the bigger
 * café can take more staff: those plaques appear only then.
 *
 * `spot` is the shell's `PlaqueSpot-n`; `icon` the tile of the icon atlas
 * (0 barista, 7 annex).
 */
export interface ShopItem {
  id: 'annex' | 'server2' | 'server3' | 'server4' | 'server5' | 'server6';
  spot: number;
  icon: number;
  label: string;
  price: number;
  /** Only on sale once the annex is open. */
  needsAnnex?: boolean;
  /** Only on sale once this item is owned. */
  after?: ShopItem['id'];
}

export const SHOP: ShopItem[] = [
  { id: 'annex', spot: 1, icon: 7, label: 'ANNEX', price: 120 },
  { id: 'server2', spot: 2, icon: 0, label: 'SERVER', price: 40 },
  { id: 'server3', spot: 3, icon: 0, label: 'SERVER', price: 110, needsAnnex: true, after: 'server2' },
  { id: 'server4', spot: 4, icon: 0, label: 'SERVER', price: 160, needsAnnex: true, after: 'server3' },
  { id: 'server5', spot: 5, icon: 0, label: 'SERVER', price: 200, needsAnnex: true, after: 'server4' },
  { id: 'server6', spot: 6, icon: 0, label: 'SERVER', price: 240, needsAnnex: true, after: 'server5' },
];

/**
 * For now, while the café is being tried out: everything in the shop is
 * free and on sale at once (all five extra servers and the annex, in any
 * order, without waiting for the annex). Set false to bring back the
 * prices and the order above.
 */
export const FREE_SHOP = true;

/** The café opens with this many servers; each server plaque bought adds one. */
export const STARTING_STAFF = 1;
