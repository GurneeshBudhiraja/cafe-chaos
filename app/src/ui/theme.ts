/**
 * Theme colours used from code (UIKitML files carry the same values in their
 * <style> blocks; keep them in step).
 *
 * Dark, warm smoked glass with warm-white text and one clay accent. Dark
 * glass reads as calm and premium over bright passthrough, and on see-through
 * glasses (additive displays, where black is transparent and light panels
 * glare) it is the comfortable choice: Snap's Spectacles guidance is to
 * borrow dark-mode patterns. Paper stays paper: notes and templates are
 * warm white so ink reads like ink.
 */

export const THEME = {
  /** Primary text and icons. */
  ink: '#f7f2ea',
  /** Secondary text. */
  inkSoft: '#b3aba1',
  /** Text and icons on light fills (paper, the on-state pin). */
  inkOnLight: '#1f1c19',
  /** Light fills on the glass, by pointer state. */
  fill: 'rgba(255, 250, 242, 0.08)',
  fillHover: 'rgba(255, 250, 242, 0.18)',
  fillPressed: 'rgba(255, 250, 242, 0.26)',
  /** The clay accent, brightened for dark glass, by pointer state. */
  clay: '#d4704f',
  clayHover: '#df7e5d',
  clayPressed: '#c0603f',
  /** The grab bar under a window or the dock. */
  grabBar: 'rgba(255, 250, 242, 0.5)',
  grabBarActive: 'rgba(255, 250, 242, 0.9)',
} as const;
