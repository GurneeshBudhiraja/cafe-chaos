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
 * A pinch is the headset's own select event for that hand, or the thumb
 * and index tips touching (see ../lib/hand-pinch.ts), whichever comes
 * first; the pinch point is the midpoint of the two tips, so this needs
 * no pointer rays. The pinch point is smoothed (a one-euro
 * filter: steady at rest, no lag when moving), and a hand that drops out
 * of tracking for a moment keeps its last pinch (TRACKING_GRACE_S), so a
 * flicker never drops what it holds. Nothing is allocated per frame.
 */

import { Box3, createSystem, Vector3 } from '@iwsdk/core';
import { FLOOR_Y, GHOST_M, HOLD_MARGIN_M, PINCH_M, RELEASE_M, SCALE_MAX, SCALE_MIN, SETTLE_S, SMOOTH, TRACKING_GRACE_S } from '../hold/hold.js';
import { PinchCursor } from '../hands/pinch-cursor.js';
import { HANDS, readJoint, readPinchPoint, type Hand } from '../lib/hand-pinch.js';
import { ANNEX_MIN_X, CafeSystem } from './cafe-system.js';

/** An angle brought into (-π, π], so a line of hands crossing the seam at ±π never reads as a full turn. */
export function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

interface Pinch {
  /** The pinch point this frame (world), smoothed. */
  point: Vector3;
  /** Thumb to index tip gap (metres); Infinity when the hand is not tracked. */
  gap: number;
  /** Closed as of last frame (with hysteresis between PINCH_M and RELEASE_M). */
  closed: boolean;
  /** How long the hand has been out of tracking (seconds); 0 while tracked. */
  lost: number;
  /** The headset's own pinch for this hand (its select event is active). */
  native: boolean;
  /** The headset has sent this hand select events this session: its pinch is trusted to say when the pinch ends. */
  nativeSeen: boolean;
  /** How long the hand has been tracked since it was last found (seconds). */
  found: number;
  /** The same real hand as the other one, read twice (see GHOST_M): not drawn, its pinch ignored. */
  ghost: boolean;
}

