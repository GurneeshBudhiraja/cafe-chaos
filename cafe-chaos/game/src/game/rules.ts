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
 * A guest who leaves unhappy takes something with it: some happiness and
 * a few coins (never below zero). Storming out of a seat, having been
 * seated and then kept waiting for food, is the worse of the two.
 */
export const LOSSES = {
  gaveUp: { coins: 2, happiness: 9 },
  stormedOff: { coins: 4, happiness: 13 },
};

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
  id: 'annex' | 'server2' | 'server3' | 'server4';
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
  { id: 'annex', spot: 1, icon: 7, label: 'ANNEX', price: 80 },
  { id: 'server2', spot: 2, icon: 0, label: 'SERVER', price: 30 },
  { id: 'server3', spot: 3, icon: 0, label: 'SERVER', price: 60, needsAnnex: true, after: 'server2' },
  { id: 'server4', spot: 4, icon: 0, label: 'SERVER', price: 90, needsAnnex: true, after: 'server3' },
];

/** The café opens with this many servers; each server plaque bought adds one. */
export const STARTING_STAFF = 1;
