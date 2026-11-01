/**
 * Undo and redo for one page's strokes.
 *
 * Every change to a page's ink is an edit that can be applied and
 * reversed: strokes added (writing), strokes removed (erasing), and strokes
 * replaced by changed copies (moving a lasso selection). Undo reverses the
 * newest edit; redo applies it again; a new edit after an undo clears what
 * could be redone, as in every editor.
 *
 * Pure data (no IWSDK or storage); NoteSession owns one per open note.
 */

import type { Page, Stroke } from './note-model.js';

/** One reversible change to a page's strokes. */
export type StrokeEdit =
  | { kind: 'add'; stroke: Stroke }
  /** Removed strokes, with where each sat in the page's order (so undo restores the layering). */
  | { kind: 'remove'; removed: Array<{ stroke: Stroke; index: number }> }
  /** Strokes swapped for changed copies with the same ids (a move). */
  | { kind: 'replace'; before: Stroke[]; after: Stroke[] };

/** Enough for a lesson's worth of slips, without holding every stroke forever. */
const MAX_EDITS = 200;

export class StrokeHistory {
  private undoable: StrokeEdit[] = [];
  private redoable: StrokeEdit[] = [];

  get canUndo(): boolean {
    return this.undoable.length > 0;
  }

  get canRedo(): boolean {
    return this.redoable.length > 0;
  }

  /** Remember an edit that has just been applied to the page. */
  record(edit: StrokeEdit): void {
    this.undoable.push(edit);
    if (this.undoable.length > MAX_EDITS) this.undoable.shift();
    this.redoable = [];
  }

  /** Reverse the newest edit on `page`; false when there is nothing to undo. */
  undo(page: Page): boolean {
    const edit = this.undoable.pop();
    if (!edit) return false;
    revert(page, edit);
    this.redoable.push(edit);
    return true;
  }

  /** Apply the most recently undone edit again; false when there is nothing to redo. */
  redo(page: Page): boolean {
    const edit = this.redoable.pop();
    if (!edit) return false;
    apply(page, edit);
    this.undoable.push(edit);
    return true;
  }

  clear(): void {
    this.undoable = [];
    this.redoable = [];
  }
}

/** Remove strokes from `page` by id, returning each with its former index (in page order). */
export function removeStrokes(page: Page, ids: ReadonlySet<string>): Array<{ stroke: Stroke; index: number }> {
  const removed: Array<{ stroke: Stroke; index: number }> = [];
  page.strokes.forEach((stroke, index) => {
    if (ids.has(stroke.id)) removed.push({ stroke, index });
  });
  page.strokes = page.strokes.filter((stroke) => !ids.has(stroke.id));
  return removed;
}

/** Put each stroke in `page` in place of the one with the same id. */
export function replaceStrokes(page: Page, strokes: readonly Stroke[]): void {
  const byId = new Map(strokes.map((stroke) => [stroke.id, stroke]));
  page.strokes = page.strokes.map((stroke) => byId.get(stroke.id) ?? stroke);
}

function apply(page: Page, edit: StrokeEdit): void {
  switch (edit.kind) {
    case 'add':
      page.strokes.push(edit.stroke);
      break;
    case 'remove':
      removeStrokes(page, new Set(edit.removed.map((r) => r.stroke.id)));
      break;
    case 'replace':
      replaceStrokes(page, edit.after);
      break;
  }
}

function revert(page: Page, edit: StrokeEdit): void {
  switch (edit.kind) {
    case 'add':
      page.strokes = page.strokes.filter((stroke) => stroke.id !== edit.stroke.id);
      break;
    case 'remove':
      // Back in their old places, lowest index first, so later indices stay right.
      for (const { stroke, index } of [...edit.removed].sort((a, b) => a.index - b.index)) {
        page.strokes.splice(Math.min(index, page.strokes.length), 0, stroke);
      }
      break;
    case 'replace':
      replaceStrokes(page, edit.before);
      break;
  }
}
