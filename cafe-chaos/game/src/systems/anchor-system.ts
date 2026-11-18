/**
 * AnchorSystem: pins the café to the real world, so it stays put on the
 * player's table instead of drifting and wobbling against it.
 *
 * The headset keeps refining its map of the room; content placed only in
 * the session's reference space slides relative to the real table as it
 * does. A WebXR anchor is a point the headset itself keeps track of in the
 * real world: once the café has settled (placed, or let go after being
 * moved, turned or resized), an anchor is made where it stands, and every
 * frame the café takes its place from the anchor. (Meta: "attaching content
 * to an anchor ... ensures it stays in place".)
 *
 * Whenever something else moves the café (the arrival, the hold, the
 * handles), the anchor is let go, and a new one is made once the café has
 * stood still for a moment. The anchor's pose carries a little noise from
 * frame to frame: a correction starts only once the café is CORRECT (a few
 * millimetres, a third of a degree) off its anchor, and then eases it into
 * place over a few frames instead of snapping, so the café never twitches
 * on the table (and its shadow map is not redrawn every frame for
 * nothing). The café stays upright: only the anchor's turn about the
 * vertical is used.
 */

import { createSystem, Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import { CafeSystem } from './cafe-system.js';

/** How long the café must stand still before it is pinned (seconds). */
const SETTLE_S = 0.5;
/** Smaller differences than these are not a move (by others); a correction under way stops here. */
const EPSILON = { metres: 0.001, radians: 0.0017 };
/** How far off its anchor the café must be before it is corrected (the anchor's own noise is under this). */
const CORRECT = { metres: 0.004, radians: 0.006 };
/** How quickly a correction closes the gap (per second; most of it in a quarter of a second). */
const CORRECT_EASE = 12;

export class AnchorSystem extends createSystem({}) {
  /** The anchor the café stands on (null: not pinned). */
  anchor: XRAnchor | null = null;
  /** Anchors made and corrections applied (for the checks). */
  made = 0;
  corrected = 0;
  private cafeSystem: CafeSystem | null = null;
  /** Bumped whenever the anchor is let go: an anchor arriving for an older one is not wanted. */
  private generation = 0;
  private busy = false;
  private still = 0;
  private readonly lastPosition = new Vector3(Number.NaN, 0, 0);
  private lastYaw = Number.NaN;
  private readonly m = new Matrix4();
  private readonly placed = new Matrix4();
  private readonly p = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly forward = new Vector3();

  init(): void {
    this.cafeSystem = this.world.getSystem(CafeSystem) ?? null;
    this.world.renderer.xr.addEventListener('sessionend', () => this.letGo());
  }

  update(delta: number): void {
    const system = this.cafeSystem;
    const frame = this.xrFrame as XRFrame | undefined;
    const space = this.xrManager.getReferenceSpace();
    if (!system || !frame || !space || !this.world.renderer.xr.isPresenting || !system.placed || system.arriving) {
      this.letGo();
      return;
    }
    const cafe = system.cafe;
    const yaw = cafe.rotation.y;
    // Moved by something else since last frame: let the anchor go, and wait for the café to settle.
    if (this.lastPosition.distanceTo(cafe.position) > EPSILON.metres || !(Math.abs(yaw - this.lastYaw) <= EPSILON.radians)) {
      this.letGo();
      this.still = 0;
      this.remember(cafe.position, yaw);
      return;
    }
    if (!this.anchor) {
      this.still += delta;
      if (this.still >= SETTLE_S && !this.busy) this.pin(frame, space, cafe.position, yaw);
      return;
    }
    // Pinned: the café takes its place from the anchor.
    if (!frame.trackedAnchors?.has(this.anchor)) return;
    const pose = frame.getPose(this.anchor.anchorSpace, space);
    if (!pose) return;
    this.placed.multiplyMatrices(this.player.matrixWorld, this.m.fromArray(pose.transform.matrix));
    this.placed.decompose(this.p, this.q, this.s);
    this.forward.set(0, 0, 1).applyQuaternion(this.q);
    const anchoredYaw = Math.atan2(this.forward.x, this.forward.z);
    const off = this.p.distanceTo(cafe.position);
    let turn = anchoredYaw - yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    if (!this.correcting) {
      if (off <= CORRECT.metres && Math.abs(turn) <= CORRECT.radians) return;
      this.correcting = true;
      this.corrected++;
    }
    if (off <= EPSILON.metres && Math.abs(turn) <= EPSILON.radians) {
      this.correcting = false;
      return;
    }
    // Eased toward the anchor's pose; the last millimetre in one step.
    const k = off <= EPSILON.metres * 2 && Math.abs(turn) <= EPSILON.radians * 2 ? 1 : 1 - Math.exp(-CORRECT_EASE * delta);
    cafe.position.lerp(this.p, k);
    cafe.rotation.set(0, yaw + turn * k, 0);
    this.remember(cafe.position, cafe.rotation.y);
  }
  /** A correction is under way (the café is easing onto its anchor). */
  private correcting = false;

  /** Make an anchor where the café stands (world pose taken back into the session's space). */
  private pin(frame: XRFrame, space: XRReferenceSpace, position: Vector3, yaw: number): void {
    if (typeof frame.createAnchor !== 'function') return;
    this.m.compose(position, this.q.setFromAxisAngle(this.up, yaw), this.s.set(1, 1, 1));
    this.placed.copy(this.player.matrixWorld).invert().multiply(this.m);
    this.placed.decompose(this.p, this.q, this.s);
    const wanted = this.generation;
    this.busy = true;
    const made = frame.createAnchor(new XRRigidTransform({ x: this.p.x, y: this.p.y, z: this.p.z }, { x: this.q.x, y: this.q.y, z: this.q.z, w: this.q.w }), space);
    (made ?? Promise.resolve(undefined))
      .then((anchor) => {
        if (!anchor) return;
        // The café moved (or the session ended) while it was being made: not wanted any more.
        if (wanted !== this.generation) {
          anchor.delete();
          return;
        }
        this.anchor = anchor;
        this.made++;
      })
      .catch(() => {})
      .finally(() => {
        this.busy = false;
      });
  }

  private letGo(): void {
    this.correcting = false;
    if (this.anchor) this.anchor.delete();
    this.anchor = null;
    // Any anchor still being made is not wanted.
    this.generation++;
  }

  private remember(position: Vector3, yaw: number): void {
    this.lastPosition.copy(position);
    this.lastYaw = yaw;
  }
}
