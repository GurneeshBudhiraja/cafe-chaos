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
