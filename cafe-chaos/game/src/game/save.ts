/**
 * What the café keeps between sessions: the money in the bank, how many
 * servers have been hired, the level and how far into it the player is
 * (guests served, and the café's happiness), and whether the first run's
 * teaching has been seen. Kept in the browser's local storage on the
 * headset; where that is not available (a private window) it lasts only
 * as long as the page.
 *
 * Who was sitting where is not kept: a level carried on later starts
 * with an empty café and the count it had.
 *
 * Test mode (`?test` in the address, used by the check and recording
 * scripts) never reads or writes it: every run starts the same.
 */

import { START_TABLES } from './rules.js';

export interface Save {
  bank: number;
  /** The tables the player has open (indices into the café's pieces), the two starting ones included. */
  tables: number[];
  /** Servers hired beyond the first (0 to HIRE_PRICES.length), and whether the janitor is hired. */
  hires: number;
  janitor: boolean;
  tutorialDone: boolean;
  /** The level the player is on (1-based), guests served in it so far, and the café's happiness. */
  level: number;
  levelServed: number;
  happiness: number;
  /** The highest level reached. */
  bestLevel: number;
  /** The first hurried guest and the first pair have been cued (they come on cue once, then by chance). */
  metHurry: boolean;
  metPair: boolean;
  /** The tips already shown (game/tips.ts): each shows once. */
  tips: string[];
  runs: number;
  /** Settings: music and sound levels (0 off to 5), and the café's size (percent). */
  music: number;
  sounds: number;
  size: number;
}

/**
 * v3: levels. A v2 save (the endless evening, where guests paid 5 to 16
 * coins) would open with a bank that buys everything at once, so only its
 * settings and the first run's teaching are carried over.
 */
const KEY = 'cafe-chaos/save/v3';
const OLD_KEY = 'cafe-chaos/save/v2';

/** True when the page was opened for the checks and recordings (`?test`). */
export const TEST_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');

export function freshSave(): Save {
  return { bank: 0, tables: [...START_TABLES], hires: 0, janitor: false, tutorialDone: false, level: 1, levelServed: 0, happiness: 100, bestLevel: 1, metHurry: false, metPair: false, tips: [], runs: 0, music: 2, sounds: 3, size: 100 };
}

export function loadSave(): Save {
  if (TEST_MODE) return freshSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...freshSave(), ...(JSON.parse(raw) as Partial<Save>) };
    const old = localStorage.getItem(OLD_KEY);
    if (!old) return freshSave();
    const { music, sounds, size, tutorialDone } = { ...freshSave(), ...(JSON.parse(old) as Partial<Save>) };
    return { ...freshSave(), music, sounds, size, tutorialDone };
  } catch {
    return freshSave();
  }
}

export function writeSave(save: Save): void {
  if (TEST_MODE) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // No storage (a private window): it lasts as long as the page.
  }
}
