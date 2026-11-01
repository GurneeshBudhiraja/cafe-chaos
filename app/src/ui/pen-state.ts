/**
 * The pen in hand, shared by PenSystem (which moves the pen with the hand)
 * and InkSystem (which inks where its nib touches the page). Lives in
 * `world.globals` like the other shared state.
 */

import { Vector3, type World } from '@iwsdk/core';

export class PenState {
  /** True while a hand holds the pen. */
  held = false;
  /** The nib's writing point, in world space (valid while held). */
  readonly nib = new Vector3();
}

const KEY = 'metaNotes.pen';

/** The shared state, created on first use. */
export function getPen(world: World): PenState {
  let state = world.globals[KEY];
  if (!(state instanceof PenState)) {
    state = new PenState();
    world.globals[KEY] = state;
  }
  return state as PenState;
}
