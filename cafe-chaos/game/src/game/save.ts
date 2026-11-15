/**
 * What the café keeps between sessions: the money in the bank, how many
 * servers have been hired, whether the first run's teaching has been
 * seen, and the records (the longest the café stayed open, the most
 * coins taken in one run). Kept in the browser's local storage on the
 * headset; where that is not available (a private window) it lasts only
 * as long as the page.
 *
 * Test mode (`?test` in the address, used by the check and recording
 * scripts) never reads or writes it: every run starts the same.
 */

export interface Save {
  bank: number;
  /** Servers hired beyond the first (0 to HIRE_PRICES.length). */
  hires: number;
  tutorialDone: boolean;
  /** The longest the café has stayed open (seconds). */
  bestSeconds: number;
  /** The most coins taken in one run. */
  bestCoins: number;
  runs: number;
  /** Settings: music and sound levels (0 off to 5), and the café's size (percent). */
  music: number;
  sounds: number;
  size: number;
}

const KEY = 'cafe-chaos/save/v2';

/** True when the page was opened for the checks and recordings (`?test`). */
export const TEST_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');

export function freshSave(): Save {
  return { bank: 0, hires: 0, tutorialDone: false, bestSeconds: 0, bestCoins: 0, runs: 0, music: 2, sounds: 3, size: 100 };
}

export function loadSave(): Save {
  if (TEST_MODE) return freshSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    return { ...freshSave(), ...(JSON.parse(raw) as Partial<Save>) };
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
