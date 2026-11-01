/**
 * Text layout: where every line, list marker and character of the page's
 * text frames goes, and the reverse (which character is under a point).
 *
 * Layout runs in "page units": the page is PAGE_UNITS wide, whatever its
 * size in the room, so text keeps its place and wraps the same way on the
 * tablet and on the floating page. Text measurement is injected (a canvas
 * 2D context in the app, a fixed-width stand-in in tests).
 *
 * The typography follows a word processor's defaults: body text, three
 * heading sizes, a quote, and lists that nest (bullets change shape with
 * depth: • ◦ ▪; numbers go 1. a. i.). A line wraps at spaces, or inside a
 * word too long for the line.
 */

import { PAGE_ASPECT } from '../notes/note-model.js';
import {
  blockText,
  type BlockKind,
  type TextBlock,
  type TextFrame,
  type TextMarks,
} from '../notes/typed-text.js';
import type { CaretLocator, TextPosition } from './text-editor.js';

/** The page's width in layout units. */
export const PAGE_UNITS = 1000;
/** And its height. */
export const PAGE_UNITS_HEIGHT = PAGE_UNITS / PAGE_ASPECT;

/** Measures text in a CSS font (returns its advance width in the font's px, i.e. layout units). */
export type MeasureText = (font: string, text: string) => number;

export interface BlockStyle {
  size: number;
  weight: number;
  family: 'body' | 'heading' | 'serif';
  italic: boolean;
  /** Line height, times the size. */
  leading: number;
  /** Space above and below the block (units). */
  before: number;
  after: number;
  color: string;
}

/** CSS font families (registered by text-renderer.ts). */
export const FONT_FAMILIES: Record<BlockStyle['family'], string> = {
  body: 'NoteBody, sans-serif',
  heading: 'NoteHeading, sans-serif',
  serif: 'NoteSerif, serif',
};

export const INK_COLOR = '#22201d';
const MUTED_COLOR = '#6f685f';

/** Font sizes in page units (1000 across): body text is about 2.4% of the page's width. */
export const BLOCK_STYLES: Record<BlockKind, BlockStyle> = {
  paragraph: { size: 24, weight: 400, family: 'body', italic: false, leading: 1.42, before: 0, after: 7, color: INK_COLOR },
  title: { size: 48, weight: 700, family: 'heading', italic: false, leading: 1.18, before: 6, after: 10, color: INK_COLOR },
  heading: { size: 36, weight: 700, family: 'heading', italic: false, leading: 1.22, before: 6, after: 8, color: INK_COLOR },
  subheading: { size: 29, weight: 700, family: 'heading', italic: false, leading: 1.28, before: 4, after: 6, color: '#3b3732' },
  bullet: { size: 24, weight: 400, family: 'body', italic: false, leading: 1.42, before: 0, after: 3, color: INK_COLOR },
  numbered: { size: 24, weight: 400, family: 'body', italic: false, leading: 1.42, before: 0, after: 3, color: INK_COLOR },
  checklist: { size: 24, weight: 400, family: 'body', italic: false, leading: 1.42, before: 0, after: 3, color: INK_COLOR },
  quote: { size: 25, weight: 400, family: 'serif', italic: true, leading: 1.45, before: 2, after: 8, color: '#4a453f' },
};

/** Each nesting level steps in this far, and a list's text starts this far after its marker (units). */
export const INDENT_UNITS = 30;
export const MARKER_GUTTER_UNITS = 30;
/** A quote's bar sits in this gutter. */
const QUOTE_GUTTER_UNITS = 22;
const BULLETS = ['•', '◦', '▪'];

/** One piece of a line drawn in one font. */
export interface LinePiece {
  text: string;
  /** Left edge (frame units). */
  x: number;
  width: number;
  font: string;
  marks: TextMarks;
}

export interface LineLayout {
  /** Characters [start, end) of the block on this line. */
  start: number;
  end: number;
  top: number;
  height: number;
  baseline: number;
  pieces: LinePiece[];
  /** The caret's x at each offset from start to end (end - start + 1 values). */
  carets: number[];
}

export interface MarkerLayout {
  kind: 'bullet' | 'number' | 'check';
  text: string;
  /** For a checkbox: its square (frame units). */
  box?: { x: number; y: number; size: number };
  x: number;
  baseline: number;
  font: string;
  checked: boolean;
}

export interface BlockLayout {
  block: TextBlock;
  top: number;
  bottom: number;
  /** Where the text starts and its width (frame units). */
  left: number;
  width: number;
  style: BlockStyle;
  lines: LineLayout[];
  marker: MarkerLayout | null;
  /** A quote's bar. */
  quoteBar: boolean;
}

