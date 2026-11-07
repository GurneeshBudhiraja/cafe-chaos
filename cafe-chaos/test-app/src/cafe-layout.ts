/**
 * The sample café used by the grey-box test: which model goes where, in the
 * café's own space (metres; +Y up, the front, where the player sits, toward
 * +Z; origin at the centre of the base's underside).
 *
 * This is the Japanese garden café shell (92 x 62 cm base, café room
 * 70 x 46 cm, entrance gate on the right) with all 10 tables unlocked:
 * five table-2 in the front row, three table-4 and two table-2 in the back
 * row. Columns sit 13 cm apart, rows 16 cm apart.
 */

export interface Placement {
  model: string;
  x: number;
  z: number;
  /** Turn about +Y, in degrees. */
  yawDeg?: number;
  /** Height above the café's origin (defaults to the café floor's top). */
  y?: number;
}

/** The café floor's top (the garden ground around it is 1.5 mm lower). */
export const FLOOR_TOP_M = 0.024;

const COLS = [-0.26, -0.13, 0, 0.13, 0.26];
/** Rows in café space: back row away from the player, front row nearer. */
const BACK_Z = -0.135;
const FRONT_Z = 0.025;

export const SAMPLE_LAYOUT: Placement[] = [
  { model: 'cafe-shell', x: 0, z: 0, y: 0 },
  // The waiting bench inside the front-right corner, by the gate; waiting
  // guests face into the cafe, their backs to the player.
  { model: 'waiting-bench', x: 0.235, z: 0.165, yawDeg: 180 },
  // Back row: three four-seaters, two two-seaters.
  ...[0, 1, 2].map((i) => ({ model: 'table-4', x: COLS[i], z: BACK_Z })),
  ...[3, 4].map((i) => ({ model: 'table-2', x: COLS[i], z: BACK_Z })),
  // Front row: five two-seaters.
  ...COLS.map((x) => ({ model: 'table-2', x, z: FRONT_Z })),
  // One dirty table, and the janitor on his way.
  { model: 'table-mess', x: COLS[3], z: FRONT_Z, y: 0.052 },
  { model: 'janitor', x: 0.07, z: -0.05, yawDeg: 160 },
];
