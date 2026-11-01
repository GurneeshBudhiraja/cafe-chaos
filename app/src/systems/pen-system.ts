/**
 * PenSystem: the pen beside the tablet, picked up and held like a real pen.
 *
 * The pen lies next to the tablet's right edge (it is part of the tablet,
 * so it comes and goes with the note page). Pinch next to it with a
 * tracked hand to pick it up: it sits in the pinch, between thumb and
 * index finger, lying along the hand from the web of the thumb to just past
 * the fingertips, the way a pen is held. It follows the hand while the
 * pinch holds and never sinks into the page (the nib rests on it, like on
 * paper). Keep the fingers open for a moment and it goes back to its place;
 * a quick open-and-close while holding it is a tap on the pen (two make a
 * double-tap, which opens the tool wheel), not a release (pinch-taps.ts).
 *
 * The pinch is read from the hand's joints (hand-pinch.ts), not from select
 * events, so it does not depend on the pointer ray. InkSystem inks where the
 * nib touches the page (PenState).
 */

import {
  AssetManager,
  createSystem,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import {
  createPinchReading,
  HANDS,
  PINCH_CLOSED_M,
  readPinch,
  type Hand,
  type HandFrame,
  type PinchReading,
} from '../input/hand-pinch.js';
import { PinchTapDetector } from '../input/pinch-taps.js';
import { STYLUS_LENGTH_M, STYLUS_RADIUS_M, stylusPrototype } from '../scene-assets/stylus.scene-asset.js';
import {
  SURFACE_HEIGHT_M,
  SURFACE_WIDTH_M,
  TABLET_BACK_M,
  TABLET_HALF_WIDTH_M,
  WRITING_SURFACE_NAME,
} from '../scene-assets/tablet.scene-asset.js';
import { getNoteView } from '../ui/note-view.js';
import { OneEuroVector3, type OneEuroSettings } from '../ui/one-euro.js';
import { getPen, type PenState } from '../ui/pen-state.js';
import { devLog } from '../util/dev-log.js';
import { easeOutCubic, getTweens, type Tweens } from '../ui/tweens.js';

const TABLET_NODE = 'tablet';
/** A pinch this close to the pen (metres from its axis) picks it up. */
const GRAB_RADIUS_M = 0.05;
/** The nib reaches this far past the pinch, as with a pen held near its tip. */
const NIB_BEYOND_PINCH_M = 0.03;
/** Where the pen rests: off the tablet's right edge, on the desk (tablet-local metres). */
const REST_GAP_M = 0.03;
const RETURN_MS = 260;
/**
 * Steadying the held pen against hand-tracking shake (see one-euro.ts):
 * strong smoothing when the hand is still, little when it moves, so writing
 * stays quick. Shared by the pinch point (which places the nib) and the web
 * of the thumb (which sets the pen's angle).
 */
const STEADY: OneEuroSettings = { minCutoffHz: 1.2, beta: 40, derivativeCutoffHz: 1 };

const X_AXIS = new Vector3(1, 0, 0);

export class PenSystem extends createSystem({}) {
  private pen!: PenState;
  private tweens!: Tweens;
  private tablet!: Object3D;
  private surface!: Mesh;
  private stylus!: Object3D;
  /** The soft shadow the resting pen casts on the desk (part of the tablet model), or null. */
  private restShadow: Object3D | null = null;
  /** The nib's offset from the pen's origin along its axis (+X). */
  private nibOffset = 0;
  private holder: Hand | null = null;
  private readonly readings: Record<Hand, PinchReading> = {
    left: createPinchReading(),
    right: createPinchReading(),
  };
  /** Whether each hand was pinched last frame: a pickup needs a pinch that closes near the pen. */
  private readonly wasClosed: Record<Hand, boolean> = { left: false, right: false };
  /** Taps and letting go, read from the holding hand. */
  private readonly taps = new PinchTapDetector();
  private readonly steadyPoint = new OneEuroVector3(STEADY);
  private readonly steadyWeb = new OneEuroVector3(STEADY);
  /** The held hand's reading after steadying (what the pen follows). */
  private readonly steady: PinchReading = createPinchReading();
  /**
   * The gesture clock (ms): frame time scaled like the UI animations
   * (Tweens.timeScale), so tap timing stays true in slowed-down recordings.
   */
  private clockMs = 0;
  private readonly handFrame: HandFrame = { frame: null!, space: null!, origin: new Matrix4() };
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
    // fades and moves with it. It is the Blender model (`stylus`, loaded
    // with the app's critical assets); the code-built one stands in if the
    // model is missing.
    this.stylus = AssetManager.getGLTF('stylus')?.scene ?? stylusPrototype.clone();
    this.world.createTransformEntity(this.stylus, { parent: tabletEntity });
    this.nibOffset = this.stylus.getObjectByName('NibTip')?.position.x ?? STYLUS_LENGTH_M / 2;
    this.restShadow = this.tablet.getObjectByName('PenRestShadow') ?? null;

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

  update(delta: number): void {
    if (!this.stylus) return;
    this.clockMs += delta * 1000 * this.tweens.timeScale;
    if (!this.tablet.visible) return;
    if (!this.readHands()) return;

    if (this.holder) {
      this.updateHeld(this.readings[this.holder], delta);
      return;
    }
    for (const hand of HANDS) {
      const reading = this.readings[hand];
      const closed = reading.gap < PINCH_CLOSED_M;
      const justPinched = closed && !this.wasClosed[hand];
      this.wasClosed[hand] = closed;
      if (justPinched && this.nearPen(reading.point)) {
        this.pickUp(hand);
        return;
      }
    }
  }

  // ----------------------------------------------------------- the hands

  /** Read both hands' pinches for this frame; false outside an XR frame. */
  private readHands(): boolean {
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    if (!frame || !space) return false;
    this.handFrame.frame = frame;
    this.handFrame.space = space;
    this.handFrame.origin.copy(this.player.matrixWorld);
    for (const hand of HANDS) {
      readPinch(this.world.input.xr.getPrimaryInputSource(hand), this.handFrame, this.readings[hand]);
    }
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

  private pickUp(hand: Hand): void {
    this.tweens.cancel('pen-return');
    this.holder = hand;
    this.pen.holder = hand;
    this.pen.held = true;
    this.taps.reset();
    // Steadying starts fresh from where the hand is now, so the pen never slides in.
    this.steadyPoint.reset(this.readings[hand].point);
    this.steadyWeb.reset(this.readings[hand].web);
    // Lifted off the desk: its resting shadow goes.
    if (this.restShadow) this.restShadow.visible = false;
    this.followHand(this.readings[hand]);
  }

  /** The pen in hand: a tap, letting go, or following the (steadied) hand. Taps read the raw fingers. */
  private updateHeld(reading: PinchReading, delta: number): void {
    const event = this.taps.update(reading.gap, this.clockMs);
    this.pen.loosened = this.taps.loosened;
    if (event === 'release') {
      this.putDown(true);
      return;
    }
    if (event) {
      devLog('pen', event);
      this.pen.emitTap(event);
    }
    // Mid-tap the fingers part and their midpoint jumps: the pen stays where it was.
    if (!this.taps.loosened) this.followHand(this.steadied(reading, delta));
  }

  /** The held hand's reading with the shake taken out (into `this.steady`). */
  private steadied(reading: PinchReading, seconds: number): PinchReading {
    this.steady.tracked = reading.tracked;
    this.steady.point.copy(this.steadyPoint.next(reading.point, seconds));
    this.steady.web.copy(this.steadyWeb.next(reading.web, seconds));
    this.steady.gap = reading.gap;
    return this.steady;
  }

  /** Put the pen in the pinch, lying from the web of the thumb past the fingertips. */
  private followHand(reading: PinchReading): void {
    if (!reading.tracked) return;
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
    // The hand that let go must pinch afresh to pick the pen up again.
    if (this.holder) this.wasClosed[this.holder] = true;
    this.holder = null;
    this.pen.holder = null;
    this.pen.held = false;
    this.pen.loosened = false;
    if (!animate) {
      this.tweens.cancel('pen-return');
      this.stylus.position.copy(this.restPosition);
      this.stylus.quaternion.copy(this.restQuaternion);
      if (this.restShadow) this.restShadow.visible = true;
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
      // Back on the desk: its resting shadow returns.
      { key: 'pen-return', done: () => this.restShadow && (this.restShadow.visible = true) },
    );
  }
}
