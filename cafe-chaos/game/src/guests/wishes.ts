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
 * - `music`: near a guest who sings;
 * - `friend`: at the same table as the friend it came with (a pair).
 *   Before the friend is seated a seat counts if its table has a free seat
 *   left for the friend; once both sit it counts if they share a table.
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
import { CANADA_PLACES } from '../cafe/canada-layout.js';
import { isCanada } from '../cafe/style.js';
import type { Seat } from './seats.js';

/**
 * The Canadian café's wishes (docs/CANADA-PLAN.md) are places of its own:
 * `socket` (a table under a wall socket), `outside` (any seat not in the
 * cabin), `takeaway` (no table: carried to the counter's pick-up spot),
 * `patio` (the deck), `bonfire` (the chairs round the
 * fire), `warm` (the tables by the fireplace), `upstairs` (the upper deck);
 * and `music` there is a seat in earshot of a musician the player has
 * bought (no guest sings there).
 */
export type WishId = 'window' | 'door' | 'counter' | 'quiet' | 'alone' | 'company' | 'music' | 'friend' | 'socket' | 'outside' | 'takeaway' | 'lake' | 'patio' | 'bonfire' | 'warm' | 'upstairs';

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
  friend: { id: 'friend', wants: 'to sit with its friend', says: 'We came together!' },
  socket: { id: 'socket', wants: 'a seat by a socket', says: 'My laptop needs power.' },
  outside: { id: 'outside', wants: 'a seat outside', says: 'I like the fresh air.' },
  takeaway: { id: 'takeaway', wants: 'a coffee to take away', says: 'No table, thanks!' },
  lake: { id: 'lake', wants: 'a seat by the lake', says: 'I like to see the water.' },
  patio: { id: 'patio', wants: 'a seat on the patio', says: 'I like the patio.' },
  bonfire: { id: 'bonfire', wants: 'a seat at the bonfire', says: 'I like the fire.' },
  warm: { id: 'warm', wants: 'a seat by the fireplace', says: 'I am cold!' },
  upstairs: { id: 'upstairs', wants: 'a seat upstairs', says: 'I like the view.' },
};

/** The Canadian café's `music`: a musician, not a singing guest. */
const MUSIC_CANADA: WishInfo = { id: 'music', wants: 'to sit near the music', says: 'I love live music.' };

/** A wish's words in the café up now. */
export function wishInfo(wish: WishId): WishInfo {
  return wish === 'music' && isCanada() ? MUSIC_CANADA : WISHES[wish];
}

/** Each wish in a few words, for the request card's rows (ui/wish-card.ts). */
export const WISH_SHORT: Record<WishId, string> = {
  window: 'Window seat',
  door: 'By the gate',
  counter: 'By the counter',
  quiet: 'Somewhere quiet',
  alone: 'Table to itself',
  company: 'Some company',
  music: 'Near the singer',
  friend: 'With my friend',
  socket: 'By a socket',
  outside: 'Outside',
  takeaway: 'To take away',
  lake: 'By the lake',
  patio: 'On the patio',
  bonfire: 'At the bonfire',
  warm: 'By the fireplace',
  upstairs: 'Upstairs',
};

/** A wish in a few words, in the café up now. */
export function wishShort(wish: WishId): string {
  return wish === 'music' && isCanada() ? 'Near the music' : WISH_SHORT[wish];
}

/** The Canadian café's place wishes, and the ones that go together (both inside tables are by a socket and the fire; every outdoor place is outside). */
const CANADA_PLACE_WISHES: WishId[] = ['socket', 'warm', 'outside', 'patio', 'bonfire', 'upstairs'];
const CANADA_TOGETHER: [WishId, WishId][] = [
  ['socket', 'warm'],
  ['outside', 'patio'],
  ['outside', 'bonfire'],
  ['outside', 'upstairs'],
];
/** How often a Canadian guest wants only a coffee to take away (it then has no other wish). */
export const TAKEAWAY_CHANCE = 0.12;

/** The wishes a guest may be given when nobody on stage sings (`music` needs a singer). */
const ALWAYS: WishId[] = ['window', 'door', 'counter', 'quiet', 'alone', 'company'];

