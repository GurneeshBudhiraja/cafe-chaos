/**
 * The Canadian winter café's floor plan (docs/CANADA-PLAN.md): which piece
 * stands where, in the café's own space (metres; +Y up; the player toward
 * +Z; the origin at the centre of the plate's underside), on the anchors
 * the shell carries (`cafe-canada`, models/27-cafe-canada/INTEGRATION.md).
 *
 * Two floors. Downstairs, inside the cabin (the left half): two tables for
 * two along the window wall, each under a wall socket (the second one by
 * the fireplace), and a table for four in the middle. On the deck (the
 * patio): two bistro tables. On the dock: a bench for two facing the lake.
 * Round the bonfire: two Muskoka chairs facing the fire. Upstairs, on the
 * upper deck over the counter (reached by the stairs outside the cabin's
 * right wall): two bistro tables beside the rooftop piano. Twenty seats
 * in all; the game opens them table by table as the Japanese café's (the
 * first two inside tables at the start).
 *
 * CafeSystem builds it when the Canadian café is chosen on the start card;
 * the upper floor has its own walk grid (nav/cafe-nav.ts CANADA_UPPER_NAV)
 * and the stairs join the two (CafeSystem.findPath).
 */

import type { Placement } from './layout.js';

/** The plate (the same as the Japanese café's) and the floors' tops. */
export const CANADA_FLOOR_TOP_M = 0.024;
export const CANADA_UPPER_TOP_M = 0.1548;

export const CANADA_LAYOUT: Placement[] = [
  { model: 'cafe-canada' as const, x: 0, z: 0, y: 0 },
  // 1-2. The cabin's window wall: two tables for two, each under a socket (the second also by the fireplace).
  { model: 'table-ca-2' as const, x: -0.31, z: -0.10 },
  { model: 'table-ca-2' as const, x: -0.31, z: 0.10 },
  // 3. The middle table for four.
  { model: 'table-ca-4' as const, x: -0.17, z: -0.03, yawDeg: 90 },
  // 4-5. The deck: two bistro tables.
  { model: 'patio-table' as const, x: 0.16, z: 0.08 },
  { model: 'patio-table' as const, x: 0.31, z: 0.06 },
  // 6. The dock: the bench, its sitters facing the lake (and the player).
  { model: 'dock-bench' as const, x: 0.26, z: 0.25, y: 0.030 },
  // 7-8. The bonfire: two chairs either side of the ring at (-0.27, 0.245), each turned to face it. The shell's third
  // spot (FireSpot-2, in front of the ring at z 0.33) is past the plate's front edge (0.31): a chair there would hang
  // over the player's real table, and behind the ring the cabin's front wall and the way out leave no room.
  ...[180, 0].map((a) => {
    const r = 0.085;
    const rad = (a * Math.PI) / 180;
    return { model: 'fire-chair' as const, x: -0.27 + r * Math.cos(rad), z: 0.245 - r * Math.sin(rad), yawDeg: a - 90 };
  }),
  // 9-10. Upstairs: two bistro tables on the upper deck (the shell's UpperSpot-1/2), beside the piano.
  { model: 'patio-table' as const, x: -0.27, z: -0.2125, y: CANADA_UPPER_TOP_M },
  { model: 'patio-table' as const, x: -0.11, z: -0.2125, y: CANADA_UPPER_TOP_M },
];

/**
 * Which tables open at the start (indices into CANADA_LAYOUT: the two window
 * tables), and the order the rest open in from the Shop: nearest the front
 * first, as the game does for the Japanese café.
 */
export { CANADA_START_TABLES } from '../game/rules.js';

/** The wishes the Canadian café can meet, by piece (the game's wish logic reads these; CANADA-PLAN.md). */
export const CANADA_PLACES = {
  /** Seats whose table stands under a wall socket. */
  socketTables: [1, 2],
  /** By the fireplace inside (the `warm` wish): the second window table, nearest the hearth. */
  warmTables: [1, 2],
  /** Everything not inside the cabin (the upper deck is outside too: it is open to the sky). */
  outsideTables: [4, 5, 6, 7, 8, 9, 10],
  patioTables: [4, 5],
  lakeTables: [6],
  bonfireTables: [7, 8],
  /** Upstairs (the `upstairs` wish: a view over the café). */
  upperTables: [9, 10],
  /** Where a takeaway guest stands (the shell's `TakeawaySpot`). */
  takeaway: { x: 0.0, z: -0.125 },
  /** The two musicians, each bought in the shop; seats within `earshot` of one meet `music` once it plays. `yawDeg` is three.js's (rotation.y). */
  musicians: [
    /** The violinist on the patio stage (the shell's `MusicianSpot`, barista-fiddler.glb, clip `Play`). */
    { model: 'barista-fiddler', x: 0.30, y: 0.035, z: -0.21, yawDeg: 180, clip: 'Play', earshot: 0.2 },
    /** The pianist at the rooftop piano (the shell's `PianoSpot`, barista-pianist.glb, clip `PlayPiano`). */
    { model: 'barista-pianist', x: -0.365, y: CANADA_UPPER_TOP_M, z: -0.2125, yawDeg: -90, clip: 'PlayPiano', earshot: 0.2 },
  ],
  /** The stairs: guests and staff walk from `bottom` to `top` playing StairsUp / ClimbUp (and back down), 15 steps. */
  stairs: { bottom: { x: 0.081, y: 0.024, z: -0.002 }, top: { x: 0.081, y: CANADA_UPPER_TOP_M, z: -0.153 }, landing: { x: 0.076, z: -0.19 }, steps: 15 },
};
