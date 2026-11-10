/**
 * HandleSystem: the café's grab pill and corner brackets (see
 * ../handles/handles.ts), kept in place and worked.
 *
 * Every frame the pill lies just outside the edge of the café's base that
 * faces the player (it moves to another edge as the player moves round,
 * with a little hysteresis), and a bracket wraps each corner of the base,
 * all at their own size on the table, following the café wherever it goes
 * and however it is turned or sized. Each brightens as a hand comes near.
 *
 * A pinch closing on the pill takes the café for carrying (HoldSystem
 * does the carry, as for a pinch on the café itself). A pinch closing on
 * a bracket drags that corner: pulling it out from the café's centre
 * grows the café (from its base, in place), pushing it in shrinks it, and
 * swinging it round the centre turns the café, so the corner stays under
 * the fingers. Pinches near a handle are kept from the café's own grab,
 * so a handle always wins where they overlap.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { SCALE_MAX, SCALE_MIN } from '../hold/hold.js';
import { BRACKET, CORNER_SIGNS, LIFT_M, NEAR_M, PILL, REACH_M, SHOW, SIDE_HYSTERESIS, growFor, makeBracket, makePill, type Corner, type Handle, type Side } from '../handles/handles.js';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { CafeSystem } from './cafe-system.js';
import { HoldSystem } from './hold-system.js';

interface CornerDrag {
  hand: Hand;
  corner: Corner;
  /** The pinch's distance from the café's centre and its bearing when it took the corner, and the café's size and turn then. */
  radius0: number;
  angle0: number;
  scale0: number;
  yaw0: number;
}

