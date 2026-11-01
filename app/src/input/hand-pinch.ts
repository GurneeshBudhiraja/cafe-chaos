/**
 * Reading a tracked hand's pinch from its joints (WebXR hand tracking).
 *
 * A pinch is the thumb and index fingertips closing on each other. Reading
 * it from the joints, rather than from the pointer's "select" events, works
 * however the hand is turned and does not depend on its pointer ray, which
 * is what holding a pen and tapping on it need.
 */

import { Matrix4, Vector3 } from '@iwsdk/core';

export type Hand = 'left' | 'right';
export const HANDS: readonly Hand[] = ['right', 'left'];

/** Thumb and index tips closer than this (metres) are pinched. */
export const PINCH_CLOSED_M = 0.015;
/** Further apart than this, the fingers have clearly opened (a deliberate tap or a release). */
export const PINCH_OPEN_M = 0.03;

/** One hand's pinch this frame. */
export interface PinchReading {
  /** False when the hand is not tracked this frame (the other fields are stale). */
  tracked: boolean;
  /** Midpoint of the thumb and index tips (world). */
  point: Vector3;
  /** The web between thumb and index (world): where a held pen's tail rests. */
  web: Vector3;
  /** Distance between the thumb and index tips (metres); Infinity when untracked. */
  gap: number;
}

export function createPinchReading(): PinchReading {
  return { tracked: false, point: new Vector3(), web: new Vector3(), gap: Infinity };
}

/** Where the session's joints are read from, for one frame. */
export interface HandFrame {
  frame: XRFrame;
  space: XRReferenceSpace;
  /** The player's world matrix: joints come in the player's space. */
  origin: Matrix4;
}

const joint = new Vector3();

/** Read `hand`'s pinch into `out`; returns `out.tracked`. Allocates nothing. */
export function readPinch(source: XRInputSource | undefined, at: HandFrame, out: PinchReading): boolean {
  out.tracked = false;
  out.gap = Infinity;
  const hand = source?.hand;
  if (!hand) return false;
  if (!jointAt(at, hand, 'thumb-tip', out.point) || !jointAt(at, hand, 'index-finger-tip', joint)) return false;
  out.gap = out.point.distanceTo(joint);
  out.point.add(joint).multiplyScalar(0.5);
  // The web of the thumb: between the index knuckle and the thumb's base.
  if (!jointAt(at, hand, 'index-finger-metacarpal', out.web) || !jointAt(at, hand, 'thumb-phalanx-proximal', joint)) {
    return false;
  }
  out.web.add(joint).multiplyScalar(0.5);
  out.tracked = true;
  return true;
}

/** A joint's world position into `out`, or false when it is not tracked. */
function jointAt(at: HandFrame, hand: XRHand, name: XRHandJoint, out: Vector3): boolean {
  const space = hand.get(name);
  const pose = space && at.frame.getJointPose?.(space, at.space);
  if (!pose) return false;
  const p = pose.transform.position;
  out.set(p.x, p.y, p.z).applyMatrix4(at.origin);
  return true;
}
