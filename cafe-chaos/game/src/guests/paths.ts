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
 *  < < <  EXIT  T2   T2   T2    T2   T2           = door = = gap =  Q Q
 *  ^ fade |                                        |                    Q :  those who give up walk back beside it
 *        |                                        |rail                Q :
 *        + - - - - - - - - - - - - - - - - - - - -+                    Q :  < arrivals
 *          (the front is open, but nobody leaves that way)
 *                        (player)
 *
 * - Arrivals come along the table from the right and join the back of
 *   the line; the line's head stands on the deck outside the door, and
 *   the rest of it runs down the table toward the player.
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

/**
 * The line: its head on the deck just outside the door, the rest on the
 * table beyond the plate, turned to run toward the player rather than out
 * to the right, so the whole line stays within reach (about 55 cm from
 * the eyes, with the café at its usual 35 cm). Everyone faces the door,
 * turned part of the way to the player so faces show.
 */
const QUEUE_HEAD = { x: 0.43, z: 0.03 };
/** Just past the gap in the fence, then down the table toward the player, this far apart. */
const QUEUE_BEND = { x: 0.505, z: 0.04 };
const QUEUE_COLUMN_X = 0.525;
const QUEUE_SPACING = 0.058;
/** The way the line faces: toward the door (-X), turned part of the way to the player. */
export const QUEUE_YAW = -0.95;

/** The line's spots, front to back. */
export const QUEUE_SPOTS: Vector3[] = Array.from({ length: MAX_QUEUE }, (_, i) =>
  i === 0 ? at(QUEUE_HEAD.x, QUEUE_HEAD.z) : i === 1 ? at(QUEUE_BEND.x, QUEUE_BEND.z) : at(QUEUE_COLUMN_X, QUEUE_BEND.z + (i - 1) * QUEUE_SPACING),
);

/** Where newcomers appear when the café is not on a real table: out to the right, level with the end of the line. */
export const ARRIVAL_POINT = at(0.74, QUEUE_BEND.z + (MAX_QUEUE - 2) * QUEUE_SPACING);
/**
 * On a real table, newcomers come from its real edge: they appear just
 * inside it and walk across the player's own table to the line. `runM`
 * is how far the table runs to the right of the line's column (café
 * space, metres; CafeSystem.tableRun), 0 when the café is not on a
 * table. On a wide table they start beyond the usual point, by up to
 * `ARRIVAL_MAX_M` (further would make the walk too long to wait for); on
 * a narrow one they start nearer, on the table, never in the air beyond
 * its edge.
 */
export const ARRIVAL_INSET_M = 0.03;
export const ARRIVAL_MAX_M = 0.4;
/** Where the table's run is measured from: the line's column, level with where newcomers appear. */
export const ARRIVAL_FROM = { x: QUEUE_COLUMN_X, z: ARRIVAL_POINT.z };
export function arrivalPoint(runM: number): Vector3 {
  const point = ARRIVAL_POINT.clone();
  if (runM > 0) point.x = Math.max(QUEUE_COLUMN_X + 0.06, Math.min(ARRIVAL_POINT.x + ARRIVAL_MAX_M, QUEUE_COLUMN_X + runM - ARRIVAL_INSET_M));
  return point;
}

// ------------------------------------------------------------------ leaving

/** Those who give up walk back beside the line, this far out from it (x). */
const TURN_BACK_X = QUEUE_COLUMN_X + 0.05;

/**
 * Back out the way it came: a guest who gives up turns round, steps to
 * the side of the line, and walks away along the table to where
 * newcomers appear. From the head of the line (on the deck) that starts
 * with the step down through the gap in the fence.
 */
export function pathBack(from: Vector3, arrival: Vector3 = ARRIVAL_POINT): Vector3[] {
  const points = [from.clone()];
  if (from.x < PLATE_EDGE_X) points.push(at(PLATE_EDGE_X - 0.006, QUEUE_HEAD.z), at(PLATE_EDGE_X + 0.02, QUEUE_HEAD.z));
  points.push(at(TURN_BACK_X, Math.max(from.z, QUEUE_BEND.z)));
  points.push(arrival.clone());
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

/**
 * The Canadian café's way out: from the cabin door round its front corner,
 * along the stepping slabs past the bonfire, and off the plate's left edge
 * between the cabin's front wall and the fire chairs, where leavers fade.
 * (models/27-cafe-canada/INTEGRATION.md, "Walkways".)
 */
export const CANADA_EXIT_LANES: { x: number; z: number }[] = [
  { x: -0.452, z: 0.19 },
  { x: -0.456, z: 0.205 },
  { x: -0.452, z: 0.22 },
];
/** Leavers march once they are past the cabin's front-left corner (x below this, café space). */
export const CANADA_OUTSIDE_X = -0.4;
