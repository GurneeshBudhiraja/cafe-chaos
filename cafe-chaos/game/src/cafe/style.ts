/**
 * Which café is up: the Japanese garden café (the first one) or the
 * Canadian winter café (docs/CANADA-PLAN.md). One shared setting that the
 * systems read when they build, spawn or judge something, so a café is
 * swapped while it waits hidden behind the start card (CafeSystem.setCafe)
 * and nothing else needs to be told how.
 *
 * Side-effect free: plain data.
 */

export type CafeId = 'japan' | 'canada';
export const CAFE_IDS: readonly CafeId[] = ['japan', 'canada'];

/** The café up now. CafeSystem.setCafe changes it; everything else only reads it. */
export const current: { id: CafeId } = { id: 'japan' };

export const isCanada = (): boolean => current.id === 'canada';

/** The Canadian café's price, in the Japanese café's coins (only those). */
export const CANADA_PRICE = 750;
/** The free trial of the Canadian café: this many levels. */
export const TRIAL_LEVELS = 3;

/** What each café is called, and its line under the name (the start card). */
export const CAFE_NAMES: Record<CafeId, { name: string; line: string }> = {
  japan: { name: 'Japanese café', line: 'A cherry-blossom tea garden. Your first café.' },
  canada: { name: 'Canadian café', line: 'A snowy log cabin with a lake, a bonfire and live music.' },
};
