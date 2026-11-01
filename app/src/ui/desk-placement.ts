/**
 * Finding the desk to put the tablet on, from the surfaces Quest has
 * detected (WebXR plane detection: the tables and desks from the headset's
 * Space Setup). IWSDK's SceneUnderstandingSystem turns each plane into an
 * entity whose mesh sits at the plane's pose, with +Y as the surface's up.
 *
 * The desk is the nearest table-like surface in front of the viewer and a
 * comfortable reach below the eyes. The spot on it is straight ahead,
 * moved in from the edges so the whole tablet fits on the desk.
 */

import { Vector3, type Object3D } from '@iwsdk/core';

/** A detected surface: its mesh (posed at the plane) and the WebXR plane. */
export interface DetectedSurface {
  object: Object3D;
  plane: XRPlane;
}

/** Labels that are desks; other labelled surfaces (couch, floor, bed) are not. */
const DESK_LABELS = new Set(['table', 'desk']);
/** An unlabelled surface counts as a desk at this height above the floor (metres). */
const MIN_DESK_HEIGHT_M = 0.55;
const MAX_DESK_HEIGHT_M = 1.15;
/** A desk sits this far below the eyes (seated or standing) ... */
const MIN_BELOW_EYES_M = 0.15;
const MAX_BELOW_EYES_M = 1.0;
/** ... and the tablet lands at most this far out, horizontally ... */
const MAX_REACH_M = 1.0;
/** ... and no more than this far to the side of straight ahead (degrees). */
const MAX_OFF_AHEAD_DEG = 60;
/** Where the tablet's centre lands when the desk allows: this far out from the eyes. */
const PREFERRED_REACH_M = 0.4;
/** Kept between the tablet's centre and the desk's edge: about half the tablet, plus a little. */
const EDGE_MARGIN_M = 0.2;

const target = new Vector3();
const local = new Vector3();
const spot = new Vector3();

/**
 * Put the best desk spot (world space, on the desk's surface) in `out`.
 * `yaw` is the head's yaw (Three's: 0 faces -Z). False when no desk fits.
 */
export function findDeskSpot(
  surfaces: Iterable<DetectedSurface>,
  head: Vector3,
  yaw: number,
  out: Vector3,
): boolean {
  let best = Infinity;
  for (const { object, plane } of surfaces) {
    if (!isDesk(plane, object.position.y, head.y)) continue;
    object.updateWorldMatrix(true, false);
    // Straight ahead at the preferred reach, at the desk's height.
    target.set(
      head.x - Math.sin(yaw) * PREFERRED_REACH_M,
      object.position.y,
      head.z - Math.cos(yaw) * PREFERRED_REACH_M,
    );
    object.worldToLocal(local.copy(target));
    spotOnSurface(plane.polygon, local.x, local.z, spot);
    object.localToWorld(spot);
    if (!withinReach(spot, head, yaw)) continue;
    const miss = spot.distanceTo(target);
    if (miss < best) {
      best = miss;
      out.copy(spot);
    }
  }
  return best < Infinity;
}

function isDesk(plane: XRPlane, height: number, eyes: number): boolean {
  if (plane.orientation !== 'horizontal') return false;
  const label = plane.semanticLabel;
  if (label && !DESK_LABELS.has(label)) return false;
  if (!label && (height < MIN_DESK_HEIGHT_M || height > MAX_DESK_HEIGHT_M)) return false;
  const below = eyes - height;
  return below >= MIN_BELOW_EYES_M && below <= MAX_BELOW_EYES_M;
}

function withinReach(point: Vector3, head: Vector3, yaw: number): boolean {
  const dx = point.x - head.x;
  const dz = point.z - head.z;
  if (Math.hypot(dx, dz) > MAX_REACH_M) return false;
  const off = Math.atan2(-dx, -dz) - yaw;
  return Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= (MAX_OFF_AHEAD_DEG * Math.PI) / 180;
}

/**
 * The point (plane-local x, z) closest to (x, z) that keeps EDGE_MARGIN_M
 * from the polygon's edges, or as close to that as a small desk allows:
 * from the nearest edge point, step in toward the middle.
 */
function spotOnSurface(polygon: readonly DOMPointReadOnly[], x: number, z: number, out: Vector3): void {
  let nearestX = x;
  let nearestZ = z;
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const length2 = abx * abx + abz * abz;
    const t = length2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / length2)) : 0;
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < nearest) {
      nearest = d;
      nearestX = px;
      nearestZ = pz;
    }
  }
  if (contains(polygon, x, z) && nearest >= EDGE_MARGIN_M) {
    out.set(x, 0, z);
    return;
  }
  // Step in from the nearest edge toward the middle of the surface.
  let cx = 0;
  let cz = 0;
  for (const p of polygon) {
    cx += p.x / polygon.length;
    cz += p.z / polygon.length;
  }
  const toMiddle = Math.hypot(cx - nearestX, cz - nearestZ);
  const step = toMiddle > 0 ? Math.min(EDGE_MARGIN_M, toMiddle) / toMiddle : 0;
  out.set(nearestX + (cx - nearestX) * step, 0, nearestZ + (cz - nearestZ) * step);
}

/** Even-odd point-in-polygon test on the plane's x, z. */
function contains(polygon: readonly DOMPointReadOnly[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
