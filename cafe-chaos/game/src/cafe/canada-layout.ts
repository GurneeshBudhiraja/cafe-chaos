/**
 * The Canadian winter café's floor plan (docs/CANADA-PLAN.md): which piece
 * stands where, in the café's own space (metres; +Y up; the player toward
 * +Z; the origin at the centre of the plate's underside), on the anchors
 * the shell carries (`cafe-canada`, models/27-cafe-canada/INTEGRATION.md).
 *
 * Inside the cabin (the left half): two tables for two along the window
 * wall, each under a wall socket, and a table for four in the middle. On
 * the deck (the patio): two bistro tables. On the dock: a bench for two
 * facing the lake. Round the bonfire: three Muskoka chairs facing the
 * fire. Seventeen seats in all; the game opens them table by table as the
 * Japanese café's (the first two inside tables at the start).
 *
 * Not yet wired: the game builds the Japanese layout (layout.ts) until the
 * café picker lands (phase 4 of the plan).
 */

import type { Placement } from './layout.js';

/** The plate (the same as the Japanese café's) and the floor's top. */
export const CANADA_FLOOR_TOP_M = 0.024;

export const CANADA_LAYOUT: Placement[] = [
  { model: 'cafe-canada' as Placement['model'], x: 0, z: 0, y: 0 },
  // The cabin: two window tables (sockets on the wall over them) and the middle table.
  { model: 'table-ca-2' as Placement['model'], x: -0.33, z: -0.10 },
  { model: 'table-ca-2' as Placement['model'], x: -0.33, z: 0.06 },
  { model: 'table-ca-4' as Placement['model'], x: -0.17, z: -0.03, yawDeg: 90 },
  // The deck: two bistro tables.
  { model: 'patio-table' as Placement['model'], x: 0.16, z: 0.08 },
  { model: 'patio-table' as Placement['model'], x: 0.31, z: 0.06 },
  // The dock: the bench, its sitters facing the lake (and the player).
  { model: 'dock-bench' as Placement['model'], x: 0.26, z: 0.25, y: 0.030 },
  // The bonfire: three chairs round the ring at (-0.27, 0.245), each turned to face it.
  ...[205, 270, 335].map((a) => {
    const r = 0.085;
    const rad = (a * Math.PI) / 180;
    return { model: 'fire-chair' as Placement['model'], x: -0.27 + r * Math.cos(rad), z: 0.245 - r * Math.sin(rad), yawDeg: a - 90 };
  }),
];

/**
 * Which tables open at the start (indices into CANADA_LAYOUT: the two window
 * tables), and the order the rest open in from the Shop: nearest the front
 * first, as the game does for the Japanese café.
 */
export const CANADA_START_TABLES = [1, 2];

/** The wishes the Canadian café can meet, by piece (the game's wish logic reads these; CANADA-PLAN.md). */
export const CANADA_PLACES = {
  /** Seats whose table stands under a wall socket. */
  socketTables: [1, 2],
  /** Everything not inside the cabin. */
  outsideTables: [4, 5, 6, 7, 8, 9],
  patioTables: [4, 5],
  lakeTables: [6],
  bonfireTables: [7, 8, 9],
  /** Where a takeaway guest stands (the shell's `TakeawaySpot`). */
  takeaway: { x: 0.0, z: -0.125 },
  /** The musician's stage (the shell's `MusicianSpot`); seats within `earshot` of it hear the violin. */
  musician: { x: 0.30, z: -0.21, earshot: 0.2 },
};
