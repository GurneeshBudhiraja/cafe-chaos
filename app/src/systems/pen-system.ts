/**
 * PenSystem: the pen beside the tablet, picked up and held like a real pen.
 *
 * The pen lies next to the tablet's right edge (it is part of the tablet,
 * so it comes and goes with the note page). Pinch next to it with a
 * tracked hand to pick it up: it sits in the pinch, between thumb and
 * index finger, lying along the hand from the web of the thumb to just past
 * the fingertips, the way a pen is held. It follows the hand while the
 * pinch holds and never sinks into the page (the nib rests on it, like on
 * paper). Open the pinch and it goes back to its place.
 *
 * The pinch is read from the hand's joints (thumb and index tips closing),
 * not from select events, so it does not depend on the pointer ray.
 * InkSystem inks where the nib touches the page (PenState).
 */

import {
  createSystem,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import { STYLUS_LENGTH_M, STYLUS_RADIUS_M, stylusPrototype } from '../scene-assets/stylus.scene-asset.js';
import {
  SURFACE_HEIGHT_M,
  SURFACE_WIDTH_M,
  TABLET_BACK_M,
  TABLET_HALF_WIDTH_M,
  WRITING_SURFACE_NAME,
} from '../scene-assets/tablet.scene-asset.js';
import { getNoteView } from '../ui/note-view.js';
import { getPen, type PenState } from '../ui/pen-state.js';
import { easeOutCubic, getTweens, type Tweens } from '../ui/tweens.js';

const TABLET_NODE = 'tablet';
/** Thumb and index tips closer than this (metres) pinch; further than RELEASE lets go. */
const PINCH_M = 0.015;
const RELEASE_M = 0.03;
/** A pinch this close to the pen (metres from its axis) picks it up. */
const GRAB_RADIUS_M = 0.05;
/** The nib reaches this far past the pinch, as with a pen held near its tip. */
const NIB_BEYOND_PINCH_M = 0.03;
/** Where the pen rests: off the tablet's right edge, on the desk (tablet-local metres). */
const REST_GAP_M = 0.03;
const RETURN_MS = 260;

type Hand = 'left' | 'right';
const HANDS: Hand[] = ['right', 'left'];
const X_AXIS = new Vector3(1, 0, 0);

/** One hand's pinch, from its joints this frame. */
interface PinchReading {
  /** Midpoint of the thumb and index tips (world). */
  point: Vector3;
  /** The web between thumb and index (world), where a held pen's tail rests. */
  web: Vector3;
  gap: number;
  pinched: boolean;
}

export class PenSystem extends createSystem({}) {
  private pen!: PenState;
  private tweens!: Tweens;
  private tablet!: Object3D;
  private surface!: Mesh;
  private stylus!: Object3D;
  /** The nib's offset from the pen's origin along its axis (+X). */
  private nibOffset = 0;
  private holder: Hand | null = null;
  private readonly readings: Record<Hand, PinchReading> = {
    left: { point: new Vector3(), web: new Vector3(), gap: Infinity, pinched: false },
    right: { point: new Vector3(), web: new Vector3(), gap: Infinity, pinched: false },
  };
  private readonly restPosition = new Vector3();
  private readonly restQuaternion = new Quaternion();
  private readonly fromPosition = new Vector3();
  private readonly fromQuaternion = new Quaternion();
  private readonly direction = new Vector3();
  private readonly nib = new Vector3();
  private readonly local = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly q = new Quaternion();
  private readonly tabletQuaternion = new Quaternion();
  private readonly origin = new Matrix4();
  private readonly joint = new Vector3();

  init(): void {
    const tabletEntity: Entity | undefined = this.world.getSceneEntity(TABLET_NODE);
    const surface = tabletEntity?.object3D?.getObjectByName(WRITING_SURFACE_NAME);
    if (!tabletEntity?.object3D || !(surface instanceof Mesh)) {
      console.warn('[PenSystem] Tablet missing from the scene.');
      return;
    }
    this.pen = getPen(this.world);
    this.tweens = getTweens(this.world);
    this.tablet = tabletEntity.object3D;
    this.surface = surface;

    // The pen is part of the tablet: a child entity, so it shows, hides,
    // fades and moves with it.
    this.stylus = stylusPrototype.clone();
    this.world.createTransformEntity(this.stylus, { parent: tabletEntity });
    this.nibOffset = this.stylus.getObjectByName('NibTip')?.position.x ?? STYLUS_LENGTH_M / 2;

    // At rest: lying on the desk off the right edge, nib away from the
    // viewer (tablet +Y), its flat docking facet down (tablet -Z).
    this.restPosition.set(TABLET_HALF_WIDTH_M + REST_GAP_M, 0, -TABLET_BACK_M + STYLUS_RADIUS_M);
    this.restQuaternion
      .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2));
    this.putDown(false);

    this.cleanupFuncs.push(
      // Putting the page away puts the pen down too.
      getNoteView(this.world).subscribe((open) => {
        if (!open && this.holder) this.putDown(false);
      }),
      () => this.tweens.cancel('pen-return'),
    );
  }

  update(): void {
    if (!this.stylus || !this.tablet.visible) return;
    for (const hand of HANDS) this.readPinch(hand);

    if (this.holder) {
      const held = this.readings[this.holder];
      if (held.gap > RELEASE_M) this.putDown(true);
      else this.followHand(held);
      return;
    }
    for (const hand of HANDS) {
      const reading = this.readings[hand];
      if (reading.pinched && this.nearPen(reading.point)) {
        this.tweens.cancel('pen-return');
        this.holder = hand;
        this.pen.held = true;
        this.followHand(reading);
        return;
      }
    }
  }

  // ----------------------------------------------------------- the hands

  /** Read one hand's thumb and index joints; a pinch counts once, as it closes. */
  private readPinch(hand: Hand): void {
    const reading = this.readings[hand];
    const wasClosed = reading.gap < PINCH_M;
    reading.gap = Infinity;
    reading.pinched = false;
    const source = this.world.input.xr.getPrimaryInputSource(hand);
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    if (!source?.hand || !frame || !space) return;
    this.origin.copy(this.player.matrixWorld);
    const thumb = this.jointAt(frame, source.hand, 'thumb-tip', space, reading.point);
    const index = thumb && this.jointAt(frame, source.hand, 'index-finger-tip', space, this.joint);
    if (!index) return;
    reading.gap = reading.point.distanceTo(this.joint);
    reading.point.add(this.joint).multiplyScalar(0.5);
    // The web of the thumb: between the index knuckle and the thumb's base.
    const knuckle = this.jointAt(frame, source.hand, 'index-finger-metacarpal', space, reading.web);
    const thumbBase = knuckle && this.jointAt(frame, source.hand, 'thumb-phalanx-proximal', space, this.joint);
    if (!thumbBase) return;
    reading.web.add(this.joint).multiplyScalar(0.5);
    reading.pinched = !wasClosed && reading.gap < PINCH_M;
  }

  /** A joint's world position into `out`, or false when it is not tracked. */
  private jointAt(frame: XRFrame, hand: XRHand, name: XRHandJoint, space: XRReferenceSpace, out: Vector3): boolean {
    const joint = hand.get(name);
    const pose = joint && frame.getJointPose?.(joint, space);
    if (!pose) return false;
    const p = pose.transform.position;
    out.set(p.x, p.y, p.z).applyMatrix4(this.origin);
    return true;
  }

  /** Whether a world point is within GRAB_RADIUS_M of the pen's axis. */
  private nearPen(point: Vector3): boolean {
    this.stylus.updateWorldMatrix(true, false);
    this.stylus.localToWorld(this.a.set(-STYLUS_LENGTH_M / 2, 0, 0));
    this.stylus.localToWorld(this.b.set(STYLUS_LENGTH_M / 2, 0, 0));
    this.b.sub(this.a);
    const t = Math.min(1, Math.max(0, this.local.copy(point).sub(this.a).dot(this.b) / this.b.lengthSq()));
    return this.a.addScaledVector(this.b, t).distanceTo(point) <= GRAB_RADIUS_M;
  }

  // --------------------------------------------------------------- holding

  /** Put the pen in the pinch, lying from the web of the thumb past the fingertips. */
  private followHand(reading: PinchReading): void {
    this.direction.copy(reading.point).sub(reading.web).normalize();
    this.nib.copy(reading.point).addScaledVector(this.direction, NIB_BEYOND_PINCH_M);
    this.keepAbovePage(this.nib);
    this.pen.nib.copy(this.nib);

    // World pose, then into the tablet's space (the pen is its child).
    this.q.setFromUnitVectors(X_AXIS, this.direction);
    this.tablet.updateWorldMatrix(true, false);
    this.tablet.getWorldQuaternion(this.tabletQuaternion).invert();
    this.stylus.quaternion.copy(this.tabletQuaternion).multiply(this.q);
    this.stylus.position.copy(this.nib).addScaledVector(this.direction, -this.nibOffset);
    this.tablet.worldToLocal(this.stylus.position);
  }

  /** A nib pushed into the page stays on its surface, like on paper. */
  private keepAbovePage(nib: Vector3): void {
    this.surface.updateWorldMatrix(true, false);
    const local = this.surface.worldToLocal(this.local.copy(nib));
    const onPage = Math.abs(local.x) <= SURFACE_WIDTH_M / 2 && Math.abs(local.y) <= SURFACE_HEIGHT_M / 2;
    if (!onPage || local.z >= 0) return;
    local.z = 0;
    nib.copy(this.surface.localToWorld(local));
  }

  /** Let go: the pen glides back to its place beside the tablet (or jumps there). */
  private putDown(animate: boolean): void {
    this.holder = null;
    this.pen.held = false;
    if (!animate) {
      this.tweens.cancel('pen-return');
      this.stylus.position.copy(this.restPosition);
      this.stylus.quaternion.copy(this.restQuaternion);
      return;
    }
    this.fromPosition.copy(this.stylus.position);
    this.fromQuaternion.copy(this.stylus.quaternion);
    this.tweens.play(
      RETURN_MS,
      (t) => {
        const e = easeOutCubic(t);
        this.stylus.position.lerpVectors(this.fromPosition, this.restPosition, e);
        this.stylus.quaternion.slerpQuaternions(this.fromQuaternion, this.restQuaternion, e);
      },
      { key: 'pen-return' },
    );
  }
}
