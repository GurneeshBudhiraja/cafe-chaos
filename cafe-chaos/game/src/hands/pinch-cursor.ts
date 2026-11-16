/**
 * The pinch cursor: with no hand model drawn (HAND.style 'real'), this is
 * the one thing that shows what the headset sees of a hand. A small dot
 * sits between the thumb and index tips of each tracked hand: hidden
 * while the fingers are open, a small soft mint while a guest is lit
 * under them (a pinch now would take it), a small soft cream while they
 * are pinched, and gone the moment the hand drops out of tracking.
 * So a pinch that did not register, and a hand the headset has lost,
 * both show at once. Drawn over everything, so it is never hidden by
 * the café or the player's own hand.
 */

import { Color, Group, Mesh, MeshBasicMaterial, SphereGeometry, type Vector3 } from '@iwsdk/core';
import type { Hand } from '../lib/hand-pinch.js';

export const CURSOR = {
  enabled: true,
  /** The dot's radius (metres), and how much larger it is while pinched. */
  // Kept small and quiet: hidden while the hand is open, a small soft dot only while it matters.
  radius: 0.0028,
  grow: 1,
  open: { color: 0xf2ebdd, opacity: 0 },
  /** While a guest is lit under the open hand: the colour, the opacity, and how much larger the dot is. */
  aim: { color: 0xa9d8b8, opacity: 0.85, grow: 1.1 },
  closed: { color: 0xf2ebdd, opacity: 0.8 },
  /** How quickly it changes between the two (per second). */
  fade: 16,
};

interface Dot {
  mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
  /** 0 open to 1 pinched, eased. */
  pinch: number;
  /** 0 to 1 with a guest lit under the hand, eased. */
  aim: number;
}

export class PinchCursor {
  readonly group = new Group();
  private readonly dots: Record<Hand, Dot> = { left: this.dot(), right: this.dot() };
  private readonly open = new Color(CURSOR.open.color);
  private readonly closed = new Color(CURSOR.closed.color);
  private readonly aimed = new Color(CURSOR.aim.color);
  /** Set each frame by whoever lights things under a hand (GuestSystem): a pinch now would take something. */
  readonly aiming: Record<Hand, boolean> = { left: false, right: false };

  constructor() {
    this.group.name = 'PinchCursor';
    this.group.add(this.dots.left.mesh, this.dots.right.mesh);
  }

  private dot(): Dot {
    const material = new MeshBasicMaterial({ color: CURSOR.open.color, transparent: true, opacity: CURSOR.open.opacity, depthTest: false, depthWrite: false, toneMapped: false });
    const mesh = new Mesh(new SphereGeometry(CURSOR.radius, 12, 8), material);
    mesh.renderOrder = 1000;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, pinch: 0, aim: 0 };
  }

  /** Put a hand's dot at `point` (world), or hide it when the hand is not tracked. */
  show(hand: Hand, point: Vector3, tracked: boolean, pinched: boolean, delta: number): void {
    const dot = this.dots[hand];
    dot.mesh.visible = CURSOR.enabled && tracked;
    if (!dot.mesh.visible) return;
    dot.mesh.position.copy(point);
    dot.pinch += ((pinched ? 1 : 0) - dot.pinch) * Math.min(1, CURSOR.fade * delta);
    dot.aim += ((this.aiming[hand] && !pinched ? 1 : 0) - dot.aim) * Math.min(1, CURSOR.fade * delta);
    const t = dot.pinch;
    const a = dot.aim * (1 - t);
    dot.mesh.scale.setScalar(1 + (CURSOR.aim.grow - 1) * a + (CURSOR.grow - 1) * t);
    dot.mesh.material.color.copy(this.open).lerp(this.aimed, a).lerp(this.closed, t);
    dot.mesh.material.opacity = CURSOR.open.opacity + (CURSOR.aim.opacity - CURSOR.open.opacity) * a + (CURSOR.closed.opacity - CURSOR.open.opacity) * t;
  }

  hide(): void {
    this.dots.left.mesh.visible = false;
    this.dots.right.mesh.visible = false;
  }
}
