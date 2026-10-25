/**
 * Which home surface is showing: the full window, or the compact dock of
 * floating buttons. The home window and dock systems both read and change
 * it, so it lives in `world.globals` like the NoteSession.
 */

import type { World } from '@iwsdk/core';

export type HomeMode = 'full' | 'compact';

export interface HomeModeChange {
  mode: HomeMode;
  /** Open the settings sheet when switching to the full window. */
  openSettings: boolean;
}

export class HomeModeState {
  private current: HomeMode = 'full';
  private readonly listeners = new Set<(change: HomeModeChange) => void>();

  get mode(): HomeMode {
    return this.current;
  }

  set(mode: HomeMode, { openSettings = false } = {}): void {
    if (mode === this.current && !openSettings) return;
    this.current = mode;
    for (const listener of this.listeners) listener({ mode, openSettings });
  }

  subscribe(listener: (change: HomeModeChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const KEY = 'metaNotes.homeMode';

/** The shared state, created on first use. */
export function getHomeMode(world: World): HomeModeState {
  let state = world.globals[KEY];
  if (!(state instanceof HomeModeState)) {
    state = new HomeModeState();
    world.globals[KEY] = state;
  }
  return state as HomeModeState;
}
