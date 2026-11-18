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
 * The wishes, both cafés (the owner's list of 18 Nov 2026). Each has a
 * short label for the card's row and a line in the guest's own words; a
 * guest-linked one (`meet`, `avoid`, `kind`) names the other guest or its
 * shape in its words.
 *
 * Japanese café: window, door (by the gate), counter (by the baristas: the
 * back row, not the quiet corner), alone, company, big (a four-seater),
 * music (near the singer), quiet, friend, kind (with another guest of its
 * shape), meet (at a named guest's table), hat (with someone in a hat),
 * avoid (away from a named guest), calm (away from hurried guests).
 *
 * Canadian café: inside, warm (by the fireplace), alone, outside, patio,
 * company, bonfire, lake (the deck table by the lake: the dock was
 * removed), upstairs, kind, hat, friend, quiet, meet, avoid, calm, music
 * (near a musician the player has bought).
 *
 * The order each café lists them in is the order they come in
 * (guests/wish-plan.ts): the easy ones for the first guests, then a new
 * one with almost every guest.
 */
export type WishId =
  | 'window' | 'door' | 'counter' | 'big'
  | 'inside' | 'warm' | 'outside' | 'patio' | 'bonfire' | 'lake' | 'upstairs'
  | 'alone' | 'company' | 'music' | 'quiet' | 'friend' | 'kind' | 'meet' | 'hat' | 'avoid' | 'calm';

export interface WishInfo {
  id: WishId;
  /** On a refusal tag: "Wants ..." */
  wants: string;
  /** In its own words, for the card's second line. */
  says: string;
}

/** What a guest-linked wish names: the other guest's name, and the guest's own shape (`kind`). */
export interface WishWords {
  other?: string;
  shape?: string;
}

/** Each wish: its label (the card's row), what a refusal tag says it wants, and its line (`{o}` the named guest, `{s}` its shape). */
interface WishText {
  label: string;
  wants: string;
  line: string;
}

const JAPAN_TEXT: Partial<Record<WishId, WishText>> = {
  window: { label: 'Window seat', wants: 'a window seat', line: 'I like to watch the garden through the window.' },
  door: { label: 'By the gate', wants: 'a seat by the gate', line: "Sit me by the gate. I can't stay long." },
  counter: { label: 'By the baristas', wants: 'a seat by the baristas', line: 'I love to watch the baristas work.' },
  alone: { label: 'Table to myself', wants: 'a table to itself', line: 'Just me at my own table, please.' },
  company: { label: 'With other guests', wants: 'to sit with other guests', line: 'Sit me with someone. I like to chat.' },
  big: { label: 'Big table', wants: 'a big table', line: 'Sit me at a big table. I like space.' },
  music: { label: 'Near the singer', wants: 'to sit near the singer', line: 'Sit me near the singer. I love a good tune.' },
  quiet: { label: 'Quiet seat', wants: 'a quiet seat', line: 'A quiet table, far from the singer. I have a book.' },
  friend: { label: 'With my friend', wants: 'to sit with its friend', line: 'We came together. Sit us at the same table.' },
  kind: { label: 'With my kind', wants: 'to sit with its kind', line: 'Sit me with another {s}. We get along.' },
  meet: { label: 'Meet {o}', wants: 'to sit with {o}', line: "I came to meet {o}. Sit me at {o}'s table." },
  hat: { label: 'With a hat', wants: 'to sit with someone in a hat', line: 'Sit me with someone in a hat. I like hats.' },
  avoid: { label: 'Not with {o}', wants: 'to keep away from {o}', line: "{o} and I don't get along. Keep me away." },
  calm: { label: 'Not near the hurried', wants: 'to keep away from hurried guests', line: 'Hurried guests make me nervous. Keep me away.' },
};

const CANADA_TEXT: Partial<Record<WishId, WishText>> = {
  inside: { label: 'Inside', wants: 'a seat inside', line: 'Too cold out there. Sit me inside the cabin.' },
  warm: { label: 'By the fireplace', wants: 'a seat by the fireplace', line: "I'm cold. Sit me by the fireplace." },
  alone: JAPAN_TEXT.alone,
  outside: { label: 'Outside', wants: 'a seat outside', line: 'I want fresh air. Sit me outside.' },
  patio: { label: 'On the patio', wants: 'a seat on the patio', line: 'Sit me on the patio, under the lights.' },
  company: JAPAN_TEXT.company,
  bonfire: { label: 'At the bonfire', wants: 'a seat at the bonfire', line: "Sit me at the bonfire. I'll warm my hands." },
  lake: { label: 'By the lake', wants: 'a seat by the lake', line: 'Sit me by the lake. I like to see the ice.' },
  upstairs: { label: 'Upstairs', wants: 'a seat upstairs', line: 'Sit me upstairs. I like the mountain view.' },
  kind: JAPAN_TEXT.kind,
  hat: JAPAN_TEXT.hat,
  friend: JAPAN_TEXT.friend,
  quiet: { label: 'Quiet seat', wants: 'a quiet seat', line: 'A quiet table, far from the music. I have a book.' },
  meet: JAPAN_TEXT.meet,
  avoid: JAPAN_TEXT.avoid,
  calm: JAPAN_TEXT.calm,
  music: { label: 'Near the music', wants: 'to sit near the music', line: 'Sit me near the music. I love live tunes.' },
};

/** Each café's wishes, in the order they come in (the first ones are its easy ones, `EASY`). */
export const JAPAN_ORDER: WishId[] = ['window', 'door', 'counter', 'alone', 'company', 'big', 'music', 'quiet', 'friend', 'kind', 'meet', 'hat', 'avoid', 'calm'];
export const CANADA_ORDER: WishId[] = ['inside', 'warm', 'alone', 'outside', 'patio', 'company', 'bonfire', 'lake', 'upstairs', 'kind', 'hat', 'friend', 'quiet', 'meet', 'avoid', 'calm', 'music'];
/** The easy wishes, for a game's first guests (the Canadian café's starting tables meet all three). */
export const JAPAN_EASY: WishId[] = ['window', 'door', 'counter', 'alone'];
export const CANADA_EASY: WishId[] = ['inside', 'warm', 'alone'];

/** The café up now's wishes in order, and its easy ones. */
export const wishOrder = (): WishId[] => (isCanada() ? CANADA_ORDER : JAPAN_ORDER);
export const easyWishes = (): WishId[] => (isCanada() ? CANADA_EASY : JAPAN_EASY);

/** Place wishes (met by where the seat is): a guest has at most one. */
export const PLACE_WISHES: WishId[] = ['window', 'door', 'counter', 'big', 'inside', 'warm', 'outside', 'patio', 'bonfire', 'lake', 'upstairs'];
/** Guest-named wishes (they name another guest): a guest has at most one. */
export const NAMED_WISHES: WishId[] = ['meet', 'avoid'];
/** Wishes about another guest at the table (it must be seated there: meet, kind, hat), and ones about guests away (avoid, calm). */
export const LINKED_WISHES: WishId[] = ['kind', 'meet', 'hat', 'avoid', 'calm'];

function text(wish: WishId): WishText {
  return (isCanada() ? CANADA_TEXT[wish] : JAPAN_TEXT[wish]) ?? JAPAN_TEXT[wish] ?? CANADA_TEXT[wish] ?? { label: wish, wants: wish, line: '' };
}
const fill = (s: string, w: WishWords): string => s.split('{o}').join(w.other ?? 'a guest').split('{s}').join(w.shape ?? 'guest');

/** A wish's words in the café up now: what a refusal tag says it wants, and its own line. */
export function wishInfo(wish: WishId, words: WishWords = {}): WishInfo {
  const t = text(wish);
  return { id: wish, wants: fill(t.wants, words), says: fill(t.line, words) };
}

/** A wish's label for the card's row, in the café up now. */
export function wishShort(wish: WishId, words: WishWords = {}): string {
  return fill(text(wish).label, words);
}

/** What a guest's shape is called in a line ("Sit me with another onigiri"): its species, as people say it. */
export const SHAPE_NAMES: Record<string, string> = {
  mochi: 'mochi', onigiri: 'onigiri', tofu: 'tofu', snowbit: 'snowbit', beavertail: 'beaver tail', nanaimo: 'nanaimo bar', doubledouble: 'double-double', buttertart: 'butter tart',
};

/**
 * What each Canadian species leans toward: these come twice as often on its
 * card (PR #21), so a player learns to read a guest by its shape.
 */
export const SPECIES_LEAN: Record<string, WishId[]> = {
  snowbit: ['warm', 'inside'],
  beavertail: ['outside', 'lake', 'bonfire'],
  nanaimo: ['company', 'kind'],
  doubledouble: ['patio', 'upstairs'],
  buttertart: ['quiet', 'alone', 'upstairs'],
};

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
  /** Its shape (species), whether it wears a hat, and whether it is in a hurry. */
  species: string;
  hat: boolean;
  hurried: boolean;
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
  // In the Canadian café the bonfire's chairs are one table: they share the fire (company, alone, quiet).
  const fire = isCanada() ? CANADA_PLACES.bonfireTables : [];
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
    out.set(seat.index, fire.includes(seat.table) ? BONFIRE_TABLE : best);
  }
  return out;
}

