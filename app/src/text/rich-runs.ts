/**
 * Edits on one block's runs (rich text pieces): insert, delete, split, and
 * set or clear an inline mark over a range.
 *
 * Offsets count characters across the block's runs. Every edit leaves the
 * runs normalised: no empty runs, and no two neighbours with the same marks
 * (they are merged), so equal text always has the same shape.
 *
 * Pure data, no IWSDK or DOM.
 */

import {
  blockLength,
  MAX_BLOCK_CHARS,
  marksOf,
  sameMarks,
  type MarkName,
  type TextBlock,
  type TextMarks,
  type TextRun,
} from '../notes/typed-text.js';

/** Merge neighbours with the same marks and drop empty runs (in place). */
export function normalizeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    const last = out[out.length - 1];
    if (last && sameMarks(last, run)) last.text += run.text;
    else out.push({ ...run });
  }
  runs.length = 0;
  runs.push(...out);
  return runs;
}

/**
 * Make sure a run boundary sits at `offset`, splitting the run across it.
 * Returns the index of the first run at or after `offset`.
 */
function splitAt(runs: TextRun[], offset: number): number {
  let at = 0;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (offset === at) return i;
    if (offset < at + run.text.length) {
      const cut = offset - at;
      runs.splice(i, 1, { ...run, text: run.text.slice(0, cut) }, { ...run, text: run.text.slice(cut) });
      return i + 1;
    }
    at += run.text.length;
  }
  return runs.length;
}

/**
 * The marks new text typed at `offset` takes: those of the character before
 * it (so typing continues the style it follows), or of the first character
 * at the start of a block.
 */
export function marksAt(block: TextBlock, offset: number): TextMarks {
  let at = 0;
  for (const run of block.runs) {
    const end = at + run.text.length;
    if (offset > at && offset <= end) return marksOf(run);
    at = end;
  }
  return block.runs[0] ? marksOf(block.runs[0]) : {};
}

/** Insert `text` with `marks` at `offset`. Returns how many characters went in (the block has a size limit). */
export function insertText(block: TextBlock, offset: number, text: string, marks: TextMarks): number {
  const room = MAX_BLOCK_CHARS - blockLength(block);
  const piece = text.slice(0, Math.max(0, room));
  if (piece.length === 0) return 0;
  const index = splitAt(block.runs, offset);
  block.runs.splice(index, 0, { text: piece, ...marksOf(marks) });
  normalizeRuns(block.runs);
  return piece.length;
}

/** Remove the characters in [start, end). */
export function deleteText(block: TextBlock, start: number, end: number): void {
  if (end <= start) return;
  const from = splitAt(block.runs, start);
  const to = splitAt(block.runs, end);
  block.runs.splice(from, to - from);
  normalizeRuns(block.runs);
}

/** A copy of the runs covering [start, end). */
export function sliceRuns(block: TextBlock, start: number, end: number): TextRun[] {
  const out: TextRun[] = [];
  let at = 0;
  for (const run of block.runs) {
    const runEnd = at + run.text.length;
    const from = Math.max(start, at);
    const to = Math.min(end, runEnd);
    if (to > from) out.push({ ...run, text: run.text.slice(from - at, to - at) });
    at = runEnd;
  }
  return out;
}

/** Whether every character in [start, end) carries `mark` (false for an empty range). */
export function rangeHasMark(block: TextBlock, start: number, end: number, mark: MarkName): boolean {
  if (end <= start) return false;
  return sliceRuns(block, start, end).every((run) => run[mark] === true);
}

/** Set (or clear) `mark` on the characters in [start, end). */
export function setMark(block: TextBlock, start: number, end: number, mark: MarkName, on: boolean): void {
  if (end <= start) return;
  const from = splitAt(block.runs, start);
  const to = splitAt(block.runs, end);
  for (let i = from; i < to; i++) {
    if (on) block.runs[i][mark] = true;
    else delete block.runs[i][mark];
  }
  normalizeRuns(block.runs);
}

/** Clear every mark on [start, end). */
export function clearMarks(block: TextBlock, start: number, end: number): void {
  for (const mark of ['bold', 'italic', 'underline', 'strike'] as const) setMark(block, start, end, mark, false);
}
