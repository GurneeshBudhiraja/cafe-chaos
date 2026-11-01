/**
 * Things a hand can pinch to pick up (sticky notes, the sticky-note pad),
 * so a pinch meant for one of them is not also read as a gesture in the air.
 *
 * The tool wheel opens on a free-hand pinch; a pinch closing on a sticky
 * note is picking it up instead. Systems that own pinchable things register
 * a test here; others ask before treating a pinch as an air gesture.
 * Lives in `world.globals` like the other shared state.
 */

import type { Vector3, World } from '@iwsdk/core';

/** Whether a pinch at a world point would pick something up. */
export type PinchTest = (point: Vector3) => boolean;

export class PinchTargets {
  private readonly tests = new Set<PinchTest>();

  register(test: PinchTest): () => void {
    this.tests.add(test);
    return () => this.tests.delete(test);
  }

  /** Whether a pinch at `point` is on something pinchable (not an air gesture). */
  onTarget(point: Vector3): boolean {
    for (const test of this.tests) if (test(point)) return true;
    return false;
  }
}

const KEY = 'metaNotes.pinchTargets';

/** The shared registry, created on first use. */
export function getPinchTargets(world: World): PinchTargets {
  let targets = world.globals[KEY];
  if (!(targets instanceof PinchTargets)) {
    targets = new PinchTargets();
    world.globals[KEY] = targets;
  }
  return targets as PinchTargets;
}
