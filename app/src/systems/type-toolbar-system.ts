/**
 * TypeToolbarSystem: the formatting toolbar under the floating page.
 *
 * Laid out like Google Docs' toolbar, after a keyboard button that brings
 * the headset's keyboard back once it was closed: undo and redo; Normal text and three
 * heading sizes; bold, italic, underline and strikethrough; bulleted,
 * numbered and checklists and a quote; indent; alignment; clear formatting.
 * Each button runs its TextEditor command at the caret or over the
 * selection, and lights up (a warm-white fill) while what it sets is on
 * there, as Docs' buttons do: so the toolbar always shows the style being
 * typed. Undo and redo dim when there is nothing to undo or redo.
 *
 * The buttons are pressed with a hand's ray (pinch) or a poke.
 */

import { createSystem, type UIKitMLAsset } from '@iwsdk/core';
import type { BlockKind, MarkName, TextAlign } from '../notes/typed-text.js';
import type { TextEditor, TextFormat } from '../text/text-editor.js';
import { addToggleStateColors, PanelBinding } from '../ui/panel-helpers.js';
import { addPressMotion } from '../ui/press-motion.js';
import { getTweens } from '../ui/tweens.js';
import { getTyping, type TypingState } from '../ui/typing-state.js';
import { playUiSound } from '../ui/ui-sounds.js';

const TOOLBAR_NODE = 'type-toolbar';
/** An unavailable button's icon (nothing to undo, no caret). */
const ICON_DIM = 'rgba(247, 242, 234, 0.32)';

/** One toolbar button: its element id, what it does, and when it shows as on. */
interface ToolButton {
  id: string;
  run(editor: TextEditor, typing: TypingState): void;
  /** Works with no caret too (the keyboard button). */
  always?: boolean;
  isOn?(format: TextFormat): boolean;
  /** Whether it can do anything now (default: while there is a caret). */
  enabled?(format: TextFormat): boolean;
}

const mark = (name: MarkName): ToolButton => ({
  id: `tool-${name}`,
  run: (editor) => editor.toggleMark(name),
  isOn: (format) => format.marks[name],
});
const kind = (name: BlockKind): ToolButton => ({
  id: `tool-${name}`,
  run: (editor) => editor.setKind(name),
  isOn: (format) => format.kind === name,
});
const align = (name: TextAlign): ToolButton => ({
  id: `tool-align-${name}`,
  run: (editor) => editor.setAlign(name),
  isOn: (format) => format.align === name,
});

/** Every button, in toolbar order (ids match type-toolbar.uikitml). */
const BUTTONS: readonly ToolButton[] = [
  { id: 'tool-keyboard', run: (_editor, typing) => typing.showKeyboard(), always: true },
  { id: 'tool-undo', run: (editor) => editor.undo(), enabled: (format) => format.canUndo },
  { id: 'tool-redo', run: (editor) => editor.redo(), enabled: (format) => format.canRedo },
  kind('paragraph'),
  kind('title'),
  kind('heading'),
  kind('subheading'),
  mark('bold'),
  mark('italic'),
  mark('underline'),
  mark('strike'),
  kind('bullet'),
  kind('numbered'),
  kind('checklist'),
  kind('quote'),
  { id: 'tool-outdent', run: (editor) => editor.indent(-1), enabled: (format) => format.indent > 0 },
  { id: 'tool-indent', run: (editor) => editor.indent(1) },
  align('left'),
  align('center'),
  align('right'),
  { id: 'tool-clear', run: (editor) => editor.clearFormatting() },
];

export class TypeToolbarSystem extends createSystem({}) {
  private typing!: TypingState;
  private readonly refreshers: Array<() => void> = [];

  init(): void {
    const toolbar = this.world.getSceneObject<UIKitMLAsset>(TOOLBAR_NODE);
    this.typing = getTyping(this.world);
    const editor = this.typing.editor;
    if (!toolbar || !editor) {
      console.warn('[TypeToolbarSystem] The type toolbar or the text editor is missing.');
      return;
    }
    const ui = new PanelBinding(toolbar, this.cleanupFuncs);
    const tweens = getTweens(this.world);
    for (const button of BUTTONS) {
      const element = ui.onClick(button.id, () => {
        if (!editor.frame && !button.always) return;
        playUiSound('press');
        button.run(editor, this.typing);
      });
      addPressMotion(element, tweens, this.cleanupFuncs, { hover: 1.08, pressed: 0.9 });
      const paint = addToggleStateColors(element, () => this.isOn(button), this.cleanupFuncs);
      this.refreshers.push(() => {
        paint();
        if (!this.isEnabled(button)) element.setProperties({ color: ICON_DIM });
      });
    }
    this.refresh();
    this.cleanupFuncs.push(
      editor.subscribe(() => this.refresh()),
      this.typing.subscribe(() => this.refresh()),
    );
  }

  private refresh(): void {
    for (const refresh of this.refreshers) refresh();
  }

  private isOn(button: ToolButton): boolean {
    const editor = this.typing.editor;
    if (!editor?.frame || !button.isOn) return false;
    return button.isOn(editor.format());
  }

  private isEnabled(button: ToolButton): boolean {
    const editor = this.typing.editor;
    if (button.always) return true;
    if (!editor?.frame) return false;
    return button.enabled ? button.enabled(editor.format()) : true;
  }
}
