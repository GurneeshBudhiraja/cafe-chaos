/**
 * Where guests are headed, in the café's own space (metres; +Y up; the
 * player toward +Z; the door on the right, +X). Only the places are
 * written here: the line outside the door, where newcomers appear, and
 * where leavers are going. How to get from one place to another the
 * guests work out for themselves, from the navigation grid
 * (nav/nav-grid.ts).
 *
 *            back wall and counter
 *   +---------------------------------------+ . . fence . .
 *   |  T4   T4   T4    T2   T2      (quiet)  |rail
 *   |                                        |      deck
 *   |  T2   T2   T2    T2   T2               = door = = gap =  Q Q Q Q Q  < arrivals
 *   |                                        |        |
 *   |                 [waiting bench]        |rail    |  down the side
 *   + - - - - - (open front: a barrier) - - -+        |
 *   X <- - - - - - - along the front path - - - - - - +
 *   ^ leavers fade out here, at the end of the path, still on the plate
 *                        (player)
 *
 * - Arrivals come along the table from the right and join the back of
 *   the line; the line stands outside the door, its head on the deck.
 * - Everyone who leaves goes out of the door, down the deck at the side
 *   and along the garden path at the front, and fades out as it reaches
 *   the path's far end. Nobody steps off the plate to leave.
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

/**
 * Where leavers are going: the far (left) end of the garden path along
 * the front of the plate. There are a few ends, side by side and a little
 * apart along the path, and leavers are dealt them in turn, so two
 * leaving together walk abreast and do not vanish on the same spot.
 */
export const EXIT_ENDS: Vector3[] = [at(-0.275, 0.218), at(-0.25, 0.247), at(-0.285, 0.276)];
/** Leavers march once they are on the front path (z beyond this, café space). */
export const FRONT_PATH_Z = 0.195;
