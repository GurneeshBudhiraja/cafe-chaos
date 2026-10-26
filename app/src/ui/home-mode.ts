/**
 * Shared home UI state: which surface is showing (the full window, or the
 * compact dock of floating buttons), whether it is pinned to follow the
 * head (stick mode), and whether the user is dragging it. The home window,
 * dock and follow systems all use it, so it lives in `world.globals` like
 * the NoteSession.
 */

import type { World } from '@iwsdk/core';

export type HomeMode = 'full' | 'compact';

/** Name of the home window's glass mesh; its world scale is the window's size. */
export const WINDOW_GLASS_NAME = 'home-window-glass';

export class HomeModeState {
  /**
   * The dock is the home: the app opens on it, with no big window in front
   * of you (minimal for glasses and Quest alike). The full window is parked
   * for a future "all notes" view; nothing switches to it yet.
   */
  private current: HomeMode = 'compact';
  /**
   * Stick mode, on by default: the small floating home comes along wherever
   * you look. Its switch belongs in Settings (not built yet).
   */
  private pinnedValue = true;
  private draggingValue = false;
  private readonly listeners = new Set<(mode: HomeMode) => void>();
  private readonly placementListeners = new Set<() => void>();
  private readonly recenterListeners = new Set<() => void>();

  get mode(): HomeMode {
    return this.current;
  }

  set(mode: HomeMode): void {
    if (mode === this.current) return;
    this.current = mode;
    for (const listener of this.listeners) listener(mode);
    // After the surfaces have placed themselves, followers re-anchor.
    this.notifyPlacement();
  }

  subscribe(listener: (mode: HomeMode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Stick mode: the window and dock follow the head while pinned. */
  get pinned(): boolean {
    return this.pinnedValue;
  }

  setPinned(pinned: boolean): void {
    if (pinned === this.pinnedValue) return;
    this.pinnedValue = pinned;
    this.notifyPlacement();
  }

  /** True while the user drags the window or dock by its grab bar. */
  get dragging(): boolean {
    return this.draggingValue;
  }

  setDragging(dragging: boolean): void {
    if (dragging === this.draggingValue) return;
    this.draggingValue = dragging;
    this.notifyPlacement();
  }

  /**
   * Pin, drag or mode changes that affect where things should follow from.
   * Listeners re-read `pinned`, `dragging` and the objects' positions.
   */
  subscribePlacement(listener: () => void): () => void {
    this.placementListeners.add(listener);
    return () => this.placementListeners.delete(listener);
  }

  /**
   * Ask the home to come back in front of the viewer (a headset recenter,
   * or the first moments of a session once the head pose is known).
   */
  requestRecenter(): void {
    for (const listener of this.recenterListeners) listener();
  }

  subscribeRecenter(listener: () => void): () => void {
    this.recenterListeners.add(listener);
    return () => this.recenterListeners.delete(listener);
  }

  /** The home was moved by code (placed or recentered): followers re-anchor. */
  notifyMoved(): void {
    this.notifyPlacement();
  }

  private notifyPlacement(): void {
    for (const listener of this.placementListeners) listener();
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
