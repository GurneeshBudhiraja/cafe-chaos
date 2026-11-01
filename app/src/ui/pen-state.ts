/**
 * The pen in hand, shared by PenSystem (which moves the pen with the hand)
 * and the systems that react to it: InkSystem inks where its nib touches the
 * page, and ToolWheelSystem opens on a double-tap. Lives in `world.globals`
 * like the other shared state.
 */

import { Vector3, type World } from '@iwsdk/core';
import type { Hand } from '../input/hand-pinch.js';

/** A tap on the held pen: a quick open-and-close of the holding fingers. */
export type PenTap = 'tap' | 'double-tap';

export class PenState {
  /** True while a hand holds the pen. */
  held = false;
  /** The hand holding the pen, or null. */
  holder: Hand | null = null;
  /** True while the holding fingers are loosened (mid-tap or letting go): the pen does not ink. */
  loosened = false;
  /** The nib's writing point, in world space (valid while held). */
  readonly nib = new Vector3();
  private readonly tapListeners = new Set<(tap: PenTap) => void>();

  onTap(listener: (tap: PenTap) => void): () => void {
    this.tapListeners.add(listener);
    return () => this.tapListeners.delete(listener);
  }

  /** Called by PenSystem when the holding hand taps the pen. */
  emitTap(tap: PenTap): void {
    for (const listener of this.tapListeners) listener(tap);
  }
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
