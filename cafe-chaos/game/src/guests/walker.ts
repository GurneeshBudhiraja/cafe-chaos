/**
 * A walk: a path of waypoints in the café's space and how far along it a
 * guest is. The system moves the guest's root along it at a set speed
 * and turns it to face the way it is going; the Walk clip, played at the
 * matching pace, keeps the feet planted.
 */

import { Vector3 } from '@iwsdk/core';

export class Walk {
  readonly points: Vector3[];
  readonly length: number;
  walked = 0;
  private readonly spans: number[] = [];

  constructor(points: Vector3[]) {
    this.points = points.map((p) => p.clone());
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      const span = this.points[i].distanceTo(this.points[i - 1]);
      this.spans.push(span);
      total += span;
    }
    this.length = total;
  }

  get done(): boolean {
    return this.walked >= this.length - 1e-6;
  }

  /** Metres still to go. */
  get remaining(): number {
    return Math.max(0, this.length - this.walked);
  }

  /** Move `distance` metres along; true once at the end. */
  advance(distance: number): boolean {
    this.walked = Math.min(this.length, this.walked + distance);
    return this.done;
  }

  /** Where the walker is now. */
  position(out: Vector3): Vector3 {
    const { index, t } = this.locate();
    return out.lerpVectors(this.points[index], this.points[Math.min(index + 1, this.points.length - 1)], t);
  }

  /** The stretch being walked: its two ends and how far along it the walker is (0 to 1). */
  span(): { from: Vector3; to: Vector3; t: number } {
    const { index, t } = this.locate();
    return { from: this.points[index], to: this.points[Math.min(index + 1, this.points.length - 1)], t };
  }

  /** The yaw (about +Y; the models face +Z at 0) of the stretch being walked, or `fallback` on a zero-length path. */
  heading(fallback: number): number {
    const { index } = this.locate();
    const a = this.points[index];
    const b = this.points[Math.min(index + 1, this.points.length - 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return Math.hypot(dx, dz) < 1e-5 ? fallback : Math.atan2(dx, dz);
  }

  private locate(): { index: number; t: number } {
    let left = this.walked;
    for (let i = 0; i < this.spans.length; i++) {
      if (left <= this.spans[i] || i === this.spans.length - 1) return { index: i, t: this.spans[i] > 0 ? Math.min(1, left / this.spans[i]) : 1 };
      left -= this.spans[i];
    }
    return { index: 0, t: 1 };
  }
}

/** The shortest turn from one yaw to another, in (-PI, PI]. */
export function yawDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
