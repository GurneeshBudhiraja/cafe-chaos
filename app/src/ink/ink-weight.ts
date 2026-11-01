/**
 * How heavy the pen's ink is at each point: a little thicker where the nib
 * moves slowly and a little thinner where it moves fast, as with a real
 * fineliner, whose ink spreads more when it lingers. You cannot feel the
 * page in the headset, so this small, visible response to how you write
 * makes the pen feel like it is really touching paper.
 *
 * The result is a width multiplier per point (around 1), stored in
 * `Stroke.widths`. It eases from point to point, so lines never look lumpy.
 */

/** Nib speeds (metres a second) for the heaviest and the lightest ink. */
const SLOW_MPS = 0.02;
const FAST_MPS = 0.16;
/** Width multipliers at those speeds. */
const HEAVY = 1.25;
const LIGHT = 0.8;
/** How much each new point moves toward its target weight (0 to 1). */
const EASE = 0.3;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class InkWeight {
  private weight = 1;

  /** A new stroke starts at the normal width. */
  start(): number {
    this.weight = 1;
    return this.weight;
  }

  /** The weight for a point `distanceM` from the last one, drawn `seconds` after it. */
  next(distanceM: number, seconds: number): number {
    const speed = seconds > 0 ? distanceM / seconds : FAST_MPS;
    const target = HEAVY + (LIGHT - HEAVY) * smoothstep(SLOW_MPS, FAST_MPS, speed);
    this.weight += (target - this.weight) * EASE;
    return this.weight;
  }
}
