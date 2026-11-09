/**
 * The café's floor plan: which model stands where, in the café's own space
 * (metres; +Y up; the front, where the player sits, toward +Z; the origin
 * at the centre of the garden base's underside).
 *
 * This is the opening layout, the one the models were sized and tested
 * with (see ../../START-HERE.md): the Japanese garden café shell with the
 * waiting bench by the gate and all ten tables: three four-seaters and
 * two two-seaters in the back row, five two-seaters in the front row.
 * Columns are 13 cm apart, the rows 16 cm. Dressing the room further: a
 * two-stool bar along the left wall, a quiet armchair corner at the back
 * right, and a few meals already out on the tables.
 */

import type { ModelName } from '../assets.js';

export interface Placement {
  model: ModelName;
  x: number;
  z: number;
  /** Turn about +Y, in degrees. */
  yawDeg?: number;
  /** Height above the café's origin (defaults to the café floor's top). */
  y?: number;
}

/** The café floor's top (the garden ground around it is 1.5 mm lower). */
export const FLOOR_TOP_M = 0.024;
/** The garden base's footprint (x by z). */
export const BASE_SIZE_M = { width: 0.92, depth: 0.62 };

const COLS = [-0.26, -0.13, 0, 0.13, 0.26];
/** Rows in café space: the back row away from the player, the front row nearer. */
const BACK_Z = -0.135;
const FRONT_Z = 0.025;

export const OPENING_LAYOUT: Placement[] = [
  { model: 'cafe-shell', x: 0, z: 0, y: 0 },
  // The waiting bench inside the front-right corner, by the gate (the
  // shell's BenchSpot); waiting guests face into the café.
  { model: 'waiting-bench', x: 0.235, z: 0.165, yawDeg: 180 },
  // Back row: three four-seaters, two two-seaters.
  ...[0, 1, 2].map((i) => ({ model: 'table-4' as const, x: COLS[i], z: BACK_Z })),
  ...[3, 4].map((i) => ({ model: 'table-2' as const, x: COLS[i], z: BACK_Z })),
  // Front row: five two-seaters.
  ...COLS.map((x) => ({ model: 'table-2' as const, x, z: FRONT_Z })),
  // A bar along the left wall, its counter against the wall and the stools
  // facing it, in the gap between the front row and the front rail.
  { model: 'bar-2', x: -0.3, z: 0.105, yawDeg: 90 },
  // The quiet corner: an armchair behind a plant screen, back right, away from the gate.
  { model: 'quiet-corner', x: 0.24, z: -0.215 },
];

/** Something set out on a piece of furniture: `model` goes on the named anchor of the piece at `on` (an index into the layout). */
export interface Dressing {
  model: ModelName;
  on: number;
  anchor: string;
}

/** Meals already out on a few tables, so the café looks open for business. */
export const DRESSING: Dressing[] = [
  { model: 'meal', on: 2, anchor: 'Meal-1' },
  { model: 'meal', on: 2, anchor: 'Meal-4' },
  { model: 'meal', on: 4, anchor: 'Meal-2' },
  { model: 'meal', on: 6, anchor: 'Meal-1' },
  { model: 'meal', on: 8, anchor: 'Meal-2' },
  { model: 'meal', on: 11, anchor: 'Meal-2' },
  { model: 'meal', on: 12, anchor: 'Meal-1' },
  { model: 'meal', on: 13, anchor: 'Meal-1' },
];
