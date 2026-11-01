/**
 * Typed text on a page: text boxes ("frames") of rich text, typed on the
 * keyboard in typing mode.
 *
 * Like the ink, this is pure data in page coordinates (x 0..1 left to right,
 * y 0..1 top to bottom), so a page shows its text at any size: on the tablet
 * on the desk, or on the page floating in front of the viewer while typing.
 *
 * The shape follows what word processors keep (Google Docs, Word):
 * - A frame is a text box placed where the user chose to type (as in
 *   Excalidraw): its top-left corner and a width; it grows downward.
 * - A frame holds blocks (paragraphs). Each block has a kind (body text,
 *   a heading, a list item), an alignment and, for list items, a nesting
 *   level. A checklist item also has its tick.
 * - A block's text is a list of runs: pieces of text that share the same
 *   inline marks (bold, italic, underline, strikethrough). A soft line break
 *   inside a block is a '\n' character.
 *
 * No IWSDK, DOM or storage imports: the editor, layout and renderer depend
 * on these types, and they are saved with the note.
 */

import { createId } from './note-model.js';

/** What a block is: body text, a heading, or a list item. */
export type BlockKind = 'paragraph' | 'title' | 'heading' | 'subheading' | 'bullet' | 'numbered' | 'checklist' | 'quote';
export const BLOCK_KINDS: readonly BlockKind[] = [
  'paragraph',
  'title',
  'heading',
  'subheading',
  'bullet',
  'numbered',
  'checklist',
  'quote',
];
/** Block kinds that are list items (they nest and continue on Enter). */
export const LIST_KINDS: readonly BlockKind[] = ['bullet', 'numbered', 'checklist'];

export type TextAlign = 'left' | 'center' | 'right';
const ALIGNS: readonly TextAlign[] = ['left', 'center', 'right'];

/** Inline marks a run of text can carry. */
export type MarkName = 'bold' | 'italic' | 'underline' | 'strike';
export const MARK_NAMES: readonly MarkName[] = ['bold', 'italic', 'underline', 'strike'];
export type TextMarks = Partial<Record<MarkName, true>>;

export interface TextRun extends TextMarks {
  text: string;
}

export interface TextBlock {
  id: string;
  kind: BlockKind;
  runs: TextRun[];
  align: TextAlign;
  /** List nesting, 0 (top level) to MAX_INDENT. */
  indent: number;
  /** Checklist items only: ticked. */
  checked?: boolean;
}

export interface TextFrame {
  id: string;
  /** Top-left corner, in page coordinates. */
  x: number;
  y: number;
  /** Width, as a fraction of the page's width. */
  width: number;
  blocks: TextBlock[];
}

/** Deepest list nesting. */
export const MAX_INDENT = 4;
/** Longest text a block keeps (characters), so one runaway key cannot fill the store. */
export const MAX_BLOCK_CHARS = 4000;

export function createBlock(kind: BlockKind = 'paragraph', text = '', align: TextAlign = 'left'): TextBlock {
  return { id: createId(), kind, runs: text ? [{ text }] : [], align, indent: 0 };
}

export function createFrame(x: number, y: number, width: number): TextFrame {
  return { id: createId(), x, y, width, blocks: [createBlock()] };
}

/** The block's plain text (its runs joined). */
export function blockText(block: TextBlock): string {
  let text = '';
  for (const run of block.runs) text += run.text;
  return text;
}

export function blockLength(block: TextBlock): number {
  let length = 0;
  for (const run of block.runs) length += run.text.length;
  return length;
}

/** Whether a frame holds no text at all (one empty body block, or nothing). */
export function isFrameEmpty(frame: TextFrame): boolean {
  return frame.blocks.every((block) => blockLength(block) === 0 && LIST_KINDS.indexOf(block.kind) < 0);
}

export function sameMarks(a: TextMarks, b: TextMarks): boolean {
  for (const mark of MARK_NAMES) if (!a[mark] !== !b[mark]) return false;
  return true;
}

/** Just the marks of a run (or marks object), without its text. */
export function marksOf(source: TextMarks): TextMarks {
  const marks: TextMarks = {};
  for (const mark of MARK_NAMES) if (source[mark]) marks[mark] = true;
  return marks;
}

/** A deep copy of frames (for undo snapshots). */
export function cloneFrames(frames: readonly TextFrame[]): TextFrame[] {
  return frames.map((frame) => ({
    ...frame,
    blocks: frame.blocks.map((block) => ({ ...block, runs: block.runs.map((run) => ({ ...run })) })),
  }));
}

// ------------------------------------------------------------- validation

/** Validate stored frames; anything that cannot be trusted is dropped, never thrown. */
export function parseFrames(value: unknown): TextFrame[] {
  if (!Array.isArray(value)) return [];
  const frames: TextFrame[] = [];
  for (const raw of value as unknown[]) {
    const frame = parseFrame(raw);
    if (frame) frames.push(frame);
  }
  return frames;
}

function parseFrame(value: unknown): TextFrame | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !Array.isArray(raw.blocks)) return null;
  if (!isUnit(raw.x) || !isUnit(raw.y) || !isUnit(raw.width) || (raw.width as number) <= 0) return null;
  const blocks = (raw.blocks as unknown[]).map(parseBlock).filter((block): block is TextBlock => block !== null);
  if (blocks.length === 0) return null;
  return { id: raw.id, x: raw.x as number, y: raw.y as number, width: raw.width as number, blocks };
}

function parseBlock(value: unknown): TextBlock | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !Array.isArray(raw.runs)) return null;
  const runs: TextRun[] = [];
  for (const rawRun of raw.runs as unknown[]) {
    if (typeof rawRun !== 'object' || rawRun === null) continue;
    const run = rawRun as Record<string, unknown>;
    if (typeof run.text !== 'string' || run.text.length === 0) continue;
    runs.push({ text: run.text.slice(0, MAX_BLOCK_CHARS), ...marksOf(run as TextMarks) });
  }
  const block: TextBlock = {
    id: raw.id,
    kind: BLOCK_KINDS.includes(raw.kind as BlockKind) ? (raw.kind as BlockKind) : 'paragraph',
    runs,
    align: ALIGNS.includes(raw.align as TextAlign) ? (raw.align as TextAlign) : 'left',
    indent: typeof raw.indent === 'number' ? Math.max(0, Math.min(MAX_INDENT, Math.round(raw.indent))) : 0,
  };
  if (block.kind === 'checklist') block.checked = raw.checked === true;
  return block;
}

function isUnit(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
