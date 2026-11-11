/**
 * HoldSystem: lets the player pick the café up and put it where they
 * like, at the size they like, at any time.
 *
 * Pinch anywhere on or just around the café (over its garden, roof or
 * fence) and it follows the pinch: lift it, slide it along the table,
 * set it down somewhere else. Pinch with both hands and the distance
 * between them resizes it, the line between them turns it, and the point
 * between them stays put under the hands, so stretching and turning feel
 * like handling a model on a table. It always stays upright and never
 * sinks below the floor. The handles (HandleSystem) offer the same moves
 * more visibly; pinches near them are left to them (`claims`). Taking
 * hold of the café by its body is behind `directGrab` (off while there
 * are guests to pick up); the handles always work.
 *
 * Pinches are read from the hands' joints (see ../lib/hand-pinch.ts), so
 * this needs no pointer rays. Nothing is allocated per frame.
 */

import { Box3, createSystem, Vector3 } from '@iwsdk/core';
import { FLOOR_Y, HOLD_MARGIN_M, PINCH_M, RELEASE_M, SCALE_MAX, SCALE_MIN } from '../hold/hold.js';
import { HANDS, readPinchPoint, type Hand } from '../lib/hand-pinch.js';
import { CafeSystem } from './cafe-system.js';

interface Pinch {
  /** The pinch point this frame (world). */
  point: Vector3;
  /** Thumb to index tip gap (metres); Infinity when the hand is not tracked. */
  gap: number;
  /** Closed as of last frame (with hysteresis between PINCH_M and RELEASE_M). */
  closed: boolean;
}