export class HoldSystem extends createSystem({}) {
  /** The hand(s) holding the café, in the order they took it. */
  readonly holding: Hand[] = [];
  /** Each hand's pinch, read every frame (the dev harness reads these too). */
  readonly pinch: Record<Hand, Pinch> = {
    left: { point: new Vector3(), gap: Infinity, closed: false, lost: 0, native: false, nativeSeen: false, found: 0, ghost: false },
    right: { point: new Vector3(), gap: Infinity, closed: false, lost: 0, native: false, nativeSeen: false, found: 0, ghost: false },
  };
  /** Each hand's index fingertip (world), for pressing buttons; `tracked` false when the hand is not seen. */
  readonly tip: Record<Hand, { point: Vector3; tracked: boolean }> = {
    left: { point: new Vector3(), tracked: false },
    right: { point: new Vector3(), tracked: false },
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
  /** The dot at each hand's pinch point (see ../hands/pinch-cursor.ts). */
  readonly cursor = new PinchCursor();
  private cafe: CafeSystem | null = null;
  private session: XRSession | null = null;
  private readonly onSelect = (event: XRInputSourceEvent): void => {
    const source = event.inputSource;
    const hand = source.handedness;
    if (!source.hand || (hand !== 'left' && hand !== 'right')) return;
    this.pinch[hand].native = event.type === 'selectstart';
    this.pinch[hand].nativeSeen = true;
  };
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
  private readonly raw = new Vector3();
  /** Each hand's `closed` as of last frame, so only a fresh pinch takes the café. */
  private readonly previous: Record<Hand, boolean> = { left: false, right: false };

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem) ?? null;
    this.world.createTransformEntity(this.cursor.group);
    // The headset's own pinch: the session's select events for each hand.
    const xr = this.world.renderer.xr;
    xr.addEventListener('sessionstart', () => this.listen(xr.getSession()));
    xr.addEventListener('sessionend', () => this.listen(null));
    this.listen(xr.getSession());
    if (!this.cafe) return;
    const cafe = this.cafe.cafe;
    // The bounds of the furniture and shell (not the lights, halos or the wide spill), in café space.
    cafe.updateMatrixWorld(true);
    for (const piece of this.cafe.pieces) this.bounds.expandByObject(piece);
    this.bounds.min.sub(cafe.position).divideScalar(cafe.scale.x);
    this.bounds.max.sub(cafe.position).divideScalar(cafe.scale.x);
  }

  private listen(session: XRSession | null): void {
    if (this.session === session) return;
    this.session?.removeEventListener('selectstart', this.onSelect);
    this.session?.removeEventListener('selectend', this.onSelect);
    this.session = session;
    session?.addEventListener('selectstart', this.onSelect);
    session?.addEventListener('selectend', this.onSelect);
    for (const hand of HANDS) {
      this.pinch[hand].native = false;
      this.pinch[hand].nativeSeen = false;
    }
  }

  update(delta: number): void {
    const cafe = this.cafe;
    if (!cafe || !cafe.placed || cafe.arriving || !this.world.renderer.xr.isPresenting) {
      this.holding.length = 0;
      this.cursor.hide();
      return;
    }
    // The annex widens the café to the left: the handles go round it too.
    if (cafe.annexOpen && this.bounds.min.x > ANNEX_MIN_X) this.bounds.min.x = ANNEX_MIN_X;
    for (const hand of HANDS) this.read(hand, delta);
    this.findGhost();
    for (const hand of HANDS) {
      const p = this.pinch[hand];
      // No dot (and no hand drawn) until a newly found hand has settled, nor for a ghost.
      const shown = p.gap < Infinity && p.found >= SETTLE_S && !p.ghost;
      this.cursor.show(hand, p.point, shown, p.closed, delta);
      const model = this.world.input.xr.visualAdapters.hand[hand].visual?.model;
      if (model && !shown) model.visible = false;
    }
    this.release();
    this.takeByPinch();
    if (this.holding.length === 2) this.stretch();
    else if (this.holding.length === 1) this.carry();
  }

  // -------------------------------------------------------------- hands

  private read(hand: Hand, delta: number): void {
    const p = this.pinch[hand];
    const source = this.world.input.xr.getPrimaryInputSource(hand);
    const tip = this.tip[hand];
    tip.tracked = readJoint(source, this.xrFrame, this.xrManager.getReferenceSpace(), this.player.matrixWorld, 'index-finger-tip', tip.point);
    const gap = readPinchPoint(source, this.xrFrame, this.xrManager.getReferenceSpace(), this.player.matrixWorld, this.raw, this.scratch);
    if (gap === Infinity) {
      // Out of tracking: keep the last pinch for a moment, then count the hand as gone.
      p.lost += delta;
      if (p.lost > TRACKING_GRACE_S) {
        p.gap = Infinity;
        p.closed = false;
        p.native = false;
      }
      return;
    }
    if (p.gap === Infinity) {
      // Just found: start from here, and let it settle before its pinch counts.
      p.point.copy(this.raw);
      p.found = 0;
    } else {
      // The one-euro filter: steadier the slower the hand moves.
      const speed = delta > 0 ? this.raw.distanceTo(p.point) / delta : 0;
      const k = 1 - Math.exp(-2 * Math.PI * (SMOOTH.minHz + SMOOTH.beta * speed) * delta);
      p.point.lerp(this.raw, k);
    }
    p.lost = 0;
    p.gap = gap;
    p.found += delta;
    if (p.found < SETTLE_S) {
      // Still settling: open, whatever the fingers seem to do.
      p.closed = false;
      return;
    }
    // The headset's pinch, or the tips touching; once pinched, it holds until the tips are clearly apart
    // (hysteresis, PINCH_M to RELEASE_M), so a flicker of either reading never opens the hand.
    p.closed = p.native || p.gap < PINCH_M || (p.closed && p.gap <= RELEASE_M);
  }

  /**
   * One real hand read as both (wrists closer than GHOST_M): the hand found
   * more recently is the ghost. Its pinch is dropped, so it neither picks
   * anything up nor holds anything.
   */
  private findGhost(): void {
    const { left, right } = this.pinch;
    left.ghost = right.ghost = false;
    if (left.gap === Infinity || right.gap === Infinity) return;
    const space = this.xrManager.getReferenceSpace();
    const input = this.world.input.xr;
    if (!readJoint(input.getPrimaryInputSource('left'), this.xrFrame, space, this.player.matrixWorld, 'wrist', this.raw)) return;
    if (!readJoint(input.getPrimaryInputSource('right'), this.xrFrame, space, this.player.matrixWorld, 'wrist', this.scratch)) return;
    if (this.raw.distanceTo(this.scratch) > GHOST_M) return;
    const ghost = left.found < right.found ? left : right;
    ghost.ghost = true;
    ghost.closed = false;
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

  /** Is a world point on or near the café: within `margin` metres (real) of its bounds? */
  nearCafe(point: Vector3, margin = HOLD_MARGIN_M): boolean {
    if (!this.cafe) return false;
    const cafe = this.cafe.cafe;
    this.v.copy(point);
    cafe.worldToLocal(this.v);
    const m = margin / cafe.scale.x;
    const b = this.bounds;
    return this.v.x > b.min.x - m && this.v.x < b.max.x + m && this.v.z > b.min.z - m && this.v.z < b.max.z + m && this.v.y > b.min.y - m && this.v.y < b.max.y + m;
  }

  /**
   * Is a hand working over the café: anywhere in the column over its
   * footprint (with `margin` round it), from under its floor up to `above`
   * metres over its roof? Such a hand is reaching for guests, not pointing:
   * its ray presses nothing (GameSystem). The café's own box alone left a
   * hand held high over the roof, lifting a guest or reaching over to the
   * back, free to press the bar's Pause or Shop with the pinch meant for a
   * guest (the owner's playtest: the ray "clicking on random things").
   */
  overCafe(point: Vector3, margin = HOLD_MARGIN_M, above = 0.3): boolean {
    if (!this.cafe) return false;
    const cafe = this.cafe.cafe;
    this.v.copy(point);
    cafe.worldToLocal(this.v);
    const k = cafe.scale.x || 1;
    const m = margin / k;
    const b = this.bounds;
    return this.v.x > b.min.x - m && this.v.x < b.max.x + m && this.v.z > b.min.z - m && this.v.z < b.max.z + m && this.v.y > b.min.y - m && this.v.y < b.max.y + above / k;
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
    const turn = wrapAngle(Math.atan2(b.x - a.x, b.z - a.z) - this.angle0);
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
