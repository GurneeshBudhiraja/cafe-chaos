/**
 * Where guests walk, in the café's own space (metres; +Y up; the player
 * toward +Z; the door on the right, +X). Pure maths: the system turns
 * these into walks. The numbers come from a height map of the café (the
 * aisles between the furniture, the door opening, the gap in the fence).
 *
 *            back wall and counter
 *   +---------------------------------------+ . . fence . .
 *   |  T4   T4   T4    T2   T2      (quiet)  |rail
 *   |- - - - - - middle aisle - - - - - - - >|      deck
 *   |  T2   T2   T2    T2   T2               = door = = gap =  Q Q Q Q Q  < arrivals
 *   |bar - - - - front aisle - - - - - - - ->|       \
 *   |                 [waiting bench]        |rail    \  exit lane
 *   +---------------------------------------+ . . .    |
 *      gravel garden (front)                           v
 *   <- - - - - - - - - - march left - - - - - - - - - -+- - march right - ->
 *                        (player)
 *
 * - Arrivals come along the table from the right and join the back of
 *   the line; the line stands outside the door, its head on the deck.
 * - Everyone who leaves goes out toward the front, then marches off left
 *   or right along the table in front of the café and fades at the end.
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

/** Leavers go out through the half of the door opening nearer the player. */
const EXIT_Z = 0.082;
/** Then down the table outside the fence, along this x, to the front. */
const EXIT_DOWN_X = 0.515;
/** The lanes along the front of the café (z), clear of the grab pill. Leavers are dealt lanes in turn so they do not bunch. */
export const MARCH_LANES_Z = [0.39, 0.425, 0.46];
/** Where a march ends (x): the left end of the plate, or out to the right. */
const MARCH_END_X = { left: -0.5, right: 0.9 };

export type Side = 'left' | 'right';

/** From the foot of the exit lane down to the front and away along a lane. */
function march(side: Side, lane: number): Vector3[] {
  const z = MARCH_LANES_Z[lane % MARCH_LANES_Z.length];
  // Cut the corner a little so the turn is a curve, not a pivot.
  const turn = side === 'left' ? -0.03 : 0.03;
  return [at(EXIT_DOWN_X, 0.13), at(EXIT_DOWN_X, z - 0.03), at(EXIT_DOWN_X + turn, z), at(MARCH_END_X[side], z)];
}

/** Out of the line (a guest who gave up): a step toward the player, then to the front and away. */
export function pathFromQueue(from: Vector3, side: Side, lane: number): Vector3[] {
  const onDeck = from.x < PLATE_EDGE_X;
  const start = onDeck ? [from.clone(), at(0.45, EXIT_Z), at(0.5, EXIT_Z + 0.01)] : [from.clone(), at(Math.max(from.x, EXIT_DOWN_X), 0.1)];
  return [...start, ...march(side, lane)];
}

/** Out of the café from a point inside it (already in an aisle): to the door, through it, to the front and away. */
export function pathFromInside(from: Vector3, side: Side, lane: number): Vector3[] {
  const points = [from.clone()];
  // From the middle aisle the way to the door bends round the last chair of the front row.
  if (from.z < 0.04) points.push(at(0.315, Math.min(from.z, -0.035)), at(0.325, 0.045));
  points.push(at(0.34, EXIT_Z), at(0.45, EXIT_Z), at(0.5, EXIT_Z + 0.01), ...march(side, lane));
  return points;
}

// -------------------------------------------------------------------- aisles

/** The two aisles (z): between the rows of tables, and between the front row and the bench. */
export const MIDDLE_AISLE_Z = -0.04;
export const FRONT_AISLE_Z = 0.095;

/**
 * From a seat down to the nearest aisle: where a guest lands when it hops
 * off its chair, then the walk to the aisle. `seat` is the seat anchor's
 * position and `yaw` the way a guest sits there (both café space).
 */
export function pathOffSeat(seat: Vector3, yaw: number): Vector3[] {
  const floor = (x: number, z: number): Vector3 => new Vector3(x, FLOOR_TOP_M, z);
  // The bar: stools face the wall; step back into the room.
  if (seat.x < -0.27 && seat.z > 0.06) return [floor(seat.x + 0.05, seat.z), floor(seat.x + 0.06, FRONT_AISLE_Z)];
  // The quiet corner: out past the plant, down the gap between the two back tables.
  if (seat.z < -0.19) return [floor(seat.x, seat.z + 0.045), floor(0.195, -0.165), floor(0.195, MIDDLE_AISLE_Z)];
  // A chair facing along the row (the two-seaters): step out in front of it, toward the nearer aisle.
  const facesAlongRow = Math.abs(Math.sin(yaw)) > 0.7;
  if (facesAlongRow) {
    const frontRow = seat.z > -0.05;
    const aisle = frontRow ? FRONT_AISLE_Z : MIDDLE_AISLE_Z;
    return [floor(seat.x, seat.z + (aisle > seat.z ? 0.05 : -0.05)), floor(seat.x, aisle)];
  }
  // A chair facing a table across the row (the four-seaters' near side): step back from the table into the aisle.
  return [floor(seat.x, seat.z - Math.cos(yaw) * 0.045), floor(seat.x, MIDDLE_AISLE_Z)];
}

/** Seats swallowed by the shell's counter (the far side of the back row's four-seaters): nobody can sit there. */
export function seatIsBlocked(seat: Vector3): boolean {
  return seat.z < -0.15 && seat.x < 0.1;
}
