/**
 * The dock: a small signboard of big, labelled buttons that stands beside
 * the café, so moving, turning and resizing it need no gesture to learn.
 * Poke a button with a fingertip; pinch the Move handle and drag.
 */

export type DockAction = 'move' | 'turn' | 'smaller' | 'bigger' | 'reset';

export interface DockButton {
  action: DockAction;
  label: string;
}

/** The buttons, left to right as the player sees them. */
export const BUTTONS: DockButton[] = [
  { action: 'move', label: 'Move' },
  { action: 'turn', label: 'Turn' },
  { action: 'smaller', label: 'Smaller' },
  { action: 'bigger', label: 'Bigger' },
  { action: 'reset', label: 'Reset' },
];

/** Sizes, in metres. The dock keeps this size whatever size the café is. */
export const TILE_M = 0.052;
export const GAP_M = 0.008;
export const PAD_M = 0.01;
export const BOARD_W = BUTTONS.length * TILE_M + (BUTTONS.length - 1) * GAP_M + 2 * PAD_M;
export const BOARD_H = TILE_M + 2 * PAD_M;
export const BOARD_T = 0.008;
/**
 * The dock stands in front of the café's front-right corner: this far out
 * from the base's front edge, its right end level with the base's right
 * edge, its bottom this far above the base.
 */
export const AHEAD_M = 0.05;
export const RAISE_M = 0.015;
/** Leaned back so it faces a player looking down on the table (radians). */
export const LEAN = 0.5;
/**
 * How quickly the dock follows the café (per second). It holds still while
 * a finger is at it, so a press that resizes the café (and so moves its
 * edges) does not pull the buttons out from under the finger.
 */
export const FOLLOW = 14;
/** A fingertip this close in front of the board (and this far past its edges) holds the dock still. */
export const STILL_DEPTH_M = 0.07;
export const STILL_MARGIN_M = 0.03;

/** Pokes: a fingertip within the tile's face (plus this much around it) ... */
export const POKE_MARGIN_M = 0.006;
/** ... and this close to or through its face presses it; it re-arms this far out. */
export const PRESS_DEPTH_M = 0.004;
export const REARM_DEPTH_M = 0.018;
/** How near a fingertip may hover in front of a tile for it to light up (metres). */
export const HOVER_DEPTH_M = 0.045;
/** A pinch within this of the Move handle's centre takes the café. */
export const HANDLE_REACH_M = 0.035;

/** What one press does. */
export const TURN_STEP = (22.5 * Math.PI) / 180;
export const SIZE_STEP = 1.2;
/** How fast a press's change plays out (per second). */
export const EASE = 9;

/** Colours. */
export const COLORS = {
  board: 0x3b2416,
  edge: 0xc98a4a,
  paper: '#f6e8d2',
  ink: '#4a2c17',
  inkSoft: '#8a6a4a',
  glow: 0xffb46a,
};
/** The tiles' paper glows a little at rest, more under a hovering finger, and flashes when pressed. */
export const TILE_GLOW = { rest: 0.22, hover: 0.6, pressed: 1.1 };
/** A pressed tile sinks this far for this long. */
export const SINK_M = 0.003;
export const SINK_SECONDS = 0.14;
