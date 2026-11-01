/**
 * Whether the tablet is held by its edge. Phase 2 (move and tilt) sets it
 * while the tablet is grabbed; the edge glow reads it to light the whole
 * rim. Lives in `world.globals` like the other shared state.
 */

import type { World } from '@iwsdk/core';

export class TabletEdgeState {
  /** True while a hand holds the tablet by its edge. */
  grabbed = false;
}

const KEY = 'metaNotes.tabletEdge';

/** The shared state, created on first use. */
export function getTabletEdge(world: World): TabletEdgeState {
  let state = world.globals[KEY];
  if (!(state instanceof TabletEdgeState)) {
    state = new TabletEdgeState();
    world.globals[KEY] = state;
  }
  return state as TabletEdgeState;
}
