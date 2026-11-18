/**
 * What is kept between sessions, in the browser's local storage on the
 * headset (where that is not available, a private window, it lasts only as
 * long as the page).
 *
 * One save for each café (its bank, tables, staff, level and how far into
 * it, the café's happiness), and, shared by both: the settings, the first
 * run's teaching, the tips already shown, which cafés the player owns, and
 * the café played last (the start card puts it first).
 *
 * Who was sitting where is not kept: a level carried on later starts with
 * an empty café and the count it had.
 *
 * The Canadian café's free trial is never saved: its progress is kept only
 * if the café is bought during the trial (GameSystem).
 *
 * Test mode (`?test` in the address, used by the check and recording
 * scripts) never reads or writes it: every run starts the same.
 */

import { CAFE_IDS, type CafeId } from '../cafe/style.js';
import { startTables } from './rules.js';

/** One café's progress. */
export interface Progress {
  bank: number;
  /** The tables the player has open (indices into the café's pieces), the starting ones included. */
  tables: number[];
  /** Servers hired beyond the first (0 to HIRE_PRICES.length), and whether the janitor is hired. */
  hires: number;
  janitor: boolean;
  /** The Canadian café's second janitor. */
  janitor2: boolean;
  /** The Canadian café's musicians bought (0 to 2: the fiddler, then the pianist). */
  musicians: number;
  /** The level the player is on (1-based), guests served in it so far, and the café's happiness. */
  level: number;
  levelServed: number;
  happiness: number;
  /** The highest level reached. */
  bestLevel: number;
  /** The first hurried guest and the first pair have been cued (they come on cue once, then by chance). */
  metHurry: boolean;
  metPair: boolean;
  runs: number;
  /** The seed of this game's table order (game/table-order.ts): drawn once a new game, so Continue shows the same next table. 0: none yet. */
  tableSeed: number;
}

/** What both cafés share. */
export interface Shared {
  tutorialDone: boolean;
  /** The tips already shown (game/tips.ts): each shows once. */
  tips: string[];
  /** Settings: music and sounds (0 off to 5), and the café's size (percent). */
  music: number;
  sounds: number;
  size: number;
  /** The cafés the player owns (the Japanese one always), and the one played last. */
  owned: CafeId[];
  last: CafeId;
  /** The one-time note in the Japanese café that the Canadian café can be bought has been shown. */
  forSaleSeen: boolean;
}

/** The café up now, as the game works with it: its progress and the shared part together. */
export type Save = Progress & Shared;

interface Store extends Shared {
  cafes: Partial<Record<CafeId, Progress>>;
}

/**
 * v4: one save a café. A v3 save (one café) becomes the Japanese café's. A
 * v2 save (the endless evening, where guests paid 5 to 16 coins) would open
 * with a bank that buys everything at once, so only its settings and the
 * first run's teaching are carried over.
 */
const KEY = 'cafe-chaos/save/v4';
const V3_KEY = 'cafe-chaos/save/v3';
const V2_KEY = 'cafe-chaos/save/v2';

/** True when the page was opened for the checks and recordings (`?test`). */
export const TEST_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');

export function freshProgress(id: CafeId): Progress {
  return { bank: 0, tables: [...startTables(id)], hires: 0, janitor: false, janitor2: false, musicians: 0, level: 1, levelServed: 0, happiness: 100, bestLevel: 1, metHurry: false, metPair: false, runs: 0, tableSeed: 0 };
}

function freshShared(): Shared {
  return { tutorialDone: false, tips: [], music: 2, sounds: 3, size: 100, owned: ['japan'], last: 'japan', forSaleSeen: false };
}

const PROGRESS_KEYS = Object.keys(freshProgress('japan')) as (keyof Progress)[];
const SHARED_KEYS = Object.keys(freshShared()) as (keyof Shared)[];

function pick<T extends object>(from: Partial<Record<string, unknown>>, keys: (keyof T)[], base: T): T {
  const out = { ...base };
  for (const k of keys) if (from[k as string] !== undefined) (out as Record<string, unknown>)[k as string] = from[k as string];
  return out;
}

/** Every café's save and the shared part; loaded once, written whole. */
export class SaveBook {
  private store: Store;

  constructor() {
    this.store = TEST_MODE ? { ...freshShared(), cafes: {} } : read();
  }

