/**
 * Note data model.
 *
 * This module is pure data: no IWSDK, DOM, or storage imports. Editing,
 * rendering, and persistence layers all depend on these types, so they must
 * stay stable and versioned.
 *
 * Coordinate system: strokes live in *page coordinates*, not world or tablet
 * meters. A page spans x = 0..1 (left to right) and y = 0..1 (top to bottom).
 * Moving, tilting, or resizing the tablet therefore never changes saved ink,
 * and the enlarged note view can render the same data at another size.
 */

/** Bump when the saved shape changes, and add a migration in `parseNote`. */
export const NOTE_SCHEMA_VERSION = 1;

/** Width / height of every page. Tablet surfaces use the same aspect ratio. */
export const PAGE_ASPECT = 4 / 3;

export type ToolKind = 'pen';

export interface Stroke {
  id: string;
  tool: ToolKind;
  /** CSS hex colour, for example `#1d4ed8`. */
  color: string;
  /** Line width as a fraction of page width (0.004 = 0.4% of the page). */
  width: number;
  /** Flat list of sampled points: [x0, y0, x1, y1, ...] in page coordinates. */
  points: number[];
}

export interface Page {
  id: string;
  strokes: Stroke[];
}

export interface Note {
  schemaVersion: typeof NOTE_SCHEMA_VERSION;
  id: string;
  title: string;
  /** Typed text content. Rich typing arrives with keyboard mode. */
  text: string;
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

export function createNote(title = 'Untitled note', now = Date.now()): Note {
  return {
    schemaVersion: NOTE_SCHEMA_VERSION,
    id: createId(),
    title,
    text: '',
    createdAt: now,
    updatedAt: now,
    pages: [createPage()],
  };
}

export function createStroke(color: string, width: number): Stroke {
  return { id: createId(), tool: 'pen', color, width, points: [] };
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
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    pages,
  };
}

function parsePage(value: unknown): Page | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !Array.isArray(raw.strokes)) return null;
  const strokes = (raw.strokes as unknown[]).filter(isStroke);
  return { id: raw.id, strokes };
}

function isStroke(value: unknown): value is Stroke {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    s.tool === 'pen' &&
    typeof s.color === 'string' &&
    typeof s.width === 'number' &&
    Array.isArray(s.points) &&
    s.points.length % 2 === 0 &&
    s.points.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}