/** The one table the bonfire's chairs make together (tablesOf); no piece has this index. */
export const BONFIRE_TABLE = -100;

/** Everything a seat is judged against for one guest. */
export interface GrantContext {
  /** The guest's own id, shape, the guest its named wish names (0: none), and whether it is cold. */
  self: number;
  species: string;
  link: number;
  cold: boolean;
  /** Who sits where now, and which table each seat is at. */
  sitters: readonly Sitter[];
  tables: Map<number, number>;
  /** The quiet corner's table (-1: none), the big tables (four-seaters), and where the musicians play. */
  quietCorner: number;
  bigTables: readonly number[];
  band: readonly Vector3[];
  friendship: Friendship | null;
}

/** Would `seat` grant `wish` now, for this guest, with the others seated as they are? */
export function grants(wish: WishId, seat: Seat, c: GrantContext): boolean {
  const table = c.tables.get(seat.index) ?? -1;
  const mates = c.sitters.filter((s) => s.id !== c.self && (c.tables.get(s.seat.index) ?? -2) === table);
  const singerNear = c.sitters.some((s) => s.id !== c.self && s.sings && Math.hypot(s.seat.position.x - seat.position.x, s.seat.position.z - seat.position.z) <= PLACES.earshot) || bandNear(seat, c.band);
  const at = seat.table;
  switch (wish) {
    case 'window':
      return seat.position.x < PLACES.windowX;
    case 'door':
      return seat.position.x > PLACES.doorX;
    case 'counter':
      return seat.position.z < PLACES.counterZ && table !== c.quietCorner;
    case 'big':
      return c.bigTables.includes(at);
    case 'inside':
      return CANADA_PLACES.insideTables.includes(at);
    case 'warm':
      // A cold guest is warmed by the bonfire as well as the fireplace (PR #21).
      return CANADA_PLACES.warmTables.includes(at) || (c.cold && CANADA_PLACES.bonfireTables.includes(at));
    case 'outside':
      return CANADA_PLACES.outsideTables.includes(at);
    case 'patio':
      return CANADA_PLACES.patioTables.includes(at);
    case 'bonfire':
      return CANADA_PLACES.bonfireTables.includes(at);
    case 'lake':
      return CANADA_PLACES.lakeTables.includes(at);
    case 'upstairs':
      return CANADA_PLACES.upperTables.includes(at);
    case 'quiet':
      return !singerNear && (table === c.quietCorner || mates.length === 0);
    case 'alone':
      return mates.length === 0;
    case 'company':
      return mates.length > 0;
    case 'music':
      return singerNear;
    case 'kind':
      return mates.some((s) => s.species === c.species);
    case 'hat':
      return mates.some((s) => s.hat);
    case 'meet':
      return mates.some((s) => s.id === c.link);
    case 'avoid':
      return !mates.some((s) => s.id === c.link);
    case 'calm':
      return !mates.some((s) => s.hurried);
    case 'friend': {
      const f = c.friendship;
      if (!f) return false;
      const friend = c.sitters.find((s) => s.id === f.friend);
      if (friend) return (c.tables.get(friend.seat.index) ?? -2) === table;
      // The friend is not seated yet: this table must have another free seat for it. Gone (or fuming): never.
      if (!f.waiting) return false;
      return f.free.some((s) => s !== seat && (c.tables.get(s.index) ?? -2) === table);
    }
  }
}

