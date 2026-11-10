/**
 * The numbers that pace the guests: how many, how fast, how patient.
 * Everything that tunes the flow of the café lives here.
 */

/** Never more than this many guests on stage at once, counting everyone: walking up, waiting, carried, seated and leaving. */
export const MAX_GUESTS = 10;
/** How many can stand in the line outside the door. */
export const MAX_QUEUE = 5;

/**
 * Arrivals. The next guest comes `SPAWN_SECONDS` after the last (at
 * random within the range), stretched as the café fills: with nobody
 * about they come at the quick end, and near the cap the gap grows by
 * `SPAWN_STRETCH` times, so the place fills up briskly and then settles
 * instead of slamming into the cap.
 */
export const SPAWN_SECONDS: [number, number] = [3.5, 6.5];
export const SPAWN_STRETCH = 1.6;
/** The first guest arrives this long after the café is placed. */
export const FIRST_SPAWN_SECONDS = 1.5;

/** How long a guest waits in the line before giving up (seconds), and the share of it after which it shows (the Impatient clip). */
export const PATIENCE_SECONDS = 40;
export const IMPATIENT_AFTER = 0.55;
/** Each guest's patience differs from that by up to this share either way, so a whole line never gives up in the same breath. */
export const PATIENCE_SPREAD = 0.25;
/** How long a seated guest stays before leaving (seconds). */
export const SEATED_SECONDS = 60;
/** A just-seated guest is happy for this long, then eats, then sits idle for the last stretch. */
export const HAPPY_SECONDS = 3;
export const IDLE_LAST_SECONDS = 12;

/** Walking speeds in the café's space (metres per second). The Walk clip looks right from about 2 to 5.5 cm/s. */
export const SPEED = { arrive: 0.036, shuffle: 0.03, leave: 0.045, march: 0.052 };
/** How quickly a guest turns to face its way (radians per second). */
export const TURN_SPEED = 7;
/** A guest fades in over this much of its walk in, and out over this much of its walk away (metres). */
export const FADE_IN_M = 0.1;
export const FADE_OUT_M = 0.16;
/** Leaving guests keep at least this far behind the one ahead in their lane (metres). */
export const FOLLOW_GAP_M = 0.06;

/** A pinch closing within this of a guest's grip picks it up (metres in the café's space, and never less than the world floor). */
export const PICK_RADIUS_M = 0.04;
export const PICK_RADIUS_WORLD_MIN_M = 0.03;
/** A pinch within this many pick radii of a guest belongs to the guests: it never moves the café. */
export const CLAIM_RADII = 1.7;
/** A carried guest hangs from the pinch by its grip, this far up its body (café space, from the model). */
export const GRIP_HEIGHT_M = 0.042;
/** How tightly a carried guest follows the hand (per second): high is stiff, low is dangly. */
export const CARRY_FOLLOW = 18;
/** A carried guest lands on a free seat within this of where it hangs (metres across, café space). */
export const SEAT_REACH_M = 0.05;
/** Hops: onto a seat, back to the line, and off a seat (seconds and height in metres). */
export const HOP = { sit: { seconds: 0.28, height: 0.012 }, back: { seconds: 0.45, height: 0.03 }, off: { seconds: 0.42, height: 0.028 } };

/** A guest on its feet or in a seat watches a free hand that comes within this of it (metres, world; grows with the café). */
export const WATCH_RADIUS_M = 0.14;
/** How quickly a held guest's lean follows its acting (per second). */
export const LEAN_FOLLOW = 9;
