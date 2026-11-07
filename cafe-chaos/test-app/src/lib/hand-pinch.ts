/**
 * Where a tracked hand pinches: the midpoint of its thumb and index tips,
 * read from the hand's joints (not from select events, so it works without
 * the pointer ray). For systems that react to a hand's position, such as
 * the tablet's edge glow.
 */

import type { Matrix4, Vector3 } from '@iwsdk/core';

export type Hand = 'left' | 'right';
export const HANDS: readonly Hand[] = ['right', 'left'];

/**
 * Write the hand's pinch point (world space) into `out`, and return the gap
 * between its thumb and index tips in metres, or Infinity when the hand is
 * not tracked this frame.
 *
 * `origin` is the player's world matrix: joint poses are in the XR
 * reference space, which moves with the player. `scratch` is a caller-owned
 * vector, so reading allocates nothing.
 */
export function readPinchPoint(
  source: XRInputSource | undefined,
  frame: XRFrame | undefined,
  space: XRReferenceSpace | null | undefined,
  origin: Matrix4,
  out: Vector3,
  scratch: Vector3,
): number {
  if (!source?.hand || !frame || !space) return Infinity;
  if (!jointAt(frame, source.hand, 'thumb-tip', space, origin, out)) return Infinity;
  if (!jointAt(frame, source.hand, 'index-finger-tip', space, origin, scratch)) return Infinity;
  const gap = out.distanceTo(scratch);
  out.add(scratch).multiplyScalar(0.5);
  return gap;
}

function jointAt(
  frame: XRFrame,
  hand: XRHand,
  name: XRHandJoint,
  space: XRReferenceSpace,
  origin: Matrix4,
  out: Vector3,
): boolean {
  const joint = hand.get(name);
  const pose = joint && frame.getJointPose?.(joint, space);
  if (!pose) return false;
  const p = pose.transform.position;
  out.set(p.x, p.y, p.z).applyMatrix4(origin);
  return true;
}
