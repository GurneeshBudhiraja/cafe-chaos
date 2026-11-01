/**
 * Keys to editor commands for a real keyboard (a Bluetooth keyboard paired
 * with the headset, or the computer's while testing). The headset's own
 * keyboard sends no key events; system-keyboard.ts handles its input.
 *
 * The shortcuts are Google Docs' where it has them: Ctrl+B, I, U; Ctrl+Z
 * and Ctrl+Y (or Ctrl+Shift+Z); Ctrl+Shift+7, 8, 9 for numbered, bulleted
 * and checklists; Ctrl+Alt+0 to 3 for Normal text and headings; Alt+Shift+5
 * for strikethrough; Ctrl+Shift+L, E, R to align; Ctrl+\ to clear
 * formatting. On a Mac, Cmd stands in for Ctrl.
 */

import type { TextEditor } from './text-editor.js';

/** One key press, as a KeyboardEvent describes it. */
export interface KeyStroke {
  /** KeyboardEvent.key: 'a', 'A', 'Enter', 'Backspace', 'ArrowLeft', ... */
  key: string;
  /** KeyboardEvent.code, for shortcuts that depend on the key, not the character ('Digit7'). */
  code?: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

/** Apply a key to the editor. Returns whether it was used (so the browser should not act on it too). */
export function applyKey(editor: TextEditor, stroke: KeyStroke): boolean {
  if (!editor.frame) return false;
  const { key, shift = false, ctrl = false, alt = false } = stroke;
  const code = stroke.code ?? '';
  if (ctrl) return applyShortcut(editor, key.toLowerCase(), code, shift, alt);
  if (alt && shift && code === 'Digit5') {
    editor.toggleMark('strike');
    return true;
  }
  switch (key) {
    case 'Enter':
      if (shift) editor.lineBreak();
      else editor.enter();
      return true;
    case 'Backspace':
      editor.backspace(alt);
      return true;
    case 'Delete':
      editor.deleteForward();
      return true;
    case 'Tab':
      editor.indent(shift ? -1 : 1);
      return true;
    case 'ArrowLeft':
      editor.move(alt ? 'word-left' : 'left', shift);
      return true;
    case 'ArrowRight':
      editor.move(alt ? 'word-right' : 'right', shift);
      return true;
    case 'ArrowUp':
      editor.move('up', shift);
      return true;
    case 'ArrowDown':
      editor.move('down', shift);
      return true;
    case 'Home':
      editor.move('line-start', shift);
      return true;
    case 'End':
      editor.move('line-end', shift);
      return true;
    case 'Escape':
      editor.blur();
      return true;
  }
  // A printable character (KeyboardEvent.key is one character for those).
  if ([...key].length === 1) {
    editor.type(key);
    return true;
  }
  return false;
}

function applyShortcut(editor: TextEditor, key: string, code: string, shift: boolean, alt: boolean): boolean {
  if (alt) {
    const headings: Record<string, Parameters<TextEditor['setKind']>[0]> = {
      Digit0: 'paragraph',
      Digit1: 'title',
      Digit2: 'heading',
      Digit3: 'subheading',
    };
    const kind = headings[code];
    if (!kind) return false;
    editor.setKind(kind);
    return true;
  }
  if (shift) {
    switch (code) {
      case 'Digit7':
        editor.setKind('numbered');
        return true;
      case 'Digit8':
        editor.setKind('bullet');
        return true;
      case 'Digit9':
        editor.setKind('checklist');
        return true;
      case 'KeyL':
        editor.setAlign('left');
        return true;
      case 'KeyE':
        editor.setAlign('center');
        return true;
      case 'KeyR':
        editor.setAlign('right');
        return true;
      case 'KeyZ':
        editor.redo();
        return true;
    }
  }
  switch (key) {
    case 'b':
      editor.toggleMark('bold');
      return true;
    case 'i':
      editor.toggleMark('italic');
      return true;
    case 'u':
      editor.toggleMark('underline');
      return true;
    case 'z':
      editor.undo();
      return true;
    case 'y':
      editor.redo();
      return true;
    case 'a':
      editor.selectAll();
      return true;
    case '\\':
      editor.clearFormatting();
      return true;
    case 'backspace':
      editor.backspace(true);
      return true;
    case 'arrowleft':
      editor.move('word-left', shift);
      return true;
    case 'arrowright':
      editor.move('word-right', shift);
      return true;
    case 'home':
      editor.move('start', shift);
      return true;
    case 'end':
      editor.move('end', shift);
      return true;
  }
  return false;
}