export class HandleSystem extends createSystem({}) {
  readonly pill = makePill();
  readonly brackets: Handle[] = [makeBracket(), makeBracket(), makeBracket(), makeBracket()];
  /** Which edge of the base the pill is on. */
  side: Side = 'front';
  /** The corner drag in progress, if any. */
  drag: CornerDrag | null = null;
  /** Counts, for the dev harness. */
  readonly taken = { pill: 0, corner: 0 };
  private cafe: CafeSystem | null = null;
  private hold: HoldSystem | null = null;
  private readonly head = new Vector3();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly previousPinch: Record<Hand, boolean> = { left: false, right: false };

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem) ?? null;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    for (const handle of [this.pill, ...this.brackets]) {
      handle.group.visible = false;
      this.world.createTransformEntity(handle.group);
    }
    // The café's own grab leaves pinches near a handle alone.
    if (this.hold) this.hold.exclude = (point) => this.nearest(point) !== null;
  }

  update(delta: number): void {
    const cafe = this.cafe;
    const hold = this.hold;
    const shown = !!cafe && !!hold && cafe.placed && this.world.renderer.xr.isPresenting;
    for (const handle of [this.pill, ...this.brackets]) handle.group.visible = shown;
    if (!shown) {
      this.drag = null;
      return;
    }
    this.placePill();
    this.placeBrackets();
    this.take();
    if (this.drag) this.dragCorner();
    this.brighten(delta);
  }

  // ------------------------------------------------------------ placing

  /** The pill goes to the edge of the base facing the head. */
  private placePill(): void {
    const cafe = this.cafe!.cafe;
    const b = this.hold!.bounds;
    this.player.head.getWorldPosition(this.head);
    cafe.worldToLocal(this.v.copy(this.head));
    // How far past each edge the head is, as a fraction of the base's half-size: the largest wins.
    const fx = this.v.x / b.max.x;
    const fz = this.v.z / b.max.z;
    const want: Side = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 'right' : 'left') : fz > 0 ? 'front' : 'back';
    const current = this.side === 'right' ? fx : this.side === 'left' ? -fx : this.side === 'front' ? fz : -fz;
    const best = Math.max(Math.abs(fx), Math.abs(fz));
    if (want !== this.side && best > current + SIDE_HYSTERESIS) this.side = want;
    const s = cafe.scale.x;
    const grow = growFor(s);
    const gap = ((PILL.gap + PILL.width / 2) * grow) / s;
    switch (this.side) {
      case 'front':
        this.v.set(0, 0, b.max.z + gap);
        break;
      case 'back':
        this.v.set(0, 0, b.min.z - gap);
        break;
      case 'right':
        this.v.set(b.max.x + gap, 0, 0);
        break;
      case 'left':
        this.v.set(b.min.x - gap, 0, 0);
        break;
    }
    this.v.y = LIFT_M / s;
    const group = this.pill.group;
    group.scale.setScalar(grow);
    cafe.localToWorld(group.position.copy(this.v));
    // Along the edge: the pill's length runs along X for the front and back edges, along Z for the sides.
    group.rotation.set(0, cafe.rotation.y + (this.side === 'left' || this.side === 'right' ? Math.PI / 2 : 0), 0);
  }

  /** A bracket wraps each corner, its vertex just outside the corner and its arms back along the edges. */
  private placeBrackets(): void {
    const cafe = this.cafe!.cafe;
    const b = this.hold!.bounds;
    const s = cafe.scale.x;
    const grow = growFor(s);
    const gap = (BRACKET.gap * grow) / s;
    this.brackets.forEach((bracket, i) => {
      const [sx, sz] = CORNER_SIGNS[i];
      this.v.set(sx > 0 ? b.max.x + gap : b.min.x - gap, LIFT_M / s, sz > 0 ? b.max.z + gap : b.min.z - gap);
      const group = bracket.group;
      group.scale.setScalar(grow);
      cafe.localToWorld(group.position.copy(this.v));
      // The bracket's arms run along +X and +Z from its vertex; turn them to point back toward the base.
      // Front-right (+x,+z): arms toward -x,-z: a half turn. Front-left (-x,+z): arms toward +x,-z. And so on.
      const turn = sx > 0 && sz > 0 ? Math.PI : sx < 0 && sz > 0 ? Math.PI / 2 : sx < 0 && sz < 0 ? 0 : -Math.PI / 2;
      group.rotation.set(0, cafe.rotation.y + turn, 0);
    });
  }

  // ------------------------------------------------------------- taking

  /** The handle (pill, or a corner index) within reach of a world point, or null. */
  private nearest(point: Vector3): 'pill' | Corner | null {
    this.pill.group.getWorldPosition(this.w);
    // The pill is long: measure to the nearest point on its length.
    // (The group is scaled with the café, so local half-lengths are in the handle's own units.)
    this.pill.group.worldToLocal(this.w.copy(point));
    this.w.x = Math.max(-PILL.length / 2, Math.min(PILL.length / 2, this.w.x));
    this.w.y = 0;
    this.w.z = 0;
    this.pill.group.localToWorld(this.w);
    if (this.w.distanceTo(point) <= REACH_M) return 'pill';
    const grow = this.pill.group.scale.x;
    for (let i = 0; i < 4; i++) {
      this.brackets[i].group.getWorldPosition(this.w);
      if (this.w.distanceTo(point) <= REACH_M + BRACKET.arm * grow * 0.4) return i as Corner;
    }
    return null;
  }

  /** A pinch closing on a handle takes it. */
  private take(): void {
    const hold = this.hold!;
    for (const hand of HANDS) {
      const pinch = hold.pinch[hand];
      const fresh = pinch.closed && !this.previousPinch[hand];
      this.previousPinch[hand] = pinch.closed;
      if (!fresh || hold.holding.includes(hand) || this.drag?.hand === hand) continue;
      const which = this.nearest(pinch.point);
      if (which === null) continue;
      if (which === 'pill') {
        hold.holdWith(hand);
        this.taken.pill++;
      } else {
        this.beginDrag(hand, which);
        this.taken.corner++;
      }
    }
  }

  // -------------------------------------------------------- corner drag

  private beginDrag(hand: Hand, corner: Corner): void {
    const cafe = this.cafe!.cafe;
    const p = this.hold!.pinch[hand].point;
    const dx = p.x - cafe.position.x;
    const dz = p.z - cafe.position.z;
    this.drag = { hand, corner, radius0: Math.max(0.05, Math.hypot(dx, dz)), angle0: Math.atan2(dx, dz), scale0: cafe.scale.x, yaw0: cafe.rotation.y };
    this.cafe!.movedByHand = true;
  }

  /** The corner follows the pinch round the café's centre: its distance sets the size, its bearing the turn. */
  private dragCorner(): void {
    const drag = this.drag!;
    const pinch = this.hold!.pinch[drag.hand];
    if (!pinch.closed) {
      this.drag = null;
      return;
    }
    const cafe = this.cafe!.cafe;
    const dx = pinch.point.x - cafe.position.x;
    const dz = pinch.point.z - cafe.position.z;
    const radius = Math.hypot(dx, dz);
    const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, (drag.scale0 * radius) / drag.radius0));
    cafe.scale.setScalar(scale);
    cafe.rotation.set(0, drag.yaw0 + (Math.atan2(dx, dz) - drag.angle0), 0);
  }

  // ------------------------------------------------------------ brightness

  /** Each handle brightens as a hand nears, and fully while held. */
  private brighten(delta: number): void {
    const hold = this.hold!;
    const k = Math.min(1, SHOW.fade * delta);
    const carrying = hold.holding.length > 0;
    const grow = this.pill.group.scale.x;
    this.light(this.pill, carrying ? SHOW.held : this.nearHand(this.pill, (PILL.length / 2) * grow) ? SHOW.near : SHOW.rest, k);
    this.brackets.forEach((bracket, i) => {
      const held = this.drag?.corner === i;
      this.light(bracket, held ? SHOW.held : this.nearHand(bracket, BRACKET.arm * grow * 0.5) ? SHOW.near : SHOW.rest, k);
    });
  }

  private nearHand(handle: Handle, slack: number): boolean {
    handle.group.getWorldPosition(this.w);
    for (const hand of HANDS) {
      const p = this.hold!.pinch[hand];
      if (p.gap < Infinity && this.w.distanceTo(p.point) <= NEAR_M + slack) return true;
    }
    return false;
  }

  private light(handle: Handle, target: number, k: number): void {
    handle.show += (target - handle.show) * k;
    handle.body.opacity = handle.show;
    handle.side.opacity = handle.show;
    handle.glow.opacity = handle.show * SHOW.glowShare;
  }
}
