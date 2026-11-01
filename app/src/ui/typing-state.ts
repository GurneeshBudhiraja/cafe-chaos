/**
 * Write or type: how the open note takes input.
 *
 * In Write mode the page lies on the tablet and the pen writes on it. In
 * Type mode the page floats in front of the viewer, the keyboard lies on
 * the desk, and keys type into the page's text frames (TextEditor). The
 * toggle sits on the note bar. The typing systems share the editor through
 * this state, which lives in `world.globals` like the other shared state.
 */

import type { World } from '@iwsdk/core';
import type { TextEditor } from '../text/text-editor.js';
import type { TextLayout } from '../text/text-layout.js';

export type InputMode = 'write' | 'type';

export class TypingState {
  private modeValue: InputMode = 'write';
  private readonly listeners = new Set<(mode: InputMode) => void>();
  /** The editor for the open page's text, once TypingSystem has made it. */
  editor: TextEditor | null = null;
  layout: TextLayout | null = null;

  get mode(): InputMode {
    return this.modeValue;
  }

  get typing(): boolean {
    return this.modeValue === 'type';
  }

  setMode(mode: InputMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    for (const listener of this.listeners) listener(mode);
  }

  toggle(): void {
    this.setMode(this.typing ? 'write' : 'type');
  }

  subscribe(listener: (mode: InputMode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const KEY = 'metaNotes.typing';

/** The shared state, created on first use. */
export function getTyping(world: World): TypingState {
  let state = world.globals[KEY];
  if (!(state instanceof TypingState)) {
    state = new TypingState();
    world.globals[KEY] = state;
  }
  return state as TypingState;
}
