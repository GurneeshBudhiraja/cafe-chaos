/**
 * Where waiting guests go, in the café's own space (metres; +Y up; the
 * player toward +Z; the gate on the right, +X). Pure maths: the system
 * turns these into paths.
 *
 * Guests appear on the stone path just outside the gate, walk in through
 * the entrance, and take the first free spot in the queue: the four
 * slots on the waiting bench in the front-right corner, then two
 * standing spots just inside the gate. When one leaves, everyone behind
 * moves up a spot. Leaving guests walk back out the way they came and
 * fade away on the path.
 */

import { Vector3 } from '@iwsdk/core';
import { FLOOR_TOP_M } from '../cafe/layout.js';

/** The garden ground around the café room is a touch lower than its floor. */
const GARDEN_TOP_M = 0.0225;

/** Just outside the gate, on the stone path (where guests appear and vanish). */
export const GATE_OUTSIDE = new Vector3(0.45, GARDEN_TOP_M, 0.055);
/** The gate opening (the shell's Entrance anchor). */
export const GATE = new Vector3(0.324, FLOOR_TOP_M, 0.055);
/** A step inside the gate, where the path turns toward the bench. */
export const INSIDE = new Vector3(0.285, FLOOR_TOP_M, 0.085);

/** A place to wait: where to stand, and the way to face (yaw about +Y, radians). */
export interface QueueSpot {
  position: Vector3;
  yaw: number;
}

/** The standing spots used once the bench is full: along the wall inside the gate, facing into the café. */
export const STANDING_SPOTS: QueueSpot[] = [
  { position: new Vector3(0.295, FLOOR_TOP_M, 0.125), yaw: -Math.PI / 2 },
  { position: new Vector3(0.3, FLOOR_TOP_M, 0.02), yaw: -Math.PI / 2 },
];

/** How many can wait at once: the bench's slots plus the standing spots. */
export const BENCH_SLOTS = 4;
export const MAX_WAITING = BENCH_SLOTS + STANDING_SPOTS.length;

/** The walk from outside the gate to a spot. */
export function pathIn(spot: QueueSpot): Vector3[] {
  return [GATE_OUTSIDE.clone(), GATE.clone(), INSIDE.clone(), spot.position.clone()];
}

/** The walk from a spot back out through the gate. */
export function pathOut(from: Vector3): Vector3[] {
  return [from.clone(), INSIDE.clone(), GATE.clone(), GATE_OUTSIDE.clone()];
}

/** The yaw (about +Y) that faces along a direction in the x-z plane; the models face +Z at yaw 0. */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** The shortest turn from one yaw to another, in (-PI, PI]. */
export function yawDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
