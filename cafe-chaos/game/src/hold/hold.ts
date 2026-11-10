/**
 * How the café is held: the numbers behind pinching it to move it, and
 * pinching it with both hands to resize and turn it.
 */

/** Thumb and index tips closer than this pinch; further apart than RELEASE let go (metres). */
export const PINCH_M = 0.015;
export const RELEASE_M = 0.03;
/**
 * A pinch counts as taking the café when it closes within this margin of
 * the café's bounds (sideways and above the roof), in metres at the café's
 * current size. Generous, so a pinch over the garden or just beside the
 * fence takes it.
 */
export const HOLD_MARGIN_M = 0.06;
/** How small and how large two hands may make the café (its scale). */
export const SCALE_MIN = 0.3;
export const SCALE_MAX = 2.5;
/** The café's underside never goes below this height (metres, the floor is 0). */
export const FLOOR_Y = 0.02;
