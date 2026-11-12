/**
 * How the café is held: the numbers behind pinching it to move it, and
 * pinching it with both hands to resize and turn it.
 */

/**
 * A pinch is read two ways and either counts: the headset's own pinch
 * detector (the session's select events, tuned by Meta for its hand
 * tracking, which is what every Quest app answers to), and the gap
 * between the thumb and index tips, for a runtime that sends no select
 * events. Tips closer than PINCH_M pinch (Meta's own figure is 1.6 cm);
 * once pinched, they stay pinched until they are further apart than
 * RELEASE_M with no native pinch either (metres). The gap between the
 * two numbers is what keeps a held guest in the hand when the fingers
 * relax a little or the headset's own pinch flickers; it is kept below
 * the 2.5 to 3 cm of a relaxed hand, so an open hand always lets go.
 */
export const PINCH_M = 0.016;
export const RELEASE_M = 0.024;
/**
 * A hand that drops out of tracking keeps its last pinch (its point and
 * whether it was closed) for this long before it counts as gone
 * (seconds): a flicker in the tracking never drops what the hand holds.
 */
export const TRACKING_GRACE_S = 0.25;
/**
 * A hand just found by the tracking (after being lost for longer than
 * the grace) is least sure for its first moments: the joints settle into
 * place, and the thumb and index tips often start out together. For this
 * long (seconds) it counts as open whatever its fingers seem to do, and
 * its pinch dot stays hidden, so it never picks something up or shows a
 * dot jumping about while the tracking finds its feet.
 */
export const SETTLE_S = 0.2;
/**
 * Two tracked hands with their wrists closer than this (metres) are one
 * real hand read as both: in poor light the tracking can take a single
 * hand for the left and the right at once, and both hand models land on
 * it. The one found more recently is the ghost: it is not drawn, and its
 * pinches do not count, until the two part.
 */
export const GHOST_M = 0.06;
/**
 * The pinch point is smoothed with a speed-adaptive filter (a one-euro
 * filter): at rest it follows at `minHz` (the tracking's jitter, a
 * millimetre or two, is ironed out), and the cutoff rises by `beta` per
 * metre per second of hand speed, so a moving hand is followed with no
 * lag to speak of.
 */
export const SMOOTH = { minHz: 3, beta: 60 };
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
