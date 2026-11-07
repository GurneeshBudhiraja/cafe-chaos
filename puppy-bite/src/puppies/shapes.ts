/**
 * The puppies' poses and the room each takes on the bed. The bed is a
 * grid of CELL-sized squares; every pose covers a few cells (its
 * footprint), like a small polyomino:
 *
 *   tiny    ■        a very small pup curled into a ball
 *   loaf    ■■       lying sphinx-style, paws forward (1 x 2)
 *   sprawl  ■■  ■    flat on the belly, hind legs out to one side (an L)
 *   stretch ■■■      on its side, stretched right out (1 x 3)
 *   curl    ■■ ■■    curled up in a ring (2 x 2)
 *
 * A puppy's origin is the centre of its footprint's bounding box, on the
 * ground. Turning a puppy by quarter turns turns its footprint with it.
 * Pure maths, no three.js.
 */

export const CELL = 0.07;
/** The puppies were modelled for 5.5 cm cells: everything scales by this. */
export const PUPPY_SCALE = CELL / 0.055;
export type Pose = 'tiny' | 'loaf' | 'sprawl' | 'stretch' | 'curl';
export const POSES: Pose[] = ['tiny', 'loaf', 'sprawl', 'stretch', 'curl'];
export type Vec2 = readonly [number, number];

/** Each pose's cells as [column, row], columns along +X, rows along +Z, from the footprint's corner. */
export const CELLS: Record<Pose, Vec2[]> = {
  tiny: [[0, 0]],
  loaf: [[0, 0], [0, 1]],
  sprawl: [[0, 0], [0, 1], [1, 0]],
  stretch: [[0, 0], [1, 0], [2, 0]],
  curl: [[0, 0], [1, 0], [0, 1], [1, 1]],
};

/** The footprint's size in cells. */
export function footprintSize(pose: Pose): { columns: number; rows: number } {
  const cells = CELLS[pose];
  return { columns: Math.max(...cells.map((c) => c[0])) + 1, rows: Math.max(...cells.map((c) => c[1])) + 1 };
}

/** The cells' centres in metres, relative to the puppy's origin (unturned). */
export function cellCentres(pose: Pose): Vec2[] {
  const { columns, rows } = footprintSize(pose);
  return CELLS[pose].map(([c, r]) => [(c + 0.5 - columns / 2) * CELL, (r + 0.5 - rows / 2) * CELL]);
}

/** A point turned by `turns` quarter turns about +Y (the same sense as three.js rotation.y). */
export function turnPoint([x, z]: Vec2, turns: number): Vec2 {
  const yaw = ((turns % 4) + 4) % 4;
  if (yaw === 0) return [x, z];
  if (yaw === 1) return [-z, x];
  if (yaw === 2) return [-x, -z];
  return [z, -x];
}

/** The yaw in radians for a number of quarter turns. */
export function turnsToYaw(turns: number): number {
  return (((turns % 4) + 4) % 4) * (Math.PI / 2);
}

/** The nearest number of quarter turns to a yaw (radians). */
export function yawToTurns(yaw: number): number {
  return ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
}

/**
 * The cells a puppy covers on a grid, as [column, row], when its origin is
 * at grid position (gx, gz) in cell units (the grid's corner is 0, 0) and
 * it is turned by `turns`. Null when the origin is not on a snapping
 * position for this pose (see snapOrigin).
 */
export function gridCells(pose: Pose, turns: number, gx: number, gz: number): Vec2[] {
  return cellCentres(pose).map((c) => {
    const [x, z] = turnPoint(c, turns);
    return [Math.floor(gx + x / CELL), Math.floor(gz + z / CELL)];
  });
}

/**
 * Snap a puppy's origin (grid units) so its turned footprint lands on
 * whole cells: the nearest position where the first cell's centre sits on
 * a cell's centre.
 */
export function snapOrigin(pose: Pose, turns: number, gx: number, gz: number): { gx: number; gz: number } {
  const [x, z] = turnPoint(cellCentres(pose)[0], turns);
  const rx = x / CELL;
  const rz = z / CELL;
  return { gx: Math.round(gx + rx - 0.5) + 0.5 - rx, gz: Math.round(gz + rz - 0.5) + 0.5 - rz };
}

/** How far the footprint reaches from the origin (metres), for hover rings and scattering. */
export function footprintRadius(pose: Pose): number {
  const { columns, rows } = footprintSize(pose);
  return (Math.hypot(columns, rows) * CELL) / 2;
}