export class HoldSystem extends createSystem({}) {
  /** The hand(s) holding the café, in the order they took it. */
  readonly holding: Hand[] = [];
  /** Each hand's pinch, read every frame (the dev harness reads these too). */
  readonly pinch: Record<Hand, Pinch> = {
    left: { point: new Vector3(), gap: Infinity, closed: false },
    right: { point: new Vector3(), gap: Infinity, closed: false },
  };
  /** The café's bounds in its own space at scale 1 (set once it is built). */
  readonly bounds = new Box3();
  /** A pinch any of these claims is not taken here (it is on a handle, or on a guest). */
  readonly claims: ((point: Vector3) => boolean)[] = [];
  /**
   * Whether pinching the café's own body takes hold of it. Off: with
   * guests to pick up all over the café, a pinch that just misses one
   * must not drag the whole café away. The pill and the corner brackets
   * (HandleSystem) move, resize and turn it; they call `holdWith`.
   */
  directGrab = false;
  private cafe: CafeSystem | null = null;
  // One hand: where the café's origin sits relative to the pinch (world).
  private readonly offset = new Vector3();
  // Two hands: the grip as it was when the second hand took hold.
  private span0 = 1;
  private angle0 = 0;
  private scale0 = 1;
  private yaw0 = 0;
  private readonly rel0 = new Vector3();
  private readonly mid = new Vector3();
  private readonly v = new Vector3();
  private readonly scratch = new Vector3();
  /** Each hand's `closed` as of last frame, so only a fresh pinch takes the café. */
  private readonly previous: Record<Hand, boolean> = { left: false, right: false };

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem) ?? null;
    if (!this.cafe) return;
    const cafe = this.cafe.cafe;
    // The bounds of the furniture and shell (not the lights, halos or the wide spill), in café space.
    cafe.updateMatrixWorld(true);
    for (const piece of this.cafe.pieces) this.bounds.expandByObject(piece);
    this.bounds.min.sub(cafe.position).divideScalar(cafe.scale.x);
    this.bounds.max.sub(cafe.position).divideScalar(cafe.scale.x);
  }

  update(): void {
    const cafe = this.cafe;
    if (!cafe || !cafe.placed || cafe.arriving || !this.world.renderer.xr.isPresenting) {
      this.holding.length = 0;
      return;
    }
    for (const hand of HANDS) this.read(hand);
    this.release();
    this.takeByPinch();
    if (this.holding.length === 2) this.stretch();
    else if (this.holding.length === 1) this.carry();
  }

  // -------------------------------------------------------------- hands

  private read(hand: Hand): void {
    const p = this.pinch[hand];
    const source = this.world.input.xr.getPrimaryInputSource(hand);
    p.gap = readPinchPoint(source, this.xrFrame, this.xrManager.getReferenceSpace(), this.player.matrixWorld, p.point, this.scratch);
    // Hysteresis: a pinch opens only once the fingers are clearly apart.
    p.closed = p.gap < PINCH_M || (p.closed && p.gap <= RELEASE_M);
  }

  /** Is this hand's pinch point on or just around the café? */
  private over(hand: Hand): boolean {
    const cafe = this.cafe!.cafe;
    this.v.copy(this.pinch[hand].point);
    cafe.worldToLocal(this.v);
    const m = HOLD_MARGIN_M / cafe.scale.x;
    const b = this.bounds;
    return this.v.x > b.min.x - m && this.v.x < b.max.x + m && this.v.z > b.min.z - m && this.v.z < b.max.z + m && this.v.y > b.min.y - m && this.v.y < b.max.y + m;
  }

  /** Hands that let go (or were lost) stop holding; a remaining hand carries on alone. */
  private release(): void {
    for (let i = this.holding.length - 1; i >= 0; i--) {
      if (this.pinch[this.holding[i]].closed) continue;
      this.holding.splice(i, 1);
      if (this.holding.length === 1) this.beginCarry();
    }
  }

  /** A pinch closing over the café takes it (the second hand joins the first). */
  private takeByPinch(): void {
    for (const hand of HANDS) {
      const p = this.pinch[hand];
      if (!p.closed || this.holding.includes(hand) || this.holding.length >= 2) continue;
      // Only a pinch closing this frame takes the café, not one already closed elsewhere, and not one on a handle.
      if (!this.directGrab || this.previous[hand] || !this.over(hand) || this.claims.some((claim) => claim(p.point))) continue;
      this.holdWith(hand);
    }
    for (const hand of HANDS) this.previous[hand] = this.pinch[hand].closed;
  }

  /** Have `hand` take hold of the café now (from a pinch on it, or on the dock's Move handle). */
  holdWith(hand: Hand): void {
    if (this.holding.includes(hand) || this.holding.length >= 2) return;
    this.holding.push(hand);
    this.cafe!.movedByHand = true;
    if (this.holding.length === 1) this.beginCarry();
    else this.beginStretch();
  }

  // -------------------------------------------------------------- moving

  private beginCarry(): void {
    const cafe = this.cafe!.cafe;
    this.offset.copy(cafe.position).sub(this.pinch[this.holding[0]].point);
  }

  /** One hand: the café keeps its place relative to the pinch. */
  private carry(): void {
    const cafe = this.cafe!.cafe;
    cafe.position.copy(this.pinch[this.holding[0]].point).add(this.offset);
    cafe.position.y = Math.max(FLOOR_Y, cafe.position.y);
  }

  private beginStretch(): void {
    const cafe = this.cafe!.cafe;
    const a = this.pinch[this.holding[0]].point;
    const b = this.pinch[this.holding[1]].point;
    this.span0 = Math.max(0.02, Math.hypot(b.x - a.x, b.z - a.z));
    this.angle0 = Math.atan2(b.x - a.x, b.z - a.z);
    this.scale0 = cafe.scale.x;
    this.yaw0 = cafe.rotation.y;
    this.mid.addVectors(a, b).multiplyScalar(0.5);
    this.rel0.copy(cafe.position).sub(this.mid);
  }

  /**
   * Two hands: their distance sets the size, their line the turn, and the
   * café's origin keeps its place relative to the point between them
   * (turned and scaled with it, sideways), so the model stays under the
   * hands. Its height is kept: it grows from its base, as a model on a
   * table would, rather than rising or sinking with the hands.
   */
  private stretch(): void {
    const cafe = this.cafe!.cafe;
    const a = this.pinch[this.holding[0]].point;
    const b = this.pinch[this.holding[1]].point;
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, (this.scale0 * span) / this.span0));
    const turn = Math.atan2(b.x - a.x, b.z - a.z) - this.angle0;
    const grow = scale / this.scale0;
    this.mid.addVectors(a, b).multiplyScalar(0.5);
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    this.v.set((this.rel0.x * cos + this.rel0.z * sin) * grow, this.rel0.y, (-this.rel0.x * sin + this.rel0.z * cos) * grow);
    cafe.position.copy(this.mid).add(this.v);
    cafe.position.y = Math.max(FLOOR_Y, cafe.position.y);
    cafe.rotation.set(0, this.yaw0 + turn, 0);
    cafe.scale.setScalar(scale);
  }

}