export interface FrameLayout {
  frame: TextFrame;
  /** Size in page units. */
  width: number;
  height: number;
  blocks: BlockLayout[];
}

/** A block's font for a run's marks. */
export function fontFor(style: BlockStyle, marks: TextMarks): string {
  const italic = style.italic || marks.italic ? 'italic ' : '';
  const weight = marks.bold ? 700 : style.weight;
  return `${italic}${weight} ${style.size}px ${FONT_FAMILIES[style.family]}`;
}

/** Characters on a line's ends that never count toward its width. */
function isBreakSpace(char: string): boolean {
  return char === ' ' || char === '\t';
}

export class TextLayout implements CaretLocator {
  /** Width of each character, by font: measuring one character at a time is what the caret needs. */
  private readonly widths = new Map<string, Map<string, number>>();
  private readonly cache = new WeakMap<TextFrame, { key: string; layout: FrameLayout }>();

  constructor(private readonly measure: MeasureText) {}

  /** Forget measured widths (after the fonts load). */
  resetMeasurements(): void {
    this.widths.clear();
  }

  // ---------------------------------------------------------------- layout

  /** Lay out a frame (cached until its content changes). */
  layoutFrame(frame: TextFrame): FrameLayout {
    const key = frameKey(frame);
    const cached = this.cache.get(frame);
    if (cached && cached.key === key) return cached.layout;
    const layout = this.computeFrame(frame);
    this.cache.set(frame, { key, layout });
    return layout;
  }

  private computeFrame(frame: TextFrame): FrameLayout {
    const width = frame.width * PAGE_UNITS;
    const blocks: BlockLayout[] = [];
    const counters: number[] = [];
    let y = 0;
    for (let i = 0; i < frame.blocks.length; i++) {
      const block = frame.blocks[i];
      const style = BLOCK_STYLES[block.kind];
      const label = this.listLabel(block, counters);
      const isList = label !== null;
      const indent = block.indent * INDENT_UNITS;
      const gutter = isList ? MARKER_GUTTER_UNITS : block.kind === 'quote' ? QUOTE_GUTTER_UNITS : 0;
      const left = indent + gutter;
      const textWidth = Math.max(40, width - left);
      const top = y + (i === 0 ? 0 : style.before);
      const lines = this.wrap(block, style, left, textWidth, top);
      const bottom = lines[lines.length - 1].top + lines[lines.length - 1].height;
      let marker: MarkerLayout | null = null;
      if (label !== null) {
        const first = lines[0];
        const font = fontFor(style, {});
        if (block.kind === 'checklist') {
          const size = style.size * 0.78;
          marker = {
            kind: 'check',
            text: '',
            box: { x: indent + 2, y: first.baseline - size * 0.92, size },
            x: indent,
            baseline: first.baseline,
            font,
            checked: block.checked === true,
          };
        } else {
          marker = {
            kind: block.kind === 'numbered' ? 'number' : 'bullet',
            text: label,
            x: indent + (block.kind === 'bullet' ? 6 : 0),
            baseline: first.baseline,
            font,
            checked: false,
          };
        }
      }
      blocks.push({
        block,
        top,
        bottom,
        left,
        width: textWidth,
        style: block.kind === 'checklist' && block.checked ? { ...style, color: MUTED_COLOR } : style,
        lines,
        marker,
        quoteBar: block.kind === 'quote',
      });
      y = bottom + style.after;
    }
    return { frame, width, height: y, blocks };
  }

  /** The list marker's text ("•", "3.", "b."), or null for a block that is not a list item. */
  private listLabel(block: TextBlock, counters: number[]): string | null {
    const level = block.indent;
    if (block.kind !== 'bullet' && block.kind !== 'numbered' && block.kind !== 'checklist') {
      counters.length = 0;
      return null;
    }
    // Deeper levels start again under a new item.
    counters.length = Math.min(counters.length, level + 1);
    if (block.kind !== 'numbered') {
      counters[level] = 0;
      return block.kind === 'bullet' ? BULLETS[level % BULLETS.length] : '';
    }
    counters[level] = (counters[level] ?? 0) + 1;
    return `${numberLabel(counters[level], level)}.`;
  }

