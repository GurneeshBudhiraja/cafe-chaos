/**
 * What the café keeps between sessions: the money in the bank, what has
 * been bought, whether the walkthrough has been seen, and the best shift.
 * Kept in the browser's local storage on the headset; where that is not
 * available (a private window) it lasts only as long as the page.
 *
 * Test mode (`?test` in the address, used by the check and recording
 * scripts) never reads or writes it: every run starts the same.
 */

import type { ShopItem } from './rules.js';

export interface Save {
  bank: number;
  owned: ShopItem['id'][];
  tutorialDone: boolean;
  /** The most coins taken in one shift. */
  best: number;
  shifts: number;
}

const KEY = 'cafe-chaos/save/v1';

/** True when the page was opened for the checks and recordings (`?test`). */
export const TEST_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');

export function freshSave(): Save {
  return { bank: 0, owned: [], tutorialDone: false, best: 0, shifts: 0 };
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
