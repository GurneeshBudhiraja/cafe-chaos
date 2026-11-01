/**
 * Whether a note is open on the tablet in front of the viewer. Starting or
 * opening a note from the home opens it; the page's close button puts it
 * away and brings the dock back. NoteViewSystem shows the page and
 * CompactDockSystem steps aside, so the state lives in `world.globals`
 * like the home state.
 */

import type { World } from '@iwsdk/core';

export class NoteViewState {
  private openValue = false;
  private readonly listeners = new Set<(open: boolean) => void>();

  get isOpen(): boolean {
    return this.openValue;
  }

  open(): void {
    this.set(true);
  }

  close(): void {
    this.set(false);
  }

  subscribe(listener: (open: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(open: boolean): void {
    if (open === this.openValue) return;
    this.openValue = open;
    for (const listener of this.listeners) listener(open);
  }
}

const KEY = 'metaNotes.noteView';

/** The shared state, created on first use. */
export function getNoteView(world: World): NoteViewState {
  let state = world.globals[KEY];
  if (!(state instanceof NoteViewState)) {
    state = new NoteViewState();
    world.globals[KEY] = state;
  }
  return state as NoteViewState;
}