/** The guests' names: short, soft, the café's own; none is a barista's. */
export const NAMES = [
  'Miso', 'Pip', 'Dango', 'Yuzu', 'Kiko', 'Bao', 'Taro', 'Nori', 'Suki', 'Poppy', 'Mochi', 'Tofu', 'Kumo', 'Hoshi', 'Peko', 'Riku',
  'Nana', 'Goma', 'Azuki', 'Maru', 'Chibi', 'Koko', 'Niko', 'Umi', 'Tama', 'Fuku', 'Sumi', 'Anko', 'Beni', 'Haru', 'Kaya', 'Lulu',
];

/** Where the wishes' places are (café space, metres). */
export const PLACES = {
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

/**
 * For the `friend` wish: the friend's id, and the seats free now (open,
 * clean, nobody on them), to tell whether a table still has room for it.
 */
export interface Friendship {
  friend: number;
  free: readonly Seat[];
  /** The friend is still to be seated (in the line or a hand). False once it has gone (it can no longer join). */
  waiting: boolean;
}

/** Which table each seat is at: the index of the nearest table, bar or corner piece (seats at one table share it). */
export function tablesOf(seats: Seat[], pieces: { name: string; position: Vector3 }[]): Map<number, number> {
  const tables = pieces.map((piece, index) => ({ piece, index })).filter(({ piece }) => /table|bar|quiet|booth|bench|chair/i.test(piece.name));
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
export function grants(wish: WishId, seat: Seat, self: number, sitters: Sitter[], tables: Map<number, number>, quietCorner: number, friendship: Friendship | null = null, band: readonly Vector3[] = []): boolean {
  // The takeaway spot meets the takeaway wish and nothing else; no other seat meets it.
  if (seat.takeaway || wish === 'takeaway') return !!seat.takeaway && wish === 'takeaway';
  const table = tables.get(seat.index) ?? -1;
  const mates = sitters.filter((s) => s.id !== self && (tables.get(s.seat.index) ?? -2) === table).length;
  const singerNear = sitters.some((s) => s.id !== self && s.sings && Math.hypot(s.seat.position.x - seat.position.x, s.seat.position.z - seat.position.z) <= PLACES.earshot) || bandNear(seat, band);
  const at = seat.table;
  switch (wish) {
    case 'socket':
      return CANADA_PLACES.socketTables.includes(at);
    case 'warm':
      return CANADA_PLACES.warmTables.includes(at);
    case 'outside':
      return CANADA_PLACES.outsideTables.includes(at);
    case 'patio':
      return CANADA_PLACES.patioTables.includes(at);
    case 'lake':
      // The lake bench was cut from the Canadian café (model round 4): no seat is by the lake, and nobody wishes for it.
      return false;
    case 'bonfire':
      return CANADA_PLACES.bonfireTables.includes(at);
    case 'upstairs':
      return CANADA_PLACES.upperTables.includes(at);
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
    case 'friend': {
      if (!friendship) return false;
      const friend = sitters.find((s) => s.id === friendship.friend);
      if (friend) return (tables.get(friend.seat.index) ?? -2) === table;
      // The friend is not seated yet: this table must have another free seat for it. Gone (or fuming): never.
      if (!friendship.waiting) return false;
      return friendship.free.some((s) => s !== seat && (tables.get(s.index) ?? -2) === table);
    }
  }
}

/** Is a seat in earshot of a musician playing (the Canadian café; `band` is where they stand, in the layout's order)? */
function bandNear(seat: Seat, band: readonly Vector3[]): boolean {
  return band.some((p, i) => p.distanceTo(seat.position) <= (CANADA_PLACES.musicians[i]?.earshot ?? PLACES.earshot));
}

/**
 * The wishes some open seat could meet, given the seats that are open
 * (not on a locked table): a place wish only if a seat is in that place;
 * company and alone always (every table seats two or more, or stands
 * alone); quiet always (an empty table is quiet). With only the two
 * starting tables open, nobody wishes for the window.
 */
export function openWishes(open: readonly Seat[], quietCorner: number, band: readonly Vector3[] = []): WishId[] {
  const out: WishId[] = ['quiet', 'alone', 'company'];
  if (isCanada()) {
    const tables = open.filter((s) => !s.takeaway).map((s) => s.table);
    const has = (list: number[]): boolean => tables.some((t) => list.includes(t));
    const P = CANADA_PLACES;
    if (has(P.socketTables)) out.push('socket');
    if (has(P.warmTables)) out.push('warm');
    if (has(P.outsideTables)) out.push('outside');
    if (has(P.patioTables)) out.push('patio');
    if (has(P.bonfireTables)) out.push('bonfire');
    if (has(P.upperTables)) out.push('upstairs');
    // Music once a musician plays in earshot of an open seat.
    if (open.some((s) => !s.takeaway && bandNear(s, band))) out.push('music');
    return out;
  }
  if (open.some((s) => s.position.x < PLACES.windowX)) out.push('window');
  if (open.some((s) => s.position.x > PLACES.doorX)) out.push('door');
  if (open.some((s) => s.position.z < PLACES.counterZ && s.table !== quietCorner)) out.push('counter');
  return out;
}

/** The Canadian café's guests' names: none a barista's (Maple, Aspen, Rowan, Birch, Cedar). */
export const CANADA_NAMES = [
  'Moose', 'Loonie', 'Toonie', 'Poutine', 'Bannock', 'Juniper', 'Puck', 'Caribou', 'Otter', 'Elk', 'Flapjack', 'Syrup', 'Cocoa', 'Marmot', 'Lynx', 'Willow',
  'Spruce', 'Tamarack', 'Pebble', 'Frost', 'Snowy', 'Biscuit', 'Kettle', 'Ginger', 'Nutmeg', 'Clover', 'Hazel', 'Pip', 'Sugar', 'Butter', 'Pancake', 'Bramble',
];

/** A name not in use on stage. */
export function pickName(taken: Set<string>, random: () => number = Math.random): string {
  const names = isCanada() ? CANADA_NAMES : NAMES;
  const free = names.filter((name) => !taken.has(name));
  const from = free.length > 0 ? free : names;
  return from[Math.floor(random() * from.length)];
}

/**
 * Wishes that cannot both be met, or make no sense together: at most one
 * place (window, gate, counter); never alone with company; never quiet
 * with the singer or with company.
 */
const CLASHES: [WishId, WishId][] = [
  ['window', 'door'],
  ['window', 'counter'],
  ['door', 'counter'],
  ['alone', 'company'],
  ['quiet', 'music'],
  ['quiet', 'company'],
  ['friend', 'alone'],
  ['friend', 'company'],
  ['friend', 'quiet'],
];

/** Can these wishes all be met together? (In the Canadian café, at most one place, or two that go together.) */
export function compatible(wishes: WishId[]): boolean {
  if (!CLASHES.every(([a, b]) => !(wishes.includes(a) && wishes.includes(b)))) return false;
  const places = wishes.filter((w) => CANADA_PLACE_WISHES.includes(w));
  if (places.length > 2) return false;
  if (places.length === 2 && !CANADA_TOGETHER.some(([a, b]) => places.includes(a) && places.includes(b))) return false;
  return !wishes.includes('takeaway') || wishes.length === 1;
}

/** The place wishes a pair can share (a table meets both): the Japanese café's three, or the Canadian café's. */
export function pairPlaces(): WishId[] {
  return isCanada() ? CANADA_PLACE_WISHES : ['window', 'door', 'counter'];
}

/**
 * `count` wishes (1 to 3) for a new guest, all compatible, `music` among
 * the choices only while someone on stage sings, and not the very same
 * set the last guest had (so the line is a mix). Every set it makes can be
 * met by some seat in the café: at most one place wish, and the rest about
 * company and quiet, which any table can grant.
 */
export function pickWishes(count: number, singerAbout: boolean, last: WishId[], random: () => number = Math.random, open: readonly WishId[] = ALWAYS): WishId[] {
  const pool: WishId[] = singerAbout ? [...open, 'music' as const] : [...open];
  const want = Math.max(1, Math.min(3, Math.round(count)));
  for (let attempt = 0; attempt < 24; attempt++) {
    const picked: WishId[] = [];
    const left = [...pool];
    while (picked.length < want && left.length > 0) {
      const wish = left.splice(Math.floor(random() * left.length), 1)[0];
      if (compatible([...picked, wish])) picked.push(wish);
    }
    if (picked.length === 0) continue;
    const same = picked.length === last.length && picked.every((w) => last.includes(w));
    if (!same || attempt > 12) return picked;
  }
  return [pool[Math.floor(random() * pool.length)]];
}
