/**
 * Note data model.
 *
 * This module is pure data: no IWSDK, DOM, or storage imports. Editing,
 * rendering, and persistence layers all depend on these types, so they must
 * stay stable and versioned.
 *
 * Coordinate system: strokes live in *canvas coordinates*, not world or
 * tablet meters. Each page is a window onto an infinite canvas
 * (page-view.ts); the first page's area spans x = 0..1 (left to right) and
 * y = 0..1 (top to bottom), and the canvas goes on in every direction.
 * Moving, tilting, or resizing the tablet therefore never changes saved
 * ink, and the floating page shows the same data at another size.
 */

import { isInkTool, type InkToolId } from '../ink/tool-catalog.js';
import { parseView, type PageView } from './page-view.js';
import { parseFrames, type TextFrame } from './typed-text.js';

/** Bump when the saved shape changes, and add a migration in `parseNote`. */
export const NOTE_SCHEMA_VERSION = 1;

/** Width / height of every page. Tablet surfaces use the same aspect ratio. */
export const PAGE_ASPECT = 4 / 3;

/** The tool that drew a stroke: how it renders (a highlighter draws see-through, under the ink). */
export type ToolKind = InkToolId;

/** The page background a note was created with (a template). */
export type PaperStyle = 'blank' | 'lined' | 'grid' | 'dotted' | 'cornell' | 'checklist';
export const PAPER_STYLES: readonly PaperStyle[] = [
  'blank',
  'lined',
  'grid',
  'dotted',
  'cornell',
  'checklist',
];

export interface Stroke {
  id: string;
  tool: ToolKind;
  /** CSS hex colour, for example `#1d4ed8`. */
  color: string;
  /** Line width as a fraction of page width (0.004 = 0.4% of the page). */
  width: number;
  /** Flat list of sampled points: [x0, y0, x1, y1, ...] in page coordinates. */
  points: number[];
  /**
   * Optional width multiplier per point (around 1), for pen strokes whose
   * ink varies with speed. Missing means an even line (older notes, rays).
   */
  widths?: number[];
}

export interface Page {
  id: string;
  strokes: Stroke[];
  /**
   * Typed text boxes (typing mode, typed-text.ts), drawn over the ink.
   * Optional in storage: pages from before typing mode have none.
   */
  frames?: TextFrame[];
  /**
   * Where the page looks on its infinite canvas (page-view.ts). Optional in
   * storage: a page without one shows its first page's area (HOME_VIEW).
   */
  view?: PageView;
}

export interface Note {
  schemaVersion: typeof NOTE_SCHEMA_VERSION;
  id: string;
  title: string;
  /** Legacy plain text (unused). Typed text now lives on each page as text frames (typed-text.ts). */
  text: string;
  /** Page background. Optional in storage: older notes read as 'blank'. */
  paper: PaperStyle;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
  pages: Page[];
}

/** Stable unique id. `crypto.randomUUID` exists in every browser we target. */
export function createId(): string {
  return crypto.randomUUID();
}

export function createPage(): Page {
  return { id: createId(), strokes: [] };
}

export function createNote(
  title = 'Untitled note',
  now = Date.now(),
  paper: PaperStyle = 'blank',
): Note {
  return {
    schemaVersion: NOTE_SCHEMA_VERSION,
    id: createId(),
    title,
    text: '',
    paper,
    createdAt: now,
    updatedAt: now,
    pages: [createPage()],
  };
}

export function createStroke(color: string, width: number, tool: ToolKind = 'pen'): Stroke {
  return { id: createId(), tool, color, width, points: [] };
}

/** Number of sampled points in a stroke. */
export function strokePointCount(stroke: Stroke): number {
  return stroke.points.length / 2;
}

/**
 * Validate an unknown value (from storage or a backup file) and return a
 * well-formed Note, or `null` if it cannot be trusted. Never throws, so one
 * corrupt record cannot break the whole note library.
 */
export function parseNote(value: unknown): Note | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== NOTE_SCHEMA_VERSION) return null;
  if (typeof raw.id !== 'string' || !Array.isArray(raw.pages)) return null;

  const pages: Page[] = [];
  for (const rawPage of raw.pages as unknown[]) {
    const page = parsePage(rawPage);
    if (page) pages.push(page);
  }
  if (pages.length === 0) pages.push(createPage());

  return {
    schemaVersion: NOTE_SCHEMA_VERSION,
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : 'Untitled note',
    text: typeof raw.text === 'string' ? raw.text : '',
    paper: PAPER_STYLES.includes(raw.paper as PaperStyle) ? (raw.paper as PaperStyle) : 'blank',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    pages,
  };
}

/** Validate one stored page (also used for sticky notes); null when it cannot be trusted. */
export function parsePage(value: unknown): Page | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !Array.isArray(raw.strokes)) return null;
  const strokes = (raw.strokes as unknown[]).filter(isStroke);
  const page: Page = { id: raw.id, strokes };
  const frames = parseFrames(raw.frames);
  if (frames.length > 0) page.frames = frames;
  const view = parseView(raw.view);
  if (view) page.view = view;
  return page;
}

function isStroke(value: unknown): value is Stroke {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.tool === 'string' &&
    isInkTool(s.tool as ToolKind) &&
    typeof s.color === 'string' &&
    typeof s.width === 'number' &&
    Array.isArray(s.points) &&
    s.points.length % 2 === 0 &&
    s.points.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    (s.widths === undefined ||
      (Array.isArray(s.widths) &&
        s.widths.length === s.points.length / 2 &&
        s.widths.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)))
  );
}
