/**
 * TextEditor: typing into a page's text boxes, the way a word processor
 * behaves.
 *
 * It holds the caret (and the selection, from `anchor` to the caret) in one
 * text frame of the open page, and turns keys and toolbar buttons into
 * edits:
 * - Typing inserts text in the current style: the marks of the text it
 *   follows, or the ones switched on with the toolbar (Bold, Italic,
 *   Underline, Strikethrough) for what is typed next.
 * - Enter splits the paragraph; in a list it starts the next item, and on an
 *   empty item it leaves the list (as in Google Docs). Shift+Enter breaks the
 *   line inside the paragraph.
 * - Backspace at the start of a list item or heading first turns it back
 *   into body text, then joins it to the paragraph before.
 * - Tab and Shift+Tab nest and un-nest list items.
 * - Markdown shortcuts, as Google Docs' "Automatically detect Markdown":
 *   "- " or "* " starts a bullet list, "1. " a numbered list, "[] " a
 *   checklist, "# " to "### " headings, "> " a quote; **bold**, *italic*,
 *   _italic_ and ~~strikethrough~~ format the text between them. Undo right
 *   after a shortcut brings back the typed characters.
 * - Undo and redo cover every text edit; typing is grouped into words.
 *
 * Where the caret goes on a click, or on Up and Down, depends on how the
 * text is laid out, so those questions go to a CaretLocator (the layout,
 * text-layout.ts). Everything else is pure data.
 */

import {
  blockLength,
  blockText,
  cloneFrames,
  createBlock,
  createFrame,
  isFrameEmpty,
  LIST_KINDS,
  MAX_INDENT,
  type BlockKind,
  type MarkName,
  type TextAlign,
  type TextBlock,
  type TextFrame,
  type TextMarks,
} from '../notes/typed-text.js';
import type { Page } from '../notes/note-model.js';
import {
  clearMarks,
  deleteText,
  insertText,
  marksAt,
  normalizeRuns,
  rangeHasMark,
  setMark,
  sliceRuns,
} from './rich-runs.js';

/** A place between two characters of one block of the focused frame. */
export interface TextPosition {
  block: number;
  offset: number;
}

/** Layout questions the editor asks (answered by text-layout.ts). */
export interface CaretLocator {
  /** The frame under a page point, if any (its laid-out height counts). */
  frameAt(frames: readonly TextFrame[], x: number, y: number): TextFrame | null;
  /** The caret position nearest a page point inside `frame`. */
  positionAt(frame: TextFrame, x: number, y: number): TextPosition;
  /** One line up (-1) or down (+1) from `from`, keeping to `goalX` (page x); null at the first or last line. */
  lineMove(frame: TextFrame, from: TextPosition, direction: -1 | 1, goalX: number | null): { position: TextPosition; goalX: number } | null;
  /** The start or end of the line `from` is on. */
  lineEdge(frame: TextFrame, from: TextPosition, edge: 'start' | 'end'): TextPosition;
}

/** What changed: the text itself (re-render and save), or only the caret or selection. */
export type EditorChange = 'content' | 'caret';

/** The toolbar's state: the style at the caret or across the selection. */
export interface TextFormat {
  marks: Record<MarkName, boolean>;
  kind: BlockKind;
  align: TextAlign;
  indent: number;
  canUndo: boolean;
  canRedo: boolean;
}

export type CaretMove = 'left' | 'right' | 'up' | 'down' | 'line-start' | 'line-end' | 'word-left' | 'word-right' | 'start' | 'end';

/** Left margin new frames keep from the page's edges, and the narrowest frame (page widths). */
export const FRAME_MARGIN = 0.06;
export const MIN_FRAME_WIDTH = 0.3;
/** Typing within this long of the last keystroke is one undo step, until a space or a new line (ms). */
const TYPING_GROUP_MS = 1500;
const MAX_UNDO = 300;

interface Snapshot {
  frames: TextFrame[];
  frameId: string | null;
  caret: TextPosition;
  anchor: TextPosition | null;
}

