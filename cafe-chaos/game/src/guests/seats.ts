/**
 * The seats: every `Seat-N` anchor in the café's furniture that a guest
 * can really sit on, with where it is and the way a guest sits there
 * (café space), and who is on it.
 */

import { Vector3, type Group, type Object3D } from '@iwsdk/core';
import type { NavGrid } from '../nav/nav-grid.js';

export interface Seat {
  index: number;
  /** The seat's top, where a seated guest's origin goes (café space). */
  position: Vector3;
  /** The way a guest sits there (yaw about +Y, café space): facing the table. */
  yaw: number;
  /** The id of the guest sitting there or on its way there (0: free). */
  occupant: number;
}

/** A seat with something standing this far above it (metres) is buried in furniture: nobody can sit there. */
const BURIED_M = 0.02;
/** A guest getting down from a seat needs somewhere to stand within this of it (metres). */
export const LANDING_REACH_M = 0.09;

/**
 * Read the usable seats from the café's anchors. A seat is left out if
 * the navigation grid shows it is buried (as the far seats of the back
 * row's four-seaters are, inside the counter) or has nowhere to stand
 * beside it.
 */
export function collectSeats(cafe: Group, anchors: Object3D[], nav: NavGrid): Seat[] {
  cafe.updateMatrixWorld(true);
  const seats: Seat[] = [];
  const ahead = new Vector3();
  for (const anchor of anchors) {
    const position = cafe.worldToLocal(anchor.getWorldPosition(new Vector3()));
    if (nav.heightAt(position.x, position.z) > position.y + BURIED_M || !nav.nearest(position.x, position.z, LANDING_REACH_M)) continue;
    // The anchor's +Z, brought into café space: the way the sitter faces.
    cafe.worldToLocal(anchor.localToWorld(ahead.set(0, 0, 1))).sub(position);
    seats.push({ index: seats.length, position, yaw: Math.atan2(ahead.x, ahead.z), occupant: 0 });
  }
  return seats;
}

/**
 * The free seat (or `own`, the carried guest's own seat) nearest under a
 * point (café space), within `reach` across and not too far below or
 * above it; null if none. `spoken` is a seat the other hand's guest is
 * already aimed at: two guests are never offered the same seat.
 */
export function seatUnder(seats: Seat[], point: Vector3, reach: number, own: Seat | null, spoken: Seat | null = null): Seat | null {
  let best: Seat | null = null;
  let bestDistance = reach;
  for (const seat of seats) {
    if ((seat.occupant !== 0 && seat !== own) || seat === spoken) continue;
    const up = point.y - seat.position.y;
    if (up < -0.03 || up > 0.2) continue;
    const across = Math.hypot(point.x - seat.position.x, point.z - seat.position.z);
    if (across < bestDistance) {
      bestDistance = across;
      best = seat;
    }
  }
  return best;
}