  /** Break a block into lines `width` wide. */
  private wrap(block: TextBlock, style: BlockStyle, left: number, width: number, top: number): LineLayout[] {
    const text = blockText(block);
    // Each character's font and width.
    const fonts: string[] = [];
    const advance: number[] = [];
    const markList: TextMarks[] = [];
    for (const run of block.runs) {
      const font = fontFor(style, run);
      for (const char of run.text) {
        for (let k = 0; k < char.length; k++) {
          // A character outside the basic plane is two code units: its width goes on the first.
          fonts.push(font);
          markList.push(run);
          advance.push(k === 0 ? (char === '\n' ? 0 : this.charWidth(font, char)) : 0);
        }
      }
    }
    const lineHeight = style.size * style.leading;
    const lines: LineLayout[] = [];
    let start = 0;
    let lineTop = top;
    const pushLine = (end: number) => {
      lines.push(this.buildLine(text, fonts, advance, markList, start, end, left, width, lineTop, lineHeight, style, block.align));
      lineTop += lineHeight;
      start = end;
    };
    let x = 0;
    let lastBreak = -1;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\n') {
        pushLine(i + 1);
        x = 0;
        lastBreak = -1;
        continue;
      }
      if (isBreakSpace(char)) {
        x += advance[i];
        lastBreak = i + 1;
        continue;
      }
      if (x + advance[i] > width && i > start) {
        // Wrap at the last space, or inside a word that does not fit at all.
        const cut = lastBreak > start ? lastBreak : i;
        pushLine(cut);
        x = 0;
        for (let k = cut; k < i; k++) x += advance[k];
        lastBreak = -1;
      }
      x += advance[i];
    }
    pushLine(text.length);
    // An empty last line after a trailing line break is still a line (the caret goes there).
    return lines;
  }

  private buildLine(
    text: string,
    fonts: string[],
    advance: number[],
    markList: TextMarks[],
    start: number,
    end: number,
    left: number,
    width: number,
    top: number,
    height: number,
    style: BlockStyle,
    align: TextBlock['align'],
  ): LineLayout {
    // Trailing spaces and the line break do not count toward the width that aligns.
    let visibleEnd = end;
    while (visibleEnd > start && (isBreakSpace(text[visibleEnd - 1]) || text[visibleEnd - 1] === '\n')) visibleEnd--;
    let lineWidth = 0;
    for (let i = start; i < visibleEnd; i++) lineWidth += advance[i];
    const shift = align === 'center' ? (width - lineWidth) / 2 : align === 'right' ? width - lineWidth : 0;
    const x0 = left + Math.max(0, shift);
    const carets: number[] = [x0];
    const pieces: LinePiece[] = [];
    let x = x0;
    for (let i = start; i < end; i++) {
      const char = text[i];
      if (char !== '\n') {
        const last = pieces[pieces.length - 1];
        if (last && last.font === fonts[i] && last.marks === markList[i]) {
          last.text += char;
          last.width += advance[i];
        } else {
          pieces.push({ text: char, x, width: advance[i], font: fonts[i], marks: markList[i] });
        }
      }
      x += advance[i];
      carets.push(x);
    }
    // The baseline sits about 78% down a line box (half the leading above the text).
    const baseline = top + (height - style.size) / 2 + style.size * 0.8;
    return { start, end, top, height, baseline, pieces, carets };
  }

  private charWidth(font: string, char: string): number {
    let byFont = this.widths.get(font);
    if (!byFont) {
      byFont = new Map();
      this.widths.set(font, byFont);
    }
    let width = byFont.get(char);
    if (width === undefined) {
      width = this.measure(font, char);
      byFont.set(char, width);
    }
    return width;
  }

  // ------------------------------------------------------------ geometry

  /** The line the caret at `position` sits on, and its x (frame units). */
  caretAt(frame: TextFrame, position: TextPosition): { block: BlockLayout; line: LineLayout; x: number } | null {
    const block = this.layoutFrame(frame).blocks[position.block];
    if (!block) return null;
    const line = lineFor(block, position.offset);
    const x = line.carets[Math.min(position.offset - line.start, line.carets.length - 1)] ?? line.carets[0];
    return { block, line, x };
  }

  frameAt(frames: readonly TextFrame[], x: number, y: number): TextFrame | null {
    // The newest frame on top wins where frames overlap.
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];
      const layout = this.layoutFrame(frame);
      const u = (x - frame.x) * PAGE_UNITS;
      const v = (y - frame.y) * PAGE_UNITS_HEIGHT;
      // A little slack round the text box, so a tap just under its last line still lands in it.
      const slack = 14;
      if (u >= -slack && u <= layout.width + slack && v >= -slack && v <= Math.max(layout.height, 30) + slack) return frame;
    }
    return null;
  }

  positionAt(frame: TextFrame, x: number, y: number): TextPosition {
    const layout = this.layoutFrame(frame);
    const u = (x - frame.x) * PAGE_UNITS;
    const v = (y - frame.y) * PAGE_UNITS_HEIGHT;
    let best = 0;
    for (let i = 0; i < layout.blocks.length; i++) {
      if (v >= layout.blocks[i].top - BLOCK_STYLES[layout.blocks[i].block.kind].before) best = i;
    }
    const block = layout.blocks[best];
    let line = block.lines[0];
    for (const candidate of block.lines) if (v >= candidate.top) line = candidate;
    return { block: best, offset: offsetOnLine(block, line, u) };
  }

  /** The checklist box under a page point, if any: its frame and block index. */
  checkboxAt(frames: readonly TextFrame[], x: number, y: number): { frameId: string; block: number } | null {
    for (const frame of frames) {
      const layout = this.layoutFrame(frame);
      const u = (x - frame.x) * PAGE_UNITS;
      const v = (y - frame.y) * PAGE_UNITS_HEIGHT;
      for (let i = 0; i < layout.blocks.length; i++) {
        const box = layout.blocks[i].marker?.box;
        if (!box) continue;
        // Generous: fingertips are wider than the box.
        const pad = box.size * 0.45;
        if (u >= box.x - pad && u <= box.x + box.size + pad && v >= box.y - pad && v <= box.y + box.size + pad) {
          return { frameId: frame.id, block: i };
        }
      }
    }
    return null;
  }

  lineMove(frame: TextFrame, from: TextPosition, direction: -1 | 1, goalX: number | null): { position: TextPosition; goalX: number } | null {
    const layout = this.layoutFrame(frame);
    const here = this.caretAt(frame, from);
    if (!here) return null;
    const goal = goalX ?? frame.x + here.x / PAGE_UNITS;
    const lineIndex = here.block.lines.indexOf(here.line);
    let blockIndex = from.block;
    let target: LineLayout | undefined = here.block.lines[lineIndex + direction];
    if (!target) {
      blockIndex += direction;
      const next = layout.blocks[blockIndex];
      if (!next) return null;
      target = direction > 0 ? next.lines[0] : next.lines[next.lines.length - 1];
    }
    const block = layout.blocks[blockIndex];
    return { position: { block: blockIndex, offset: offsetOnLine(block, target, (goal - frame.x) * PAGE_UNITS) }, goalX: goal };
  }

  lineEdge(frame: TextFrame, from: TextPosition, edge: 'start' | 'end'): TextPosition {
    const here = this.caretAt(frame, from);
    if (!here) return from;
    return { block: from.block, offset: edge === 'start' ? here.line.start : lastCaretOffset(here.block, here.line) };
  }
}

