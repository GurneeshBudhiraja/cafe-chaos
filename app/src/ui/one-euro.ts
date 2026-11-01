/**
 * A One Euro filter for a moving 3D point (Casiez, Roussel and Vogel, 2012).
 *
 * Hand tracking shakes by a millimetre or two even when the hand is still,
 * and a held pen magnifies that into a visible shimmer. A fixed smoothing
 * would either leave the shake or make fast moves lag. This filter adapts:
 * when the point is nearly still it smooths hard (the shake goes), and as it
 * speeds up it smooths less (writing and flicks stay quick).
 *
 * - `minCutoffHz`: smoothing when still. Lower is steadier, but drifts more.
 * - `beta`: how fast smoothing drops off with speed (per metre a second).
 *   Higher means less lag on quick moves.
 * - `derivativeCutoffHz`: smoothing of the speed estimate itself.
 */

import { Vector3 } from '@iwsdk/core';

export interface OneEuroSettings {
  minCutoffHz: number;
  beta: number;
  derivativeCutoffHz: number;
}

/** Smoothing factor for one step of `seconds` at `cutoffHz` (an exponential smoother). */
function alpha(cutoffHz: number, seconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / seconds);
}

export class OneEuroVector3 {
  /** The filtered point. */
  readonly value = new Vector3();
  private readonly velocity = new Vector3();
  private readonly step = new Vector3();
  private primed = false;

  constructor(private readonly settings: OneEuroSettings) {}

  /** Start again from `point`, with no history (for example when the pen is picked up). */
  reset(point: Vector3): void {
    this.value.copy(point);
    this.velocity.set(0, 0, 0);
    this.primed = true;
  }

  /** Filter the next raw sample, taken `seconds` after the last one. Returns `value`. */
  next(point: Vector3, seconds: number): Vector3 {
    if (!this.primed || seconds <= 0) {
      if (!this.primed) this.reset(point);
      return this.value;
    }
    const { minCutoffHz, beta, derivativeCutoffHz } = this.settings;
    // The speed, smoothed a little so one shaky frame does not open the filter.
    this.step.copy(point).sub(this.value).divideScalar(seconds);
    this.velocity.lerp(this.step, alpha(derivativeCutoffHz, seconds));
    const cutoff = minCutoffHz + beta * this.velocity.length();
    this.value.lerp(point, alpha(cutoff, seconds));
    return this.value;
  }
}
