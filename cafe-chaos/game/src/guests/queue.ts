/**
 * Where waiting guests go, in the café's own space (metres; +Y up; the
 * player toward +Z; the gate on the right, +X). Pure maths: the system
 * turns these into paths.
 *
 * Guests queue at the door, in a single line: the first stands in the gate
 * opening looking into the café, and each newcomer stands behind the one
 * before, along the stone path leading out from the gate. Nobody comes
 * inside until they are seated. When the one in front leaves, everyone
 * steps up a place. A guest who gives up steps out of the line and walks
 * away down the path, fading as it goes. Newcomers appear at the far end
 * of the path and walk up to the back of the line.
 */

import { Vector3 } from '@iwsdk/core';
import { FLOOR_TOP_M } from '../cafe/layout.js';

/** The garden ground around the café room is a touch lower than its floor. */
const GARDEN_TOP_M = 0.0225;
/** The garden plate ends here (+X); beyond it, guests stand on the player's table. */
const PLATE_EDGE_X = 0.46;

/** The gate opening (the shell's Entrance anchor): the head of the line. */
export const GATE = new Vector3(0.324, FLOOR_TOP_M, 0.055);
/** Guests stand this far apart in the line (a guest is 2.7 cm deep). */
export const LINE_SPACING = 0.034;
/** How many can wait in the line at once. */
export const MAX_WAITING = 6;
/** The exit lane: leaving guests step this far to the side (toward the player) before walking out. */
const EXIT_LANE_Z = 0.04;
/** Newcomers appear this far beyond the end of the line. */
const ARRIVAL_BEYOND = 0.08;

/** A place to wait: where to stand, and the way to face (yaw about +Y, radians). */
export interface QueueSpot {
  position: Vector3;
  yaw: number;
}

/** The ground's height along the path out of the gate. */
function groundAt(x: number): number {
  return x <= PLATE_EDGE_X - 0.01 ? GARDEN_TOP_M : 0;
}

/** The line's spots, front to back; everyone faces into the café (-X). */
export const QUEUE_SPOTS: QueueSpot[] = Array.from({ length: MAX_WAITING }, (_, i) => {
  const x = GATE.x + i * LINE_SPACING;
  return { position: new Vector3(x, i === 0 ? GATE.y : groundAt(x), GATE.z), yaw: -Math.PI / 2 };
});

/** Where guests appear and vanish: on the path beyond the end of the line. */
export const ARRIVAL_POINT = new Vector3(GATE.x + MAX_WAITING * LINE_SPACING + ARRIVAL_BEYOND, 0, GATE.z);
ARRIVAL_POINT.y = groundAt(ARRIVAL_POINT.x);

/** The walk from the arrival point up to a spot in the line. */
export function pathIn(spot: QueueSpot): Vector3[] {
  return [ARRIVAL_POINT.clone(), spot.position.clone()];
}

/** The walk out: a step to the side of the line, then away down the path to the arrival point. */
export function pathOut(from: Vector3): Vector3[] {
  const aside = new Vector3(from.x, from.y, from.z + EXIT_LANE_Z);
  const away = ARRIVAL_POINT.clone().setZ(GATE.z + EXIT_LANE_Z);
  return [from.clone(), aside, away];
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
