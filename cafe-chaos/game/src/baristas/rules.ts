/**
 * The numbers that pace the servers. While the café is being tested all
 * six baristas are on the staff at once; later the game will unlock the
 * looks one by one.
 */

/** How many servers may be out on the floor at once (the rest work behind the counter). */
export const MAX_OUT = 3;
/** Walking speeds (metres per second): empty-handed, carrying a tray, and a sidestep at the bar. */
export const SPEED = { walk: 0.065, carry: 0.055, shuffle: 0.03 };
/** How quickly a server turns to face its way (radians per second). */
export const TURN_SPEED = 6.5;
/** The tray leaves the hands this far into the Serve clip (seconds): the lowest point of the lean. */
export const SET_DOWN_AT = 0.75;
/** It slides from the hands to the guest's place over this long (seconds). */
export const TRAY_SLIDE_SECONDS = 0.25;
/** A tray whose guest has gone is cleared away over this long (seconds). */
export const TRAY_FADE_SECONDS = 0.5;
/** Behind the counter: a server does something new every so often (seconds, at random within the range). */
export const FIDGET_SECONDS: [number, number] = [2.5, 6];
/** How long a turn to the back bar lasts (seconds, at random within the range). */
export const BACK_BAR_SECONDS: [number, number] = [2, 3.5];
/** The chance that a server behind the counter waves when a guest joins the line. */
export const WAVE_CHANCE = 0.6;

/**
 * The dispatcher (see systems/barista-system.ts).
 * - Orders placed within `SAME_TIME_SECONDS` of each other count as placed
 *   together: among them the nearer is served first.
 * - A server already on its way keeps its order unless switching saves at
 *   least `SWITCH_GAIN_M` of walking in all, so servers do not dither.
 * - While orders wait for a server, the plan is looked at again this often.
 */
export const SAME_TIME_SECONDS = 1.5;
export const SWITCH_GAIN_M = 0.06;
export const REPLAN_SECONDS = 0.5;
