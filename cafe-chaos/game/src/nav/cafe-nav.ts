/**
 * The café's navigation grid: the few things the grid cannot work out
 * from geometry alone (see nav-grid.ts for everything it can).
 */

import type { NavOptions } from './nav-grid.js';

export const CAFE_NAV: NavOptions = {
  // The plate (92 x 62 cm about the origin) and the player's table round it, out past the end of the line.
  min: { x: -0.74, z: -0.4 },
  max: { x: 0.8, z: 0.52 },
  cell: 0.005,
  // A barista on the duckboard stands 11 cm tall from the café's origin; lanterns and lintels above that are overhead.
  top: 0.1,
  // Floor to the duckboard is 1.2 cm: walked. A chair seat is 1.6 cm up from the floor: not.
  step: 0.0135,
  // ...and nothing more than that above the floor is ground at all (the duckboard is; a seat, 1.6 cm up, is not).
  rise: 0.0135,
  table: 0.004,
  // The deck is 2.6 cm above the player's table: hopped, where the fence leaves the plate's edge open.
  hop: 0.03,
  radius: 0.014,
  barriers: [
    // The room (and the annex, once it is open) is open along its front, a low step down to the
    // garden path. Nobody leaves that way: the way out is the exit in the left wall (or the annex's).
    [-0.7, 0.184, 0.365, 0.184],
  ],
  // The middle of the café floor (the shell's `FloorTop` anchor).
  seed: { x: 0, z: -0.04 },
  tableCost: 3,
};

/**
 * The Canadian café's ground floor: the same plate and the same table round
 * it. Its front is the cabin's knee-high front wall, the bonfire and the
 * lake: all open ground, so nothing is barred; the way out is the plate's
 * left edge past the bonfire (guests/paths.ts CANADA_EXIT_LANES). The upper
 * deck (y 0.1548) is over head height here, a ceiling; its posts are
 * thin obstacles.
 */
export const CANADA_NAV: NavOptions = {
  ...CAFE_NAV,
  barriers: [],
  // The duckboard behind the counter is a 3 cm strip (the counter top reaches back over it): a character keeps 1.2 cm
  // clear of anything, not 1.4, so the strip is walked to the way out at the counter's left end.
  radius: 0.012,
  // The shell's `FloorTop` is the plate's middle; a little toward the player, clear of the cabin's middle table.
  seed: { x: -0.05, z: 0.06 },
};

/**
 * The Canadian café's upper deck (over the counter, top y 0.1548): a grid
 * of its own, over the deck and its landing only, with its own head height
 * (a guest's height over the deck). Nothing below the deck is ground here
 * (no hop, no table), so nobody walks off its edge; the stairs join it to
 * the ground floor (CafeSystem.findPath).
 */
export const CANADA_UPPER_NAV: NavOptions = {
  min: { x: -0.44, z: -0.3 },
  max: { x: 0.13, z: -0.12 },
  cell: 0.005,
  top: 0.1548 + 0.1,
  step: 0.0135,
  rise: 0.0135,
  table: -1,
  hop: -1,
  radius: 0.012,
  barriers: [],
  // The shell's `UpperFloorTop`.
  seed: { x: -0.19, z: -0.17 },
  tableCost: 3,
};
