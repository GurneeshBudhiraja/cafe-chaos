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
/** A pair's second guest walks up this long behind the first (so the two are never in one spot at once). */
export const PAIR_FOLLOW_SECONDS = 1.1;

/**
 * How long a guest waits in the line before giving up (seconds).
 *
 * The sweet spot comes from how long the line takes to serve. Reaching
 * for a guest, carrying it over and choosing a seat takes a player about
 * five or six seconds, so a full line of five takes about half a minute.
 * At 32 seconds a player who keeps at it saves everyone, the last with a
 * few seconds to spare; one who drifts for ten seconds loses the guest at
 * the back. Shorter than this and the back of a full line cannot be
 * saved at all, which feels unfair; much longer and the timers stop
 * mattering and the line just sits there. A guest's own patience differs
 * from that by up to `PATIENCE_SPREAD` either way, so a whole line never
 * gives up in the same breath. It shows its impatience (the foot tap)
 * once `IMPATIENT_AFTER` of it has gone; its dial (guests/patience-dial.ts)
 * shows the rest.
 */
export const PATIENCE_SECONDS = 32;
export const IMPATIENT_AFTER = 0.5;
export const PATIENCE_SPREAD = 0.15;
/**
 * The wait runs from the gate to the food: a guest's patience keeps
 * running once it is seated, until a server brings its order, so a
 * short-staffed café shows. Being seated tops it up by
 * `SERVICE_TOPUP_SECONDS` (never past `SERVICE_MAX_SECONDS`): a guest
 * seated in good time can sit through the order before its own being
 * served first (a server's round is about 18 seconds), one seated at
 * the last moment has a round and a half. One whose patience runs out at the table loses its
 * temper there for `FUME_SECONDS` (a cross face, the vein mark over its
 * head), then gets down and stomps out without eating.
 */
export const SERVICE_TOPUP_SECONDS = 28;
export const SERVICE_MAX_SECONDS = 46;
export const FUME_SECONDS = 1.6;
/** How long a seated guest stays before leaving (seconds): it goes once served and this long seated... */
export const SEATED_SECONDS = 60;
/** ...and never before it has eaten for this long (seconds), so one served late stays to finish. */
export const EAT_SECONDS = 15;
/** A just-seated guest is happy for this long, then eats, then sits idle for the last stretch. */
export const HAPPY_SECONDS = 3;
export const IDLE_LAST_SECONDS = 12;

/**
 * Walking speeds in the café's space (metres per second): brisk, so the
 * line forms and clears quickly and leavers do not linger. The Walk clip
 * is played faster to match, so feet still land where they should.
 */
export const SPEED = { arrive: 0.058, shuffle: 0.05, leave: 0.07, march: 0.08 };
/** How quickly a guest turns to face its way (radians per second). */
export const TURN_SPEED = 7;
/** A guest fades in over this much of its walk in, and out over this much of its walk away (metres). */
export const FADE_IN_M = 0.1;
export const FADE_OUT_M = 0.16;
/** Leaving guests keep at least this far behind the one ahead in their lane (metres). */
export const FOLLOW_GAP_M = 0.06;

/**
 * A pinch closing within this of a guest picks it up (metres in the
 * café's space, and never less than the world floor), measured to the
 * nearest point of its body from feet to the top of its head, so a pinch
 * at the head, the middle or the feet all count. Generous: a guest is a
 * few centimetres wide, hand tracking is a centimetre or two off, and
 * depth over a table is misjudged by as much again; the nearest guest
 * within reach is the one taken, so being generous costs nothing.
 */
export const PICK_RADIUS_M = 0.07;
export const PICK_RADIUS_WORLD_MIN_M = 0.05;
/**
 * A pinch that closes a little before it reaches a guest still picks it
 * up if it comes within reach this soon after closing (seconds): fingers
 * tend to close on the way in, not at the spot.
 */
