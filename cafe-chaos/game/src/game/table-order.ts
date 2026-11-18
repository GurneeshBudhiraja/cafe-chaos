/**
 * The order the tables open in, for one game.
 *
 * - The starting tables are not in it (they are open from the start; the
 *   first run's lesson uses them).
 * - The others come in rings by reach, nearest the player first
 *   (cafe/layout.ts TABLE_RINGS, cafe/canada-layout.ts CANADA_TABLE_RINGS):
 *   all of one ring before any of the next.
 * - Inside a ring the tables are shuffled (Fisher–Yates on a seeded
 *   generator, pure-rand's xoroshiro128+), then put in the order, among the
 *   ring's orders, that best keeps variety: never two tables of the same kind
 *   in a row where the café has the tables to avoid it, and window and gate
 *   seats spread out (two window tables or two gate tables in a row are
 *   avoided next). Ties go to the shuffle, so each seed gives its own order.
 * - The seed is drawn once a new game (`newSeed`) and kept in that café's
 *   save, so Continue shows the same next table and New game a new order.
 *
 * Pure: no scene, no Math.random.
 */

import prand from 'pure-rand';

/** A table that can be bought: its index into the café's pieces, its kind (the model), and its side of the room. */
export interface OrderTable {
  index: number;
  kind: string;
  side: 'window' | 'gate' | 'middle';
}

/** What a repeat costs, so the best order has the fewest of the worst: the same kind twice beats the same side twice. */
const COST = { kind: 10, side: 3 };
/** A ring of more tables than this is not searched through every order (n! grows fast): it keeps its shuffle, made greedy. */
const SEARCH_MAX = 6;

/** A new game's seed (32 bits), from the browser's own random source. */
export function newSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] | 0;
  return (Date.now() ^ 0x5f3759df) | 0;
}

/** Shuffle a copy of `list` with Fisher–Yates, drawing from `rng` (pure-rand); returns it and the generator after. */
function shuffle<T>(list: readonly T[], rng: prand.RandomGenerator): [T[], prand.RandomGenerator] {
  const out = [...list];
  let g = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = prand.uniformIntDistribution(0, i, g);
    g = next;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, g];
}

/** What following `a` with `b` costs (null `a`: nothing before it). */
function step(a: OrderTable | null, b: OrderTable): number {
  if (!a) return 0;
  return (a.kind === b.kind ? COST.kind : 0) + (a.side !== 'middle' && a.side === b.side ? COST.side : 0);
}

/** The cheapest order of `ring` after `prev`: every order searched (small rings), the first cheapest in the shuffle's order winning. */
function bestOrder(ring: OrderTable[], prev: OrderTable | null): OrderTable[] {
  if (ring.length <= 1) return ring;
  if (ring.length > SEARCH_MAX) {
    // Greedy: the first in the shuffle that costs least after the one before.
    const left = [...ring];
    const out: OrderTable[] = [];
    let last = prev;
    while (left.length) {
      let best = 0;
      for (let i = 1; i < left.length; i++) if (step(last, left[i]) < step(last, left[best])) best = i;
      last = left.splice(best, 1)[0];
      out.push(last);
    }
    return out;
  }
  let best: OrderTable[] = ring;
  let bestCost = Infinity;
  const used = new Array<boolean>(ring.length).fill(false);
  const path: OrderTable[] = [];
  const walk = (last: OrderTable | null, cost: number): void => {
    if (cost >= bestCost) return;
    if (path.length === ring.length) {
      best = [...path];
      bestCost = cost;
      return;
    }
    for (let i = 0; i < ring.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(ring[i]);
      walk(ring[i], cost + step(last, ring[i]));
      path.pop();
      used[i] = false;
    }
  };
  walk(prev, 0);
  return best;
}

/**
 * The order the tables open in (indices into the café's pieces), for this
 * seed: ring by ring, each shuffled, then the order with the most variety.
 * `rings` are lists of table indices, nearest the player first; `info`
 * gives each table's kind and side. Tables in no ring come last, in index
 * order.
 */
export function tableOrder(seed: number, rings: readonly (readonly number[])[], info: (index: number) => OrderTable): number[] {
  let rng = prand.xoroshiro128plus(seed | 0);
  const out: OrderTable[] = [];
  for (const ring of rings) {
    const [mixed, next] = shuffle(ring.map(info), rng);
    rng = next;
    out.push(...bestOrder(mixed, out[out.length - 1] ?? null));
  }
  return out.map((t) => t.index);
}

/** How many repeats an order has: the same kind twice in a row, and the same side twice in a row (for the checks). */
export function repeats(order: readonly number[], info: (index: number) => OrderTable): { kind: number; side: number } {
  let kind = 0;
  let side = 0;
  for (let i = 1; i < order.length; i++) {
    const a = info(order[i - 1]);
    const b = info(order[i]);
    if (a.kind === b.kind) kind++;
    if (a.side !== 'middle' && a.side === b.side) side++;
  }
  return { kind, side };
}
