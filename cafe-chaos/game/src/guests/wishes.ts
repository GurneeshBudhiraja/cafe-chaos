/**
 * Guests with wishes: every guest has a name of its own, and many have a
 * wish about where they sit. Granting it is the puzzle on top of the
 * rush: the right seat for this guest, while the line grows.
 *
 * A wish is judged from where the guest sits and who sits with it:
 *
 * - `window`: by the windows (the seats along the café's left wall);
 * - `door`: near the way out, by the gate (the right-hand seats);
 * - `counter`: by the counter, to watch the baristas (the back row);
 * - `quiet`: somewhere quiet: the quiet corner, or a table to itself with
 *   no singer near;
 * - `alone`: a table to itself;
 * - `company`: a table shared with another guest;
 * - `music`: near a guest who sings.
 *
 * Now and then a guest is a singer: notes float up from it while it
 * sits. It wants company (an audience); music lovers want to be near it,
 * and it is the opposite of quiet.
 *
 * `alone`, `company`, `quiet` and `music` depend on the other guests, so
 * they can come true or stop being true after the guest has sat down: a
 * loner is put out when someone joins its table, and a guest who wanted
 * company is pleased when someone does.
 *
 * What a wish is worth is in game/rules.ts (WISH); how it is shown is in
 * guests/wish-art.ts (the pictures) and ui/wish-card.ts (the card).
 * The names, wishes and words are this café's own.
 */

import type { Vector3 } from '@iwsdk/core';
import type { Seat } from './seats.js';

export type WishId = 'window' | 'door' | 'counter' | 'quiet' | 'alone' | 'company' | 'music';

export interface WishInfo {
  id: WishId;
  /** On the card, after the name: "Miso wants ..." */
  wants: string;
  /** In its own words, for the card's second line. */
  says: string;
}

export const WISHES: Record<WishId, WishInfo> = {
  window: { id: 'window', wants: 'a window seat', says: 'I like to watch the garden.' },
  door: { id: 'door', wants: 'a seat by the gate', says: "I can't stay long!" },
  counter: { id: 'counter', wants: 'a seat by the counter', says: 'I love watching the baristas.' },
  quiet: { id: 'quiet', wants: 'somewhere quiet', says: 'Shh... I have a book.' },
  alone: { id: 'alone', wants: 'a table to itself', says: 'Just me today, please.' },
  company: { id: 'company', wants: 'some company', says: "Don't sit me on my own!" },
  music: { id: 'music', wants: 'to sit near the singer', says: 'I love a good tune.' },
};

/** The wishes a guest may be given when nobody on stage sings (`music` needs a singer). */
const ALWAYS: WishId[] = ['window', 'door', 'counter', 'quiet', 'alone', 'company'];

/** The guests' names: short, soft, the café's own; none is a barista's. */
export const NAMES = [
  'Miso', 'Pip', 'Dango', 'Yuzu', 'Kiko', 'Bao', 'Taro', 'Nori', 'Suki', 'Poppy', 'Mochi', 'Tofu', 'Kumo', 'Hoshi', 'Peko', 'Riku',
  'Nana', 'Goma', 'Azuki', 'Maru', 'Chibi', 'Koko', 'Niko', 'Umi', 'Tama', 'Fuku', 'Sumi', 'Anko', 'Beni', 'Haru', 'Kaya', 'Lulu',
];

/** Where the wishes' places are (café space, metres). */
const PLACES = {
  /** Seats left of this are by the windows. */
  windowX: -0.2,
  /** Seats right of this are by the gate. */
  doorX: 0.15,
  /** Seats behind this are by the counter. */
  counterZ: -0.05,
  /** A singer within this of a seat is "near" it. */
  earshot: 0.17,
};

/** What a seated guest is to the wishes of the others. */
export interface Sitter {
  id: number;
  seat: Seat;
  sings: boolean;
}

/** Which table each seat is at: the index of the nearest table, bar or corner piece (seats at one table share it). */
export function tablesOf(seats: Seat[], pieces: { name: string; position: Vector3 }[]): Map<number, number> {
  const tables = pieces.map((piece, index) => ({ piece, index })).filter(({ piece }) => /table|bar|quiet|booth|bench/i.test(piece.name));
  const out = new Map<number, number>();
  for (const seat of seats) {
    let best = -1;
    let bestDistance = Infinity;
    for (const { piece, index } of tables) {
      const d = Math.hypot(piece.position.x - seat.position.x, piece.position.z - seat.position.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = index;
      }
    }
    out.set(seat.index, best);
  }
  return out;
}

/**
 * Would `seat` grant `wish` to guest `self` now, with `sitters` seated as
 * they are? `tables` is from `tablesOf`; `quietCorner` is the table index
 * of the quiet corner (-1 if the café has none).
 */
export function grants(wish: WishId, seat: Seat, self: number, sitters: Sitter[], tables: Map<number, number>, quietCorner: number): boolean {
  const table = tables.get(seat.index) ?? -1;
  const mates = sitters.filter((s) => s.id !== self && (tables.get(s.seat.index) ?? -2) === table).length;
  const singerNear = sitters.some((s) => s.id !== self && s.sings && Math.hypot(s.seat.position.x - seat.position.x, s.seat.position.z - seat.position.z) <= PLACES.earshot);
  switch (wish) {
    case 'window':
      return seat.position.x < PLACES.windowX;
    case 'door':
      return seat.position.x > PLACES.doorX;
    case 'counter':
      return seat.position.z < PLACES.counterZ && table !== quietCorner;
    case 'quiet':
      return !singerNear && (table === quietCorner || mates === 0);
    case 'alone':
      return mates === 0;
    case 'company':
      return mates > 0;
    case 'music':
      return singerNear;
  }
}

/** A name not in use on stage. */
export function pickName(taken: Set<string>, random: () => number = Math.random): string {
  const free = NAMES.filter((name) => !taken.has(name));
  const from = free.length > 0 ? free : NAMES;
  return from[Math.floor(random() * from.length)];
}

/**
 * A wish for a new guest: none with chance `1 - chance`; otherwise one at
 * random, `music` among them only while someone on stage sings, and never
 * the wish the last guest had (so the line is a mix).
 */
export function pickWish(chance: number, singerAbout: boolean, last: WishId | null, random: () => number = Math.random): WishId | null {
  if (random() >= chance) return null;
  const from = (singerAbout ? [...ALWAYS, 'music' as const] : ALWAYS).filter((w) => w !== last);
  return from[Math.floor(random() * from.length)];
}
