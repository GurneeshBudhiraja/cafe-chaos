/**
 * Rules for turning a stream of pointer samples into strokes.
 *
 * Pure functions with no IWSDK or DOM dependency, so the rules are easy to
 * read, tune, and test. All distances are in page units (page width = 1).
 */

/**
 * Ignore samples closer than this to the previous point. Cuts noise from a
 * resting hand and keeps stroke data small.
 */
export const MIN_SAMPLE_DISTANCE = 0.0015;

/**
 * A jump larger than this between two consecutive samples is treated as a
 * tracking glitch (for example a hand lost and found again elsewhere), not as
 * intentional ink. The stroke ends and a new one starts at the new point, so
 * we never draw a long accidental line across the page.
 */
export const MAX_SAMPLE_JUMP = 0.12;

export type SampleDecision = 'skip' | 'append' | 'split';

export function classifySample(
  lastX: number,
  lastY: number,
  nextX: number,
  nextY: number,
): SampleDecision {
  const dx = nextX - lastX;
  const dy = nextY - lastY;
  const distance = Math.hypot(dx, dy);
  if (distance < MIN_SAMPLE_DISTANCE) return 'skip';
  if (distance > MAX_SAMPLE_JUMP) return 'split';
  return 'append';
}

/** True when a page coordinate lies on the page (inclusive). */
export function isOnPage(x: number, y: number): boolean {
  return x >= 0 && x <= 1 && y >= 0 && y <= 1;
}
