/**
 * The numbers that pace the baristas. While the café is being tested
 * every barista is on the staff at once and they take turns carrying
 * orders out to tables picked at random; later the game will hand them
 * real orders and unlock the looks one by one.
 */

/** How many may be out on the floor at once (the rest work behind the counter). */
export const MAX_OUT = 3;
/** A trip starts this long after the last (seconds, at random within the range). */
export const TRIP_SECONDS: [number, number] = [3.5, 7];
/** The first trip starts this long after the café is placed. */
export const FIRST_TRIP_SECONDS = 4;
/** Walking speeds (metres per second): empty-handed, and carrying a tray. */
export const SPEED = { walk: 0.055, carry: 0.046, shuffle: 0.03 };
/** How quickly a barista turns to face its way (radians per second). */
export const TURN_SPEED = 6.5;
/** The tray leaves the hands this far into the Serve clip (seconds): the lowest point of the lean. */
export const SET_DOWN_AT = 0.75;
/** A served tray stays on its table this long, then is cleared away over the fade (seconds). */
export const TRAY_STAYS_SECONDS = 26;
export const TRAY_FADE_SECONDS = 0.5;
/** Behind the counter: a barista does something new every so often (seconds, at random within the range). */
export const FIDGET_SECONDS: [number, number] = [2.5, 6];
/** How long a turn to the back bar lasts (seconds, at random within the range). */
export const BACK_BAR_SECONDS: [number, number] = [2, 3.5];
/** The chance that a barista behind the counter waves when a guest joins the line. */
export const WAVE_CHANCE = 0.6;
/** A table with a guest seated at it is this many times likelier to be served than an empty one. */
export const GUEST_TABLE_WEIGHT = 3;