  /** Does the player own this café? */
  owns(id: CafeId): boolean {
    return id === 'japan' || this.store.owned.includes(id);
  }

  get last(): CafeId {
    return this.store.last;
  }

  /** A café's save as it stands (a fresh one if it has none), with the shared part. */
  load(id: CafeId): Save {
    const progress = this.store.cafes[id] ?? freshProgress(id);
    return { ...pick(this.store as unknown as Record<string, unknown>, SHARED_KEYS, freshShared()), ...pick(progress as unknown as Record<string, unknown>, PROGRESS_KEYS, freshProgress(id)) };
  }

  /** Has this café a save worth continuing (the first run done there, or anything earned)? */
  started(id: CafeId): boolean {
    const p = this.store.cafes[id];
    if (!p) return false;
    return p.runs > 0 || p.bank > 0 || p.hires > 0 || p.level > 1 || p.levelServed > 0 || p.janitor;
  }

  /**
   * Write the café up now: always the shared part (settings, teaching,
   * tips, the café played last); its progress only when `progress` (not in
   * the free trial).
   */
  write(save: Save, id: CafeId, progress = true): void {
    for (const k of SHARED_KEYS) if (k !== 'owned') (this.store as unknown as Record<string, unknown>)[k] = save[k];
    this.store.owned = [...new Set<CafeId>(['japan', ...this.store.owned])];
    if (progress) this.store.cafes[id] = pick(save as unknown as Record<string, unknown>, PROGRESS_KEYS, freshProgress(id));
    this.flush();
  }

  /** The café up now is the one played last. */
  setLast(id: CafeId): void {
    this.store.last = id;
    this.flush();
  }

  /** Buy a café: it is owned from now on. */
  setOwned(id: CafeId): void {
    if (!this.store.owned.includes(id)) this.store.owned.push(id);
    this.flush();
  }

  /** Change one café's progress without loading it (the Japanese bank, when the Canadian café is bought). */
  change(id: CafeId, f: (p: Progress) => void): void {
    const p = this.store.cafes[id] ?? freshProgress(id);
    f(p);
    this.store.cafes[id] = p;
    this.flush();
  }

  /** Drop a café's progress (a new game there, or a fresh start once bought). */
  reset(id: CafeId): void {
    this.store.cafes[id] = freshProgress(id);
    this.flush();
  }

  /** The shared part only (the settings, from the start card). */
  writeShared(save: Save): void {
    for (const k of SHARED_KEYS) if (k !== 'owned' && k !== 'last') (this.store as unknown as Record<string, unknown>)[k] = save[k];
    this.flush();
  }

  /** A café's bank, without loading it. */
  bank(id: CafeId): number {
    return this.store.cafes[id]?.bank ?? 0;
  }

  private flush(): void {
    if (TEST_MODE) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.store));
    } catch {
      // No storage (a private window): it lasts as long as the page.
    }
  }
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>;
      const store: Store = { ...pick(parsed as Record<string, unknown>, SHARED_KEYS, freshShared()), cafes: {} };
      for (const id of CAFE_IDS) {
        const p = parsed.cafes?.[id];
        if (p) store.cafes[id] = pick(p as unknown as Record<string, unknown>, PROGRESS_KEYS, freshProgress(id));
      }
      if (!CAFE_IDS.includes(store.last)) store.last = 'japan';
      store.owned = store.owned.filter((id) => CAFE_IDS.includes(id));
      return store;
    }
    // A v3 save: the one café there was is the Japanese café.
    const v3 = localStorage.getItem(V3_KEY);
    if (v3) {
      const old = JSON.parse(v3) as Record<string, unknown>;
      return { ...pick(old, SHARED_KEYS, freshShared()), owned: ['japan'], last: 'japan', forSaleSeen: false, cafes: { japan: pick(old, PROGRESS_KEYS, freshProgress('japan')) } };
    }
    const v2 = localStorage.getItem(V2_KEY);
    if (v2) {
      const old = JSON.parse(v2) as Record<string, unknown>;
      const shared = freshShared();
      for (const k of ['music', 'sounds', 'size', 'tutorialDone'] as const) if (old[k] !== undefined) (shared as unknown as Record<string, unknown>)[k] = old[k];
      return { ...shared, cafes: {} };
    }
  } catch {
    // A broken save: start afresh.
  }
  return { ...freshShared(), cafes: {} };
}
