/**
 * Write or type: how the open note takes input.
 *
 * In Write mode the page lies on the tablet and the pen writes on it. In
 * Type mode the page floats in front of the viewer and the headset's own
 * keyboard types into the page's text frames (TextEditor). The
 * toggle sits on the note bar. The typing systems share the editor through
 * this state, which lives in `world.globals` like the other shared state.
 */

import type { World } from '@iwsdk/core';
import type { KeyStroke } from '../text/key-commands.js';
import type { TextEditor } from '../text/text-editor.js';
import type { TextLayout } from '../text/text-layout.js';

export type InputMode = 'write' | 'type';

export class TypingState {
  private modeValue: InputMode = 'write';
  private readonly listeners = new Set<(mode: InputMode) => void>();
  /** The editor for the open page's text, once TypingSystem has made it. */
  editor: TextEditor | null = null;
  layout: TextLayout | null = null;
  /** Types one key into the page (set by TypingSystem). */
  private keyHandler: ((stroke: KeyStroke) => boolean) | null = null;
  /** Brings the headset's keyboard up (set by TypingSystem). */
  private keyboardOpener: (() => void) | null = null;

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

  /** Type one key from any keyboard; returns whether it did anything. */
  typeKey(stroke: KeyStroke): boolean {
    return this.keyHandler?.(stroke) ?? false;
  }

  setKeyHandler(handler: ((stroke: KeyStroke) => boolean) | null): void {
    this.keyHandler = handler;
  }

  /** Bring the headset's keyboard up again (after it was closed), typing where the caret is. */
  showKeyboard(): void {
    this.keyboardOpener?.();
  }

  setKeyboardOpener(opener: (() => void) | null): void {
    this.keyboardOpener = opener;
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
