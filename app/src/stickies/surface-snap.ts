/**
 * Sticking a sticky note to a real surface: the nearest wall, desk, door or
 * other surface Quest knows from Space Setup (WebXR plane detection; the
 * same detected surfaces as desk-placement.ts).
 *
 * A carried note within reach of a surface lies flat on it: its back on the
 * surface, its face out. On a wall (or any upright surface) its top edge
 * points up; on a desk (or any flat one) its top edge points away from the
 * viewer, so it reads the right way up from where they sit.
 */

import { Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import { contains, type DetectedSurface } from '../ui/desk-placement.js';

/** A note this close to a surface (metres, from its centre) sticks to it. */
const STICK_WITHIN_M = 0.1;
/** Stuck notes sit this far off the surface, so they never flicker into it (metres). */
const OFF_SURFACE_M = 0.001;
/** A surface's normal within this of vertical makes it flat (a desk, not a wall). */
const FLAT_IF_UP_DOT = 0.7;

const normal = new Vector3();
const local = new Vector3();
const onPlane = new Vector3();
const up = new Vector3();
const side = new Vector3();
const basis = new Matrix4();
const WORLD_UP = new Vector3(0, 1, 0);

/**
 * The pose a note at `centre` takes stuck to the nearest surface within
 * reach, into `outPosition` and `outQuaternion` (world). False when no
 * surface is within reach.
 */
export function snapToSurface(
  surfaces: Iterable<DetectedSurface>,
  centre: Vector3,
  viewer: Vector3,
  outPosition: Vector3,
  outQuaternion: Quaternion,
): boolean {
  let best = STICK_WITHIN_M;
  let found = false;
  for (const { object, plane } of surfaces) {
    object.updateWorldMatrix(true, false);
    // In the plane's space: +Y is its normal, the polygon lies in x/z.
    object.worldToLocal(local.copy(centre));
    const distance = Math.abs(local.y);
    if (distance >= best || !contains(plane.polygon, local.x, local.z)) continue;
    // The note goes on the side of the surface the viewer is on.
    normal.set(0, 1, 0).transformDirection(object.matrixWorld);
    if (normal.dot(local.copy(viewer).sub(centre)) < 0) normal.negate();
    best = distance;
    found = true;
    // The centre, moved straight onto the surface, then just off it.
    object.getWorldPosition(onPlane);
    outPosition.copy(centre).addScaledVector(normal, -normal.dot(local.copy(centre).sub(onPlane)) + OFF_SURFACE_M);
    faceAlong(normal, viewer, outPosition, outQuaternion);
  }
  return found;
}

/** A note's rotation facing out along `out` (+Z), its top edge up on a wall or away from the viewer on a desk. */
function faceAlong(out: Vector3, viewer: Vector3, at: Vector3, outQuaternion: Quaternion): void {
  if (Math.abs(out.dot(WORLD_UP)) > FLAT_IF_UP_DOT) {
    up.copy(at).sub(viewer); // Away from the viewer...
  } else {
    up.copy(WORLD_UP); // ...or simply up.
  }
  up.addScaledVector(out, -up.dot(out)).normalize(); // Flat on the surface.
  side.crossVectors(up, out).normalize();
  basis.makeBasis(side, up, out);
  outQuaternion.setFromRotationMatrix(basis);
}