/** The line holding the caret at `offset`: the one it falls in, or the last. */
export function lineFor(block: BlockLayout, offset: number): LineLayout {
  for (const line of block.lines) {
    // A caret right at a soft wrap belongs to the next line (it starts there).
    if (offset >= line.start && offset < line.end) return line;
  }
  return block.lines[block.lines.length - 1];
}

/** The last offset the caret can take on a line: before its wrap space or line break, or the block's end. */
function lastCaretOffset(block: BlockLayout, line: LineLayout): number {
  const isLast = line === block.lines[block.lines.length - 1];
  return isLast ? Math.max(line.start, line.end) : Math.max(line.start, line.end - 1);
}

/** The offset on `line` whose caret is nearest x (frame units). */
function offsetOnLine(block: BlockLayout, line: LineLayout, u: number): number {
  const last = lastCaretOffset(block, line);
  let best = line.start;
  let bestDistance = Infinity;
  for (let offset = line.start; offset <= last; offset++) {
    const distance = Math.abs(line.carets[offset - line.start] - u);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = offset;
    }
  }
  return best;
}

/** 1, 2, 3 at the top level; a, b, c one in; i, ii, iii two in; then round again. */
function numberLabel(n: number, level: number): string {
  switch (level % 3) {
    case 1: {
      let label = '';
      let k = n;
      while (k > 0) {
        k--;
        label = String.fromCharCode(97 + (k % 26)) + label;
        k = Math.floor(k / 26);
      }
      return label;
    }
    case 2:
      return roman(n);
    default:
      return String(n);
  }
}

function roman(n: number): string {
  const table: Array<[number, string]> = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let out = '';
  let k = n;
  for (const [value, digits] of table) {
    while (k >= value) {
      out += digits;
      k -= value;
    }
  }
  return out;
}

/** What a frame's layout depends on: changes when its text, styles or width change. */
function frameKey(frame: TextFrame): string {
  let key = `${frame.width}|`;
  for (const block of frame.blocks) {
    key += `${block.kind}${block.indent}${block.align}${block.checked ? 'x' : ''}:`;
    for (const run of block.runs) {
      key += `${run.bold ? 'b' : ''}${run.italic ? 'i' : ''}${run.underline ? 'u' : ''}${run.strike ? 's' : ''}${run.text.length}/${run.text}`;
    }
    key += '\u0000';
  }
  return key;
}
