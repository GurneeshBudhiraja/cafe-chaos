/**
 * The writing tools and what the tool wheel offers: one place that names
 * every tool, its label, its colours and its sizes.
 *
 * Pure data (no IWSDK, no DOM), so the wheel's 3D asset, the wheel system,
 * the ink system and the note previews all read the same catalogue, and
 * adding a tool or a colour is a change here only.
 *
 * Sizes are stroke widths as a fraction of the page width (the unit strokes
 * are stored in); for the eraser, the size is the radius it rubs out.
 */

/** Tools that hold the pen's attention: what touching the page does. */
export type ToolId = 'pen' | 'marker' | 'highlighter' | 'eraser' | 'lasso';

/** One-shot actions on the wheel: picking them does something once. */
export type ActionId = 'undo' | 'redo';

/** Everything on the wheel's ring of segments. */
export type WheelItemId = ToolId | ActionId;

/** The wheel's segments, clockwise from the top. */
export const WHEEL_ITEMS: readonly WheelItemId[] = [
  'pen',
  'marker',
  'highlighter',
  'eraser',
  'lasso',
  'undo',
  'redo',
];

/** The word shown on the wheel's hub while a segment is aimed at. */
export const WHEEL_LABELS: Record<WheelItemId, string> = {
  pen: 'Pen',
  marker: 'Marker',
  highlighter: 'Highlighter',
  eraser: 'Eraser',
  lasso: 'Lasso',
  undo: 'Undo',
  redo: 'Redo',
};

/** Tools that lay down ink (and are saved in a stroke's `tool` field). */
export type InkToolId = 'pen' | 'marker' | 'highlighter';

export function isInkTool(item: WheelItemId): item is InkToolId {
  return item === 'pen' || item === 'marker' || item === 'highlighter';
}

export function isAction(item: WheelItemId): item is ActionId {
  return item === 'undo' || item === 'redo';
}

/** A named colour on the wheel's options ring. */
export interface Swatch {
  name: string;
  /** CSS hex colour. */
  hex: string;
}

/** Ink colours: the theme's warm ink, plus a few that read on white paper. */
const INK_SWATCHES: readonly Swatch[] = [
  { name: 'Ink', hex: '#1f1c19' },
  { name: 'Blue', hex: '#2f5d8a' },
  { name: 'Clay', hex: '#d4704f' },
  { name: 'Green', hex: '#3d7a5a' },
  { name: 'Plum', hex: '#6b4a7a' },
];

/** Highlighter colours: light and bright, drawn see-through under the ink. */
const HIGHLIGHTER_SWATCHES: readonly Swatch[] = [
  { name: 'Yellow', hex: '#f2d35b' },
  { name: 'Pink', hex: '#f0a3b8' },
  { name: 'Mint', hex: '#a8dba0' },
  { name: 'Sky', hex: '#9cc8f0' },
];

export type SizeId = 'fine' | 'medium' | 'bold';
export const SIZE_IDS: readonly SizeId[] = ['fine', 'medium', 'bold'];

export interface ToolSpec {
  /** Colours to pick from; empty when the tool has no colour (eraser, lasso). */
  swatches: readonly Swatch[];
  /** Width (or eraser radius) for each size, as a fraction of the page width. */
  sizes: Record<SizeId, number> | null;
  /** What the tool starts with before anything is picked. */
  defaultSwatch: number;
  defaultSize: SizeId;
}

export const TOOL_SPECS: Record<ToolId, ToolSpec> = {
  pen: {
    swatches: INK_SWATCHES,
    sizes: { fine: 0.0025, medium: 0.0035, bold: 0.0055 },
    defaultSwatch: 0,
    defaultSize: 'medium',
  },
  marker: {
    swatches: INK_SWATCHES,
    sizes: { fine: 0.007, medium: 0.01, bold: 0.015 },
    defaultSwatch: 1,
    defaultSize: 'medium',
  },
  highlighter: {
    swatches: HIGHLIGHTER_SWATCHES,
    sizes: { fine: 0.018, medium: 0.026, bold: 0.036 },
    defaultSwatch: 0,
    defaultSize: 'medium',
  },
  eraser: {
    swatches: [],
    sizes: { fine: 0.008, medium: 0.016, bold: 0.03 },
    defaultSwatch: 0,
    defaultSize: 'medium',
  },
  lasso: {
    swatches: [],
    sizes: null,
    defaultSwatch: 0,
    defaultSize: 'medium',
  },
};

/** How opaque each ink tool's strokes draw (the highlighter lets ink show through). */
export const INK_OPACITY: Record<InkToolId, number> = {
  pen: 1,
  marker: 1,
  highlighter: 0.42,
};