export const PICK_WINDOW_S = 0.4;
/**
 * The guest lit up under an open hand is remembered for this long
 * (seconds) after the hand moves off it, and a pinch closing in that time
 * takes it if it is within `PICK_STICKY_RADII` pick radii: closing the
 * fingers moves the pinch point a centimetre or two, which used to slip
 * it off the lit guest or onto a neighbour. What lit up is what you get.
 */
export const PICK_MEMORY_S = 0.35;
export const PICK_STICKY_RADII = 1.8;
/**
 * A carried guest is let go only once the pinch has read open for this
 * long (seconds): a single frame of the tracking or the headset's pinch
 * flickering open no longer drops it in the wrong place.
 */
export const RELEASE_HOLD_S = 0.12;
/** A pinch within this many pick radii of a guest belongs to the guests: it never moves the café. */
export const CLAIM_RADII = 1.7;
/** A carried guest hangs from the pinch by its grip, this far up its body (café space, from the model). */
export const GRIP_HEIGHT_M = 0.042;
/** How tightly a carried guest follows the hand (per second): high is stiff, low is dangly. */
export const CARRY_FOLLOW = 30;
/** A carried guest held low over a free seat, within this of it across (metres, café space), lands on exactly that seat. */
export const SEAT_REACH_M = 0.07;
/** The picture of a guest's wish over its head: its size, and how far above the patience dial (metres, café space). */
export const WISH_TAG = { size: 0.024, above: 0.023 };
/**
 * Pinch what you see. A guest (or, carrying one, a seat) also counts as
 * under the pinch when it lies behind the fingers along the line from
 * the player's eyes: within `radiusM` of that line (metres, world), and
 * between `nearM` and `farM` beyond the hand. So nobody has to reach to
 * the far side of the table, low over it, where hands track worst: a
 * pinch held over the guest as the player sees it takes it, and it flies
 * to the hand. A pinch right at the guest still works, and wins.
 */
export const SIGHT = { radiusM: 0.035, nearM: 0.03, farM: 0.9 };
/**
 * The guest lit under an open hand stays lit until the hand is this many
 * pick radii away (Meta's hover goes on at 5 cm and off at 8), unless
 * another guest is clearly nearer: the highlight does not flicker between
 * neighbours in the line.
 */
export const HOVER_EXIT_RADII = 1.6;
export const HOVER_SWITCH = 0.7;
/**
 * A carried guest let go anywhere over the café (within this margin of
 * its edge, metres, café space) goes to the free seat nearest where it
 * was aimed. Only one let go well clear of the café goes back to where
 * it came from.
 */
export const DROP_MARGIN_M = 0.08;
/**
 * A carried guest lands on the free seat nearest where the player points
 * only if that seat is within this (metres, café space) of the spot;
 * pointed anywhere else it goes back to its place in the line, with no
 * penalty (Apple: an item dropped where it cannot go moves back to its
 * source; Meta: forgiving and reversible). A little over half the gap
 * between tables (0.13 m), so anywhere over a table reaches its seats and
 * a table away does not.
 */
export const AIM_SNAP_M = 0.09;
/** Hops: onto a seat, back to the line, and off a seat (seconds and height in metres). */
export const HOP = { sit: { seconds: 0.28, height: 0.012 }, back: { seconds: 0.45, height: 0.03 }, off: { seconds: 0.42, height: 0.028 } };

/** A guest on its feet or in a seat watches a free hand that comes within this of it (metres, world; grows with the café). */
export const WATCH_RADIUS_M = 0.14;
/** How high a guest's eyes are above its feet (metres): what it looks at is judged from there. */
export const EYE_HEIGHT_M = 0.045;
/** How quickly a held guest's lean follows its acting (per second). */
export const LEAN_FOLLOW = 9;

/** A guest whose patience runs out while it is in the player's hand fades away there over this long (seconds). */
export const VANISH_SECONDS = 0.8;
