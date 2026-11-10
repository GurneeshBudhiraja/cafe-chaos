/**
 * Where guests are headed, in the café's own space (metres; +Y up; the
 * player toward +Z; the door on the right, +X). Only the places are
 * written here: the line outside the door, where newcomers appear, and
 * where leavers are going. How to get from one place to another inside
 * the café the guests work out for themselves, from the navigation grid
 * (nav/nav-grid.ts).
 *
 *            back wall and counter
 *   +---------------------------------------+ . . fence . .
 *   |  T4   T4   T4    T2   T2      (quiet)  |rail
 *   |                                        |      deck
 *   |  T2   T2   T2    T2   T2               = door = = gap =  Q Q Q Q Q  < arrivals
 *   |                                        |                 > > > > >  those who give up
 *   |                        [waiting bench] |rail
 *   + - - - - - - - - - +    +- - - - - - - -+
 *   X <- - - left - - - - (  ) [Meta stone] - - right - -> X
 *   ^ leavers fade out at either end of the front path
 *                        (player)
 *
 * - Arrivals come along the table from the right and join the back of
 *   the line; the line stands outside the door, its head on the deck.
 * - A guest who gives up waiting turns round and walks back the way it
 *   came, beside the line, and fades out where newcomers appear.
 * - A guest who has eaten comes out of the room's front opening, by the
 *   Meta stone, and there turns left or right along the garden path,
 *   fading out at that end. Nobody steps off the plate to leave.
 */

import { Vector3 } from '@iwsdk/core';
import { FLOOR_TOP_M } from '../cafe/layout.js';
import { MAX_QUEUE } from './rules.js';

/** Ground heights by region: the café floor, the engawa step, the deck outside, and the player's table beyond the plate. */
const STEP_TOP_M = 0.02;
const DECK_TOP_M = 0.0255;
const ROOM_EDGE_X = 0.3375;
const STEP_EDGE_X = 0.3675;
const PLATE_EDGE_X = 0.458;
const PLATE_FRONT_Z = 0.31;

/** The ground's height at a point on the routes (the door lane, the deck and the table; inside the room it is the floor). */
export function groundAt(x: number, z: number): number {
  if (x > PLATE_EDGE_X || z > PLATE_FRONT_Z) return 0;
  if (x > STEP_EDGE_X) return DECK_TOP_M;
  if (x > ROOM_EDGE_X) return STEP_TOP_M;
  return FLOOR_TOP_M;
}

const at = (x: number, z: number): Vector3 => new Vector3(x, groundAt(x, z), z);

// ------------------------------------------------------------------ the line

/** The line stands along this z, through the half of the door opening away from the player. */
const QUEUE_Z = 0.03;
/** The head of the line: on the deck, just outside the door. */
const QUEUE_HEAD_X = 0.43;
/** The rest stand on the table beyond the plate, this far apart. */
const QUEUE_NEXT_X = 0.5;
const QUEUE_SPACING = 0.058;
/**
 * The way the line faces: toward the door (-X), turned part of the way to
 * the player, so faces show from the front seat.
 */
export const QUEUE_YAW = -0.95;

/** The line's spots, front to back. */
export const QUEUE_SPOTS: Vector3[] = Array.from({ length: MAX_QUEUE }, (_, i) => at(i === 0 ? QUEUE_HEAD_X : QUEUE_NEXT_X + (i - 1) * QUEUE_SPACING, QUEUE_Z));

/** Where newcomers appear: out along the table, beyond the end of the line. */
export const ARRIVAL_POINT = at(QUEUE_NEXT_X + (MAX_QUEUE - 1) * QUEUE_SPACING + 0.2, QUEUE_Z);

// ------------------------------------------------------------------ leaving

/** Those who give up walk back beside the line, this far to the player's side of it (z). */
const TURN_BACK_Z = QUEUE_Z + 0.046;

/**
 * Back out the way it came: a guest who gives up turns round, steps to
 * the side of the line, and walks away along the table to where
 * newcomers appear. From the head of the line (on the deck) that starts
 * with the step down through the gap in the fence.
 */
export function pathBack(from: Vector3): Vector3[] {
  const points = [from.clone()];
  if (from.x < PLATE_EDGE_X) points.push(at(PLATE_EDGE_X - 0.006, TURN_BACK_Z), at(PLATE_EDGE_X + 0.02, TURN_BACK_Z));
  else points.push(at(from.x + 0.025, TURN_BACK_Z));
  points.push(at(ARRIVAL_POINT.x, TURN_BACK_Z));
  return points;
}

export type Side = 'left' | 'right';

/** Just outside the room's front opening, beside the Meta stone: every guest who has eaten comes out through here. */
export const FRONT_OPENING = at(0.065, 0.204);

/**
 * Where those leavers are going: the two ends of the garden path along
 * the front of the plate. Each end has a few spots, side by side and a
 * little apart along the path, dealt in turn, so two guests going the
 * same way walk abreast and do not vanish on the same spot.
 */
export const EXIT_ENDS: Record<Side, Vector3[]> = {
  left: [at(-0.275, 0.218), at(-0.25, 0.247), at(-0.285, 0.276)],
  right: [at(0.335, 0.218), at(0.355, 0.247), at(0.33, 0.276)],
};
/** Leavers march once they are on the front path (z beyond this, café space). */
export const FRONT_PATH_Z = 0.195;
