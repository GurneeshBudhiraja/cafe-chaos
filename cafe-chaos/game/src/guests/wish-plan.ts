/**
 * Which wishes a new guest gets (the owner's rules of 18 Nov 2026, both
 * cafés):
 *
 * 1. One wish for the first 3 guests of a run.
 * 2. From the 4th: about 1 in 3 have two; from level 3 about half, and
 *    three-wish guests begin; from level 5 up to three; mostly 2 or 3 from
 *    level 8 (game/rules.ts LEVEL.wishes).
 * 3. Wish types come in by guest count: the first 3 guests of a game have
 *    the café's easy wishes; after that a new type comes with almost every
 *    guest (`NEW_TYPE_CHANCE`), in the café's order (guests/wishes.ts), so
 *    all have come by about guest 16. A new type comes first on a one-wish
 *    guest (`first`, for its tip and its seats' glow).
 * 4. A wish is offered only if a seat can meet it before the guest's
 *    patience in the line runs out: a seat free now, or one about to free
 *    up (`meetable`, from GuestSystem).
 * 6. The wishes on one guest never contradict (wishes.ts `compatible`).
 * 7. A guest-linked wish only when it can be met: a hat-wearer, a hurried
 *    guest, the named guest, a singer or a musician is there; at most one
 *    guest-named wish.
 *
 * Pure: the café's state comes in through `PlanWorld`.
 */

import { compatible, easyWishes, NAMED_WISHES, wishOrder, type WishId } from './wishes.js';

/** How often a guest brings the next new wish type once the first 3 have come (else it draws from the types seen). */
export const NEW_TYPE_CHANCE = 0.95;

/** What the plan asks of the café. */
export interface PlanWorld {
  /** Guests in this game so far, this one included (1-based), and in this run (the count resets at a run's start). */
  gameGuest: number;
  runGuest: number;
  level: number;
  /** How many wishes the level gives (game/rules.ts wishCount). */
  count: () => number;
  /** The wish types this game has met already (saved with the café). */
  seen: ReadonlySet<WishId>;
  /** May this type be offered at all now (a singer or musician for music; a hat-wearer; a hurried guest; not outdoors in a storm)? */
  allowed: (wish: WishId) => boolean;
  /** The guests a named wish may name now (seated guests), for meet and avoid. */
  candidates: () => number[];
  /** Can a seat meet all of these, with this named guest, before this guest's patience runs out? */
  meetable: (wishes: WishId[], link: number) => boolean;
  /** Wishes this guest leans toward (twice as often), and one it must have (a cold guest's `warm`). */
  lean?: readonly WishId[];
  must?: WishId;
  random: () => number;
}

/** The plan for one guest: its wishes, the guest its named wish names (0: none), and the type it brings for the first time (null: none). */
export interface WishPlan {
  wishes: WishId[];
  link: number;
  first: WishId | null;
}

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length)];

/** A named guest for `wish` that makes `wishes` meetable, or 0 (none needed), or -1 (none works). */
function linkFor(wishes: WishId[], w: PlanWorld): number {
  if (!wishes.some((x) => NAMED_WISHES.includes(x))) return w.meetable(wishes, 0) ? 0 : -1;
  const ids = [...w.candidates()];
  // Try them in a random order: the first that works.
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(w.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.find((id) => w.meetable(wishes, id)) ?? -1;
}

/** The wishes for a new guest (see the notes at the top). */
export function planWishes(w: PlanWorld): WishPlan {
  const order = wishOrder();
  const easy = easyWishes();
  const ok = (wish: WishId): boolean => wish !== 'friend' && w.allowed(wish);
  // 1-3. The first guests of a game: one easy wish each, a new one first.
  if (w.gameGuest <= 3) {
    const options = easy.filter(ok);
    const fresh = options.filter((x) => !w.seen.has(x));
    for (const list of [w.must && options.includes(w.must) ? [w.must] : [], fresh, options]) {
      for (const wish of shuffled(list, w.random)) {
        if (w.meetable([wish], 0)) return { wishes: [wish], link: 0, first: w.seen.has(wish) ? null : wish };
      }
    }
    return { wishes: [], link: 0, first: null };
  }
  // 3. The next new type, on a one-wish guest, almost every time (a cold guest bringing one is not cold: GuestSystem).
  if (w.random() < NEW_TYPE_CHANCE) {
    for (const wish of order) {
      if (w.seen.has(wish) || !ok(wish)) continue;
      const link = linkFor([wish], w);
      if (link >= 0) return { wishes: [wish], link, first: wish };
    }
  }
  // 2, 4, 6, 7. Otherwise from the types seen: as many as the level gives (one in the first 3 of a run), compatible,
  // meetable together, the leanings twice as often.
  const want = w.runGuest <= 3 ? 1 : Math.max(1, Math.min(3, w.count()));
  const pool = order.filter((x) => w.seen.has(x) && ok(x));
  const draw = [...pool, ...(w.lean ?? []).filter((x) => pool.includes(x))];
  for (let attempt = 0; attempt < 16; attempt++) {
    const picked: WishId[] = w.must && ok(w.must) ? [w.must] : [];
    let link = linkFor(picked, w);
    if (picked.length && link < 0) picked.length = 0;
    const left = shuffled(draw, w.random);
    while (picked.length < want && left.length) {
      const wish = left.shift()!;
      if (picked.includes(wish)) continue;
      const next = [...picked, wish];
      if (!compatible(next)) continue;
      const l = linkFor(next, w);
      if (l < 0) continue;
      picked.push(wish);
      link = l;
    }
    if (picked.length) return { wishes: picked, link: Math.max(0, link), first: null };
  }
  // Nothing fits just now (a full café): one easy wish that does, or none.
  for (const wish of shuffled(easy.filter(ok), w.random)) if (w.meetable([wish], 0)) return { wishes: [wish], link: 0, first: null };
  return { wishes: [], link: 0, first: null };
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every pair of wishes among `wishes` that contradict (for the checks): none, for a guest the plan made. */
export function contradictions(wishes: readonly WishId[]): [WishId, WishId][] {
  const out: [WishId, WishId][] = [];
  for (let i = 0; i < wishes.length; i++) for (let j = i + 1; j < wishes.length; j++) if (!compatible([wishes[i], wishes[j]])) out.push([wishes[i], wishes[j]]);
  return out;
}

export { pick };