/** Is a seat in earshot of a musician playing (the Canadian café; `band` is where they stand, in the layout's order)? */
export function bandNear(seat: Seat, band: readonly Vector3[]): boolean {
  return band.some((p, i) => p.distanceTo(seat.position) <= (CANADA_PLACES.musicians[i]?.earshot ?? PLACES.earshot));
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
 * Wishes that contradict each other (the owner's rule 6): besides at most
 * one place wish (PLACE_WISHES) and at most one guest-named wish
 * (NAMED_WISHES), never alone with company; never quiet with the music or
 * company; never the friend with alone, company or quiet; never meeting
 * someone at a table to itself. And what can never be met together: a
 * table to itself with anyone else at it (kind, hat); quiet (a table to
 * itself, or the quiet corner's one chair) with anyone at it either.
 */
const CLASHES: [WishId, WishId][] = [
  ['alone', 'company'],
  ['quiet', 'music'],
  ['quiet', 'company'],
  ['friend', 'alone'],
  ['friend', 'company'],
  ['friend', 'quiet'],
  ['meet', 'alone'],
  ['kind', 'alone'],
  ['hat', 'alone'],
  ['kind', 'quiet'],
  ['hat', 'quiet'],
  ['meet', 'quiet'],
];

/** Can these wishes all go on one guest (rule 6)? */
export function compatible(wishes: readonly WishId[]): boolean {
  if (wishes.filter((w) => PLACE_WISHES.includes(w)).length > 1) return false;
  if (wishes.filter((w) => NAMED_WISHES.includes(w)).length > 1) return false;
  return CLASHES.every(([a, b]) => !(wishes.includes(a) && wishes.includes(b)));
}

/** Is this a place wish (met by where the seat is)? */
export function isPlaceWish(wish: WishId): boolean {
  return PLACE_WISHES.includes(wish);
}

/** The place wishes a pair can share (a table meets both): the café's own places. */
export function pairPlaces(): WishId[] {
  return wishOrder().filter(isPlaceWish);
}