/** Markdown at a block's start, typed before a space. */
const BLOCK_SHORTCUTS: ReadonlyArray<{ pattern: RegExp; kind: BlockKind; checked?: boolean }> = [
  { pattern: /^[-*+]$/, kind: 'bullet' },
  { pattern: /^\d{1,3}[.)]$/, kind: 'numbered' },
  { pattern: /^\[ ?\]$/, kind: 'checklist', checked: false },
  { pattern: /^\[[xX]\]$/, kind: 'checklist', checked: true },
  { pattern: /^#$/, kind: 'title' },
  { pattern: /^##$/, kind: 'heading' },
  { pattern: /^###$/, kind: 'subheading' },
  { pattern: /^>$/, kind: 'quote' },
];
/** Inline markdown, matched against the text just before the caret after its closing character is typed. */
const INLINE_SHORTCUTS: ReadonlyArray<{ pattern: RegExp; mark: MarkName; fence: number }> = [
  { pattern: /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, mark: 'bold', fence: 2 },
  { pattern: /~~([^~\s](?:[^~]*[^~\s])?)~~$/, mark: 'strike', fence: 2 },
  { pattern: /(?:^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*$/, mark: 'italic', fence: 1 },
  { pattern: /(?:^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, mark: 'italic', fence: 1 },
];

export class TextEditor {
  /** The page being typed on, or null while no note is open. */
  private page: Page | null = null;
  private frameId: string | null = null;
  /** The caret, and the selection's other end (null: no selection). */
  caret: TextPosition = { block: 0, offset: 0 };
  anchor: TextPosition | null = null;
  /** Marks switched on or off from the toolbar for the next typing, or null to follow the text. */
  private pending: TextMarks | null = null;
  /** The x the caret keeps to across Up and Down (page coordinates). */
  private goalX: number | null = null;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  /** The kind of the edit last checkpointed, and when, to group typing. */
  private lastEdit: { kind: string; at: number } | null = null;
  private readonly listeners = new Set<(change: EditorChange) => void>();

  constructor(
    private readonly locator: CaretLocator,
    /** The clock (ms), injectable for tests. */
    private readonly now: () => number = () => performance.now(),
  ) {}

  // ---------------------------------------------------------------- state

  /** Type on `page` (a newly opened note), or nothing. Clears the caret and the history. */
  setPage(page: Page | null): void {
    this.page = page;
    this.frameId = null;
    this.anchor = null;
    this.pending = null;
    this.undoStack = [];
    this.redoStack = [];
    this.lastEdit = null;
    this.emit('caret');
  }

  get frames(): readonly TextFrame[] {
    return this.page?.frames ?? [];
  }

  /** The frame with the caret, or null while not typing. */
  get frame(): TextFrame | null {
    if (!this.frameId) return null;
    return this.frames.find((frame) => frame.id === this.frameId) ?? null;
  }

  get hasSelection(): boolean {
    return this.anchor !== null && comparePositions(this.anchor, this.caret) !== 0;
  }

  /** The selection's start and end, in order (both the caret when nothing is selected). */
  get range(): { start: TextPosition; end: TextPosition } {
    const anchor = this.anchor ?? this.caret;
    return comparePositions(anchor, this.caret) <= 0
      ? { start: anchor, end: this.caret }
      : { start: this.caret, end: anchor };
  }

  subscribe(listener: (change: EditorChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------- caret placing

  /**
   * Start typing at a page point: in the frame there, or in a new frame
   * whose top-left corner is the point (kept inside the page's margins).
   */
  typeAt(x: number, y: number, extend = false): void {
    if (!this.page) return;
    const hit = this.locator.frameAt(this.frames, x, y);
    if (hit) {
      const position = this.locator.positionAt(hit, x, y);
      if (extend && hit.id === this.frameId) this.anchor ??= { ...this.caret };
      else this.focusFrame(hit);
      this.caret = position;
      if (!extend) this.anchor = null;
      this.afterCaretMove();
      return;
    }
    const left = Math.min(Math.max(x, FRAME_MARGIN), 1 - FRAME_MARGIN - MIN_FRAME_WIDTH);
    const top = Math.min(Math.max(y, FRAME_MARGIN * 0.5), 0.95);
    this.newFrame(left, top, 1 - FRAME_MARGIN - left);
  }

  /** Start typing in a new, empty frame (`x`, `y`: its top-left corner; `width` in page widths). */
  newFrame(x: number, y: number, width: number): void {
    const page = this.page;
    if (!page) return;
    this.dropEmptyFrame();
    const frame = createFrame(x, y, width);
    (page.frames ??= []).push(frame);
    this.frameId = frame.id;
    this.caret = { block: 0, offset: 0 };
    this.anchor = null;
    this.pending = null;
    this.goalX = null;
    // An empty frame is not an edit until something is typed in it.
    this.emit('content');
  }

  /** Put the caret at the end of `frame`. */
  focusEnd(frame: TextFrame): void {
    this.focusFrame(frame);
    const last = frame.blocks.length - 1;
    this.caret = { block: last, offset: blockLength(frame.blocks[last]) };
    this.anchor = null;
    this.afterCaretMove();
  }

  /** Select from the drag's start (the anchor) to a page point in the same frame. */
  dragTo(x: number, y: number): void {
    const frame = this.frame;
    if (!frame) return;
    this.anchor ??= { ...this.caret };
    this.caret = this.locator.positionAt(frame, x, y);
    this.afterCaretMove();
  }

  /** Stop typing: the caret goes, and a frame left empty is removed. */
  blur(): void {
    if (!this.frameId) return;
    this.dropEmptyFrame();
    this.frameId = null;
    this.anchor = null;
    this.pending = null;
    this.emit('caret');
  }

  selectAll(): void {
    const frame = this.frame;
    if (!frame) return;
    const last = frame.blocks.length - 1;
    this.anchor = { block: 0, offset: 0 };
    this.caret = { block: last, offset: blockLength(frame.blocks[last]) };
    this.afterCaretMove();
  }

  /** Select the word around `at` (a double tap). */
  selectWord(at: TextPosition): void {
    const block = this.frame?.blocks[at.block];
    if (!block) return;
    const text = blockText(block);
    let start = at.offset;
    let end = at.offset;
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;
    this.anchor = { block: at.block, offset: start };
    this.caret = { block: at.block, offset: end };
    this.afterCaretMove();
  }

  /** Move the caret; with `extend` (Shift held) the selection grows instead. */
  move(direction: CaretMove, extend = false): void {
    const frame = this.frame;
    if (!frame) return;
    if (extend) this.anchor ??= { ...this.caret };
    else if (this.hasSelection && (direction === 'left' || direction === 'right')) {
      // An arrow with text selected goes to that end of the selection.
      const { start, end } = this.range;
      this.caret = { ...(direction === 'left' ? start : end) };
      this.anchor = null;
      this.afterCaretMove();
      return;
    }
    const keepGoal = direction === 'up' || direction === 'down';
    const next = this.positionAfterMove(frame, direction);
    if (next) this.caret = next;
    if (!extend) this.anchor = null;
    this.afterCaretMove(keepGoal);
  }

  private positionAfterMove(frame: TextFrame, direction: CaretMove): TextPosition | null {
    const { block, offset } = this.caret;
    const blocks = frame.blocks;
    const text = blockText(blocks[block]);
    switch (direction) {
      case 'left':
        if (offset > 0) return { block, offset: offset - 1 };
        return block > 0 ? { block: block - 1, offset: blockLength(blocks[block - 1]) } : null;
      case 'right':
        if (offset < text.length) return { block, offset: offset + 1 };
        return block < blocks.length - 1 ? { block: block + 1, offset: 0 } : null;
      case 'word-left': {
        if (offset === 0) return block > 0 ? { block: block - 1, offset: blockLength(blocks[block - 1]) } : null;
        let at = offset;
        while (at > 0 && !isWordChar(text[at - 1])) at--;
        while (at > 0 && isWordChar(text[at - 1])) at--;
        return { block, offset: at };
      }
      case 'word-right': {
        if (offset === text.length) return block < blocks.length - 1 ? { block: block + 1, offset: 0 } : null;
        let at = offset;
        while (at < text.length && !isWordChar(text[at])) at++;
        while (at < text.length && isWordChar(text[at])) at++;
        return { block, offset: at };
      }
      case 'up':
      case 'down': {
        const moved = this.locator.lineMove(frame, this.caret, direction === 'up' ? -1 : 1, this.goalX);
        if (!moved) return direction === 'up' ? { block: 0, offset: 0 } : this.endOf(frame);
        this.goalX = moved.goalX;
        return moved.position;
      }
      case 'line-start':
        return this.locator.lineEdge(frame, this.caret, 'start');
      case 'line-end':
        return this.locator.lineEdge(frame, this.caret, 'end');
      case 'start':
        return { block: 0, offset: 0 };
      case 'end':
        return this.endOf(frame);
    }
  }

  // ------------------------------------------------------------- typing

  /** Type `text` at the caret, replacing any selection. */
  type(text: string): void {
    const frame = this.frame;
    if (!frame || text.length === 0) return;
    const grouping = text !== ' ' && text !== '\n' && !this.hasSelection;
    this.checkpoint(grouping ? 'type' : 'type-break');
    this.deleteSelection(frame);
    const block = frame.blocks[this.caret.block];
    const marks = this.pending ?? marksAt(block, this.caret.offset);
    const inserted = insertText(block, this.caret.offset, text, marks);
    this.caret = { block: this.caret.block, offset: this.caret.offset + inserted };
    this.anchor = null;
    this.goalX = null;
    this.changed();
    if (text === ' ') this.blockShortcut(frame);
    else if (text.length === 1 && '*_~'.includes(text)) this.inlineShortcut(frame);
  }

  /** Enter: a new paragraph or list item; on an empty list item, leave the list. */
  enter(): void {
    const frame = this.frame;
    if (!frame) return;
    this.checkpoint('enter');
    this.deleteSelection(frame);
    const { block: index, offset } = this.caret;
    const block = frame.blocks[index];
    const isList = LIST_KINDS.includes(block.kind);
    if (blockLength(block) === 0 && (isList || block.kind === 'quote')) {
      if (block.indent > 0) block.indent--;
      else block.kind = 'paragraph';
      delete block.checked;
      this.changed();
      return;
    }
    const tail = sliceRuns(block, offset, blockLength(block));
    deleteText(block, offset, blockLength(block));
    const atEnd = tail.length === 0;
    // Headings are followed by body text; lists and quotes go on.
    const headingLike = block.kind === 'title' || block.kind === 'heading' || block.kind === 'subheading';
    const next = createBlock(headingLike && atEnd ? 'paragraph' : block.kind, '', block.align);
    next.runs = normalizeRuns(tail);
    next.indent = block.indent;
    if (next.kind === 'checklist') next.checked = false;
    frame.blocks.splice(index + 1, 0, next);
    this.caret = { block: index + 1, offset: 0 };
    this.changed();
  }

  /** Shift+Enter: a line break inside the paragraph. */
  lineBreak(): void {
    this.type('\n');
  }

  /** Backspace (`word`: a whole word, as with Ctrl or Alt held). */
  backspace(word = false): void {
    const frame = this.frame;
    if (!frame) return;
    this.checkpoint('delete');
    if (this.deleteSelection(frame)) {
      this.changed();
      return;
    }
    const { block: index, offset } = this.caret;
    const block = frame.blocks[index];
    if (offset > 0) {
      const from = word ? this.wordStart(block, offset) : offset - 1;
      deleteText(block, from, offset);
      this.caret = { block: index, offset: from };
      this.changed();
      return;
    }
    // At the start of a block: first undo its list or heading style, then join.
    if (block.kind !== 'paragraph') {
      if (LIST_KINDS.includes(block.kind) && block.indent > 0) block.indent--;
      else {
        block.kind = 'paragraph';
        delete block.checked;
      }
      this.changed();
      return;
    }
    if (block.indent > 0) {
      block.indent--;
      this.changed();
      return;
    }
    if (index === 0) return;
    const previous = frame.blocks[index - 1];
    const join = blockLength(previous);
    previous.runs.push(...block.runs);
    normalizeRuns(previous.runs);
    frame.blocks.splice(index, 1);
    this.caret = { block: index - 1, offset: join };
    this.changed();
  }

  /** Delete (forward). */
  deleteForward(): void {
    const frame = this.frame;
    if (!frame) return;
    this.checkpoint('delete');
    if (this.deleteSelection(frame)) {
      this.changed();
      return;
    }
    const { block: index, offset } = this.caret;
    const block = frame.blocks[index];
    if (offset < blockLength(block)) {
      deleteText(block, offset, offset + 1);
    } else if (index < frame.blocks.length - 1) {
      block.runs.push(...frame.blocks[index + 1].runs);
      normalizeRuns(block.runs);
      frame.blocks.splice(index + 1, 1);
    } else return;
    this.changed();
  }

  /** Tab (+1) and Shift+Tab (-1): nest or un-nest the selected paragraphs. */
  indent(delta: 1 | -1): void {
    const frame = this.frame;
    if (!frame) return;
    this.checkpoint('format');
    for (const block of this.selectedBlocks(frame)) {
      block.indent = Math.max(0, Math.min(MAX_INDENT, block.indent + delta));
    }
    this.changed();
  }

  // ------------------------------------------------------------ formatting

  /** Bold, Italic, Underline or Strikethrough: over the selection, or for what is typed next. */
  toggleMark(mark: MarkName): void {
    const frame = this.frame;
    if (!frame) return;
    if (!this.hasSelection) {
      const block = frame.blocks[this.caret.block];
      const marks = { ...(this.pending ?? marksAt(block, this.caret.offset)) };
      if (marks[mark]) delete marks[mark];
      else marks[mark] = true;
      this.pending = marks;
      this.emit('caret');
      return;
    }
    this.checkpoint('format');
    const pieces = this.selectedPieces(frame);
    const on = !pieces.every(({ block, start, end }) => end <= start || rangeHasMark(block, start, end, mark));
    for (const { block, start, end } of pieces) setMark(block, start, end, mark, on);
    this.changed();
  }

  /**
   * Set the selected paragraphs' kind (Normal text, a heading, a list,
   * a quote). Picking a list or quote the paragraphs already are turns them
   * back into body text, as the list buttons in Docs do.
   */
  setKind(kind: BlockKind): void {
    const frame = this.frame;
    if (!frame) return;
    this.checkpoint('format');
    const blocks = this.selectedBlocks(frame);
    const toggles = LIST_KINDS.includes(kind) || kind === 'quote';
    const target = toggles && blocks.every((block) => block.kind === kind) ? 'paragraph' : kind;
    for (const block of blocks) {
      block.kind = target;
      if (target === 'checklist') block.checked ??= false;
      else delete block.checked;
    }
    this.changed();
  }

  setAlign(align: TextAlign): void {
    const frame = this.frame;
    if (!frame) return;
    this.checkpoint('format');
    for (const block of this.selectedBlocks(frame)) block.align = align;
    this.changed();
  }

  /** Tick or untick a checklist item (a tap on its box), in any frame. */
  toggleChecked(frameId: string, blockIndex: number): void {
    const frame = this.frames.find((candidate) => candidate.id === frameId);
    const block = frame?.blocks[blockIndex];
    if (!block || block.kind !== 'checklist') return;
    this.checkpoint('format');
    block.checked = !block.checked;
    this.changed();
  }

  /** Back to plain body text: marks off, and the paragraphs made Normal text. */
  clearFormatting(): void {
    const frame = this.frame;
    if (!frame) return;
    this.checkpoint('format');
    for (const { block, start, end } of this.selectedPieces(frame)) clearMarks(block, start, end);
    for (const block of this.selectedBlocks(frame)) {
      block.kind = 'paragraph';
      block.indent = 0;
      delete block.checked;
    }
    this.pending = {};
    this.changed();
  }

  /** The style at the caret, or shared by the whole selection: what the toolbar shows as on. */
  format(): TextFormat {
    const frame = this.frame;
    const block = frame?.blocks[this.caret.block];
    const marks = { bold: false, italic: false, underline: false, strike: false };
    if (frame && block) {
      if (this.hasSelection) {
        const pieces = this.selectedPieces(frame).filter(({ start, end }) => end > start);
        for (const mark of ['bold', 'italic', 'underline', 'strike'] as const) {
          marks[mark] = pieces.length > 0 && pieces.every(({ block: b, start, end }) => rangeHasMark(b, start, end, mark));
        }
      } else {
        const at = this.pending ?? marksAt(block, this.caret.offset);
        for (const mark of ['bold', 'italic', 'underline', 'strike'] as const) marks[mark] = at[mark] === true;
      }
    }
    return {
      marks,
      kind: block?.kind ?? 'paragraph',
      align: block?.align ?? 'left',
      indent: block?.indent ?? 0,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
  }

  // ----------------------------------------------------------- undo, redo

  undo(): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    this.redoStack.push(this.snapshot());
    this.restore(snapshot);
    return true;
  }

  redo(): boolean {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return false;
    this.undoStack.push(this.snapshot());
    this.restore(snapshot);
    return true;
  }

  // ---------------------------------------------------------------- private

  /** Remember the text before an edit; typing in a row is one step. */
  private checkpoint(kind: string): void {
    const now = this.now();
    const last = this.lastEdit;
    this.lastEdit = { kind, at: now };
    // A space starts a new step, which the word typed after it joins: undo takes back a word at a time.
    const typing = last?.kind === 'type' || last?.kind === 'type-break';
    if (kind === 'type' && typing && now - last.at < TYPING_GROUP_MS) return;
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  private snapshot(): Snapshot {
    return {
      frames: cloneFrames(this.frames),
      frameId: this.frameId,
      caret: { ...this.caret },
      anchor: this.anchor ? { ...this.anchor } : null,
    };
  }

  private restore(snapshot: Snapshot): void {
    if (!this.page) return;
    this.page.frames = cloneFrames(snapshot.frames);
    this.frameId = snapshot.frameId;
    this.caret = { ...snapshot.caret };
    this.anchor = snapshot.anchor ? { ...snapshot.anchor } : null;
    this.pending = null;
    this.lastEdit = null;
    // A restored caret may point past an emptied frame's end.
    const frame = this.frame;
    if (frame) this.caret = clampPosition(frame, this.caret);
    else this.frameId = null;
    this.emit('content');
  }

  private changed(): void {
    this.pending = null;
    this.emit('content');
  }

  private emit(change: EditorChange): void {
    for (const listener of this.listeners) listener(change);
  }

  private afterCaretMove(keepGoal = false): void {
    this.pending = null;
    if (!keepGoal) this.goalX = null;
    this.lastEdit = null;
    this.emit('caret');
  }

  private focusFrame(frame: TextFrame): void {
    if (frame.id === this.frameId) return;
    this.dropEmptyFrame(frame);
    this.frameId = frame.id;
  }

  /** Remove the focused frame if nothing was typed in it (`keep`: a frame never to remove). */
  private dropEmptyFrame(keep?: TextFrame): void {
    const page = this.page;
    const frame = this.frame;
    if (!page?.frames || !frame || frame === keep || !isFrameEmpty(frame)) return;
    page.frames.splice(page.frames.indexOf(frame), 1);
    this.frameId = null;
    this.emit('content');
  }

  private endOf(frame: TextFrame): TextPosition {
    const last = frame.blocks.length - 1;
    return { block: last, offset: blockLength(frame.blocks[last]) };
  }

  private wordStart(block: TextBlock, offset: number): number {
    const text = blockText(block);
    let at = offset;
    while (at > 0 && !isWordChar(text[at - 1])) at--;
    while (at > 0 && isWordChar(text[at - 1])) at--;
    return at;
  }

  /** Delete the selected text; false when nothing was selected. */
  private deleteSelection(frame: TextFrame): boolean {
    if (!this.hasSelection) {
      this.anchor = null;
      return false;
    }
    const { start, end } = this.range;
    const first = frame.blocks[start.block];
    if (start.block === end.block) {
      deleteText(first, start.offset, end.offset);
    } else {
      const last = frame.blocks[end.block];
      const tail = sliceRuns(last, end.offset, blockLength(last));
      deleteText(first, start.offset, blockLength(first));
      first.runs.push(...tail);
      normalizeRuns(first.runs);
      frame.blocks.splice(start.block + 1, end.block - start.block);
    }
    this.caret = { ...start };
    this.anchor = null;
    return true;
  }

  /** The blocks the selection touches (or the caret's block). */
  private selectedBlocks(frame: TextFrame): TextBlock[] {
    const { start, end } = this.range;
    return frame.blocks.slice(start.block, end.block + 1);
  }

  /** The selection, cut into one character range per block. */
  private selectedPieces(frame: TextFrame): Array<{ block: TextBlock; start: number; end: number }> {
    const { start, end } = this.range;
    const pieces: Array<{ block: TextBlock; start: number; end: number }> = [];
    for (let i = start.block; i <= end.block; i++) {
      const block = frame.blocks[i];
      pieces.push({
        block,
        start: i === start.block ? start.offset : 0,
        end: i === end.block ? end.offset : blockLength(block),
      });
    }
    return pieces;
  }

  /** "- " and friends at the start of a paragraph: make it that kind of block. */
  private blockShortcut(frame: TextFrame): void {
    const block = frame.blocks[this.caret.block];
    if (block.kind !== 'paragraph' && block.kind !== 'quote') return;
    const prefix = blockText(block).slice(0, this.caret.offset - 1);
    const shortcut = BLOCK_SHORTCUTS.find(({ pattern }) => pattern.test(prefix));
    if (!shortcut) return;
    this.checkpoint('format');
    deleteText(block, 0, this.caret.offset);
    block.kind = shortcut.kind;
    if (shortcut.checked !== undefined) block.checked = shortcut.checked;
    this.caret = { block: this.caret.block, offset: 0 };
    this.changed();
  }

  /** **bold**, *italic*, _italic_, ~~strike~~ just typed: format the text between the fences. */
  private inlineShortcut(frame: TextFrame): void {
    const block = frame.blocks[this.caret.block];
    const before = blockText(block).slice(0, this.caret.offset);
    for (const { pattern, mark, fence } of INLINE_SHORTCUTS) {
      const match = pattern.exec(before);
      if (!match) continue;
      const inner = match[1];
      const end = this.caret.offset;
      const innerStart = end - fence - inner.length;
      this.checkpoint('format');
      // Closing fence first, so the opening fence's offset stays right.
      deleteText(block, end - fence, end);
      deleteText(block, innerStart - fence, innerStart);
      setMark(block, innerStart - fence, innerStart - fence + inner.length, mark, true);
      this.caret = { block: this.caret.block, offset: end - fence * 2 };
      // What is typed next is plain again, as in Docs.
      this.changed();
      const marks = { ...marksAt(block, this.caret.offset) };
      delete marks[mark];
      this.pending = marks;
      return;
    }
  }
}

export function comparePositions(a: TextPosition, b: TextPosition): number {
  return a.block !== b.block ? a.block - b.block : a.offset - b.offset;
}

function clampPosition(frame: TextFrame, position: TextPosition): TextPosition {
  const block = Math.min(position.block, frame.blocks.length - 1);
  return { block, offset: Math.min(position.offset, blockLength(frame.blocks[block])) };
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}'’]/u.test(char);
}
