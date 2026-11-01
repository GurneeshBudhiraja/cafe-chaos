/**
 * Whether the page's canvas is being panned or zoomed by hand right now
 * (CanvasGestureSystem). While it is, a touch on the page is the gesture's,
 * not ink: InkSystem drops a stroke the gesture's pinch began. Lives in
 * `world.globals` like the other shared state.
 */

import type { World } from '@iwsdk/core';

export class CanvasGestureState {
  private activeValue = false;
  private readonly listeners = new Set<(active: boolean) => void>();

  get active(): boolean {
    return this.activeValue;
  }

  set(active: boolean): void {
    if (active === this.activeValue) return;
    this.activeValue = active;
    for (const listener of this.listeners) listener(active);
  }

  subscribe(listener: (active: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const KEY = 'metaNotes.canvasGesture';

/** The shared state, created on first use. */
export function getCanvasGesture(world: World): CanvasGestureState {
  let state = world.globals[KEY];
  if (!(state instanceof CanvasGestureState)) {
    state = new CanvasGestureState();
    world.globals[KEY] = state;
  }
  return state as CanvasGestureState;
}
