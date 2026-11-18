/**
 * The Canadian winter café's floor plan (docs/CANADA-PLAN.md): which piece
 * stands where, in the café's own space (metres; +Y up; the player toward
 * +Z; the origin at the centre of the plate's underside), on the anchors
 * the shell carries (`cafe-canada`, models/27-cafe-canada/INTEGRATION.md).
 *
 * Two floors. Downstairs, inside the cabin (the left half): two tables for
 * two along the window wall, each under a wall socket, either side of the
 * fireplace; the long table for four in the middle; two tables for two on
 * the door side. On the deck (the patio): two log tables. Round the
 * bonfire: three Muskoka chairs facing the fire. Upstairs, on the upper
 * deck over the counter (reached by the stairs outside the cabin's right
 * wall): four log tables either side of the rooftop piano. Twenty-five
 * seats in all (the dock bench was removed with the dock); the game opens
 * them table by table (the window pair at the start).
 *
 * CafeSystem builds it when the Canadian café is chosen on the start card;
 * the upper floor has its own walk grid (nav/cafe-nav.ts CANADA_UPPER_NAV)
 * and the stairs join the two (CafeSystem.findPath).
 */

import type { Placement } from './layout.js';

/** The plate (the same as the Japanese café's) and the floors' tops. */
export const CANADA_FLOOR_TOP_M = 0.024;
export const CANADA_UPPER_TOP_M = 0.1548;

/** A spot from the shell's anchors (models/27-cafe-canada/INTEGRATION.md, "Anchors"): x, z, and its yaw in degrees. */
const FIRE_SPOTS = [
  { x: -0.3436, z: 0.2875, yawDeg: 120 },
  { x: -0.1964, z: 0.2875, yawDeg: -120 },
  { x: -0.27, z: 0.16, yawDeg: 0 },
];

export const CANADA_LAYOUT: Placement[] = [
  { model: 'cafe-canada' as const, x: 0, z: 0, y: 0 },
  // 1-2. The cabin's window wall: two tables for two, each under a socket, either side of the fireplace (TableSpot-1/2).
  { model: 'table-ca-2' as const, x: -0.31, z: -0.05 },
  { model: 'table-ca-2' as const, x: -0.31, z: 0.09 },
  // 3. The long table in the middle (TableSpot-3), turned 90 degrees.
  { model: 'table-ca-4' as const, x: -0.17, z: 0.02, yawDeg: 90 },
  // 4-5. The cabin's door side, mirroring the window pair (TableSpot-4/5).
  { model: 'table-ca-2' as const, x: -0.03, z: -0.05 },
  { model: 'table-ca-2' as const, x: -0.03, z: 0.09 },
  // 6-7. The deck: two log tables either side of the heater (PatioSpot-1/2).
  { model: 'patio-table' as const, x: 0.15, z: 0.11 },
  { model: 'patio-table' as const, x: 0.31, z: 0.11 },
  // 8-10. The bonfire: three Muskoka chairs round the ring, 120 degrees apart, each facing the fire (FireSpot-1/2/3).
  ...FIRE_SPOTS.map((f) => ({ model: 'fire-chair' as const, x: f.x, z: f.z, yawDeg: f.yawDeg })),
  // 11-14. Upstairs: four log tables on the upper deck, either side of the piano, back row then front (UpperSpot-1..4).
  { model: 'patio-table' as const, x: -0.32, z: -0.2225, y: CANADA_UPPER_TOP_M },
  { model: 'patio-table' as const, x: -0.03, z: -0.2225, y: CANADA_UPPER_TOP_M },
  { model: 'patio-table' as const, x: -0.32, z: -0.1375, y: CANADA_UPPER_TOP_M },
  { model: 'patio-table' as const, x: -0.03, z: -0.1375, y: CANADA_UPPER_TOP_M },
];

/**
 * Which tables open at the start (indices into CANADA_LAYOUT: the two window
 * tables), and the order the rest open in from the Shop: nearest the front
 * first, as the game does for the Japanese café.
 */
export { CANADA_START_TABLES } from '../game/rules.js';

/**
 * The tables still to open, in rings (indices into CANADA_LAYOUT; the window
 * tables 1 and 2 are open from the start): the rest of the cabin; the
 * patio; the bonfire; upstairs.
 */
export const CANADA_TABLE_RINGS: number[][] = [[3, 4, 5], [6, 7], [8, 9, 10], [11, 12, 13, 14]];

/** The wishes the Canadian café can meet, by piece (the game's wish logic reads these; CANADA-PLAN.md). */
export const CANADA_PLACES = {
  /** Seats whose table stands under a wall socket. */
  socketTables: [1, 2],
  /** By the fireplace inside (the `warm` wish): the second window table, nearest the hearth. */
  warmTables: [1, 2],
  /** Everything not inside the cabin (the upper deck is outside too: it is open to the sky). */
  outsideTables: [6, 7, 8, 9, 10, 11, 12, 13, 14],
  patioTables: [6, 7],
  /** No seat by the lake now (the dock was removed): nobody is given the `lake` wish. */
  lakeTables: [] as number[],
  bonfireTables: [8, 9, 10],
  /** Upstairs (the `upstairs` wish: a view over the café). */
  upperTables: [11, 12, 13, 14],
  /** Where a takeaway guest stands (the shell's `TakeawaySpot`). */
  takeaway: { x: 0.0, z: -0.085 },
  /** The two musicians, each bought in the shop; seats within `earshot` of one meet `music` once it plays. `yawDeg` is three.js's (rotation.y). */
  musicians: [
    /** The violinist at the back of the deck (the shell's `MusicianSpot`, barista-fiddler.glb, clip `Play`), facing the patio and the player; in earshot of both patio tables. */
    { model: 'barista-fiddler', x: 0.205, y: CANADA_FLOOR_TOP_M, z: -0.19, yawDeg: 0, clip: 'Play', earshot: 0.32 },
    /** The pianist at the rooftop piano (the shell's `PianoSpot`, barista-pianist.glb, clip `PlayPiano`). */
    { model: 'barista-pianist', x: -0.17, y: CANADA_UPPER_TOP_M, z: -0.212, yawDeg: 180, clip: 'PlayPiano', earshot: 0.2 },
  ],
  /** The stairs: guests and staff walk from `bottom` to `top` playing StairsUp / ClimbUp (and back down), 15 steps. */
  stairs: { bottom: { x: 0.081, y: 0.024, z: -0.002 }, top: { x: 0.081, y: CANADA_UPPER_TOP_M, z: -0.153 }, landing: { x: 0.076, z: -0.19 }, steps: 15 },
};
