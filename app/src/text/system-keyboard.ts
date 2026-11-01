/**
 * The headset's own keyboard (Meta Quest's system keyboard) for typing into
 * the page.
 *
 * Meta Quest Browser shows its system keyboard over a WebXR session when an
 * HTML text field in the page is focused (Browser 26.1 and later; see
 * https://developers.meta.com/horizon/documentation/web/webxr-keyboard/).
 * There are no key events to intercept: what is typed arrives as `input`
 * events on the field. So this keeps one hidden text field, focuses it to
 * bring the keyboard up, and turns each input event into an editor command
 * by its `inputType` (the standard InputEvent kinds: insertText,
 * insertLineBreak, deleteContentBackward, ...), never by reading the
 * field's whole value: the system keyboard starts every opening by
 * replacing the field's contents.
 *
 * Text being composed (suggestions, autocorrect) is shown as it changes:
 * the previous version is taken back and the new one typed. The keyboard
 * closes with its Done or hide key, or a tap outside it; the field then
 * loses focus (`onClosed`).
 *
 * On a computer the same field types too (a real keyboard's keydown events
 * are handled before they reach it; see TypingSystem).
 */

import type { TextEditor } from './text-editor.js';

/** Kept in the field so Backspace always has something to delete (and so fires an input event). */
const SENTINEL = '  ';

export class SystemKeyboard {
  private readonly field: HTMLTextAreaElement;
  /** The text being composed, already typed into the page (taken back if it changes). */
  private composing = '';
  private readonly listeners: Array<[string, EventListener]> = [];

  constructor(
    private readonly editor: TextEditor,
    /** Called when the keyboard closes (the field loses focus). */
    private readonly onClosed: () => void = () => {},
  ) {
    const field = document.createElement('textarea');
    field.setAttribute('aria-label', 'Note text');
    field.autocapitalize = 'sentences';
    field.spellcheck = true;
    // In view (an off-screen field makes the page scroll to it) but unseen.
    Object.assign(field.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      border: '0',
      padding: '0',
      resize: 'none',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(field);
    this.field = field;
    this.listen('input', (event) => this.onInput(event as InputEvent));
    this.listen('compositionend', () => this.endComposition());
    this.listen('blur', () => {
      this.composing = '';
      this.onClosed();
    });
    this.reset();
  }

  /** Whether the keyboard is up (its field has focus). */
  get open(): boolean {
    return document.activeElement === this.field;
  }

  /** Bring the system keyboard up (call from a user's tap or pinch). */
  show(): void {
    this.reset();
    this.field.focus({ preventScroll: true });
  }

  /** Put it away. */
  hide(): void {
    if (this.open) this.field.blur();
  }

  dispose(): void {
    for (const [type, listener] of this.listeners) this.field.removeEventListener(type, listener);
    this.field.remove();
  }

  // ---------------------------------------------------------------- private

  private listen(type: string, listener: EventListener): void {
    this.field.addEventListener(type, listener);
    this.listeners.push([type, listener]);
  }

  private onInput(event: InputEvent): void {
    const editor = this.editor;
    if (!editor.frame) {
      this.reset();
      return;
    }
    switch (event.inputType) {
      case 'insertText':
        if (event.data) this.typeText(event.data);
        break;
      case 'insertLineBreak':
      case 'insertParagraph':
        editor.enter();
        break;
      case 'deleteContentBackward':
        editor.backspace();
        break;
      case 'deleteWordBackward':
        editor.backspace(true);
        break;
      case 'deleteContentForward':
        editor.deleteForward();
        break;
      case 'insertCompositionText':
        this.compose(event.data ?? '');
        return; // The field holds the composition until it ends.
      case 'insertReplacementText':
      case 'insertFromPaste':
      default:
        // A suggestion or a paste: whatever text the event carries goes in.
        if (event.data) this.typeText(event.data);
        break;
    }
    if (!this.composing) this.reset();
  }

  /** Type text a character at a time (so list and Markdown shortcuts still work); a new line is Enter. */
  private typeText(text: string): void {
    for (const char of text) {
      if (char === '\n') this.editor.enter();
      else this.editor.type(char);
    }
  }

  /** The composition changed: take back what was typed of it and type the new version. */
  private compose(text: string): void {
    const previous = this.composing;
    let shared = 0;
    while (shared < previous.length && shared < text.length && previous[shared] === text[shared]) shared++;
    for (let i = shared; i < previous.length; i++) this.editor.backspace();
    this.typeText(text.slice(shared));
    this.composing = text;
  }

  private endComposition(): void {
    this.composing = '';
    this.reset();
  }

  /** Back to just the sentinel, caret at its end. */
  private reset(): void {
    this.field.value = SENTINEL;
    this.field.setSelectionRange(SENTINEL.length, SENTINEL.length);
  }
}
