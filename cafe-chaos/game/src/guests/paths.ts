/**
 * Where guests are headed, in the café's own space (metres; +Y up; the
 * player toward +Z; the door on the right, +X). Only the places are
 * written here: the line outside the door, where newcomers appear, and
 * where leavers are going. How to get from one place to another inside
 * the café the guests work out for themselves, from the navigation grid
 * (nav/nav-grid.ts).
 *
 *              back wall and counter
 *        +---------------------------------------+ . . fence . .
 *        |  T4   T4   T4    T2   T2      (quiet)  |rail
 *  fence |                                        |      deck
 *  < < <  EXIT  T2   T2   T2    T2   T2           = door = = gap =  Q Q Q Q Q  < arrivals
 *  ^ fade |                                        |                 > > > > >  those who give up
 *        |                                        |rail
 *        + - - - - - - - - - - - - - - - - - - - -+
 *          (the front is open, but nobody leaves that way)
 *                        (player)
 *
 * - Arrivals come along the table from the right and join the back of
 *   the line; the line stands outside the door, its head on the deck.
 * - A guest who gives up waiting turns round and walks back the way it
 *   came, beside the line, and fades out where newcomers appear.
 * - A guest who has eaten leaves by the exit in the room's left wall
 *   (under the 出口 sign) and down the walkout path to the plate's edge,
 *   fading out there; with the annex open, on through the annex and out
 *   of its own exit.
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

/**
 * The way out, for every guest who has eaten: the exit in the room's left
 * wall, under the 出口 sign, then the walkout path through the gap in the
 * bamboo fence to the plate's edge, where it fades. Once the annex is
 * open the way runs on through the annex to its own exit in its outer
 * wall. Each exit has a few spots side by side across the path, dealt in
 * turn, so two guests leaving together walk abreast and do not vanish on
 * the same spot. Heights come from the navigation grid (café space,
 * metres).
 */
export const EXIT_LANES: { x: number; z: number }[] = [
  { x: -0.448, z: -0.04 },
  { x: -0.452, z: 0.004 },
  { x: -0.448, z: 0.046 },
];
export const ANNEX_EXIT_LANES: { x: number; z: number }[] = [
  { x: -0.668, z: 0.08 },
  { x: -0.672, z: 0.115 },
  { x: -0.668, z: 0.15 },
];
/** Leavers march once they are through the exit, out of the room (x below this, café space). */
export const OUTSIDE_X = -0.345;
/** With the annex open, they march once through its exit. */
export const ANNEX_OUTSIDE_X = -0.645;
