/**
 * Where the baristas stand and walk, in the café's own space (metres;
 * +Y up; the player toward +Z; the door on the right, +X). Pure maths.
 * The numbers come from a height map of the shell (the counter, the
 * duckboard behind it, the way out at its right-hand end, the gap
 * between the two back tables, the aisles).
 *
 *   back-bar cabinet
 *   = = = = = = = = = = = = = = = =   <- the lane behind (passing colleagues)
 *   S   S   S   S   S   S             <- stations on the duckboard
 *   [ = = = = counter = = = = ]  >--+     the way out, round the counter's end
 *     T4      T4      T4      T2 |  T2    back row (four-seaters against the counter)
 *   - - - - - - middle aisle - - + - - -
 *     T2      T2      T2      T2    T2    front row
 *
 * A barista serving a four-seater stands in the gap beside the table
 * (its near side is lined with chairs); serving a two-seater it stands
 * at the table's open side, in the middle aisle.
 */

import { Vector3 } from '@iwsdk/core';
import { FLOOR_TOP_M, OPENING_LAYOUT } from '../cafe/layout.js';

/** The duckboard's top, the line the baristas work on, and the lane behind them for passing. */
const DUCKBOARD_TOP_M = 0.036;
const STATION_Z = -0.204;
const LANE_Z = -0.219;
/** The stations along the duckboard (x), left to right: one per barista. */
export const STATION_X = [-0.265, -0.205, -0.145, -0.085, -0.025, 0.035];
/** A barista at work faces the counter and the player beyond it. */
export const STATION_YAW = 0;
/** Turned to the back bar (the kettle, the tins). */
export const BACK_BAR_YAW = Math.PI;
/** How far along the duckboard a working barista may shuffle from its station (metres). */
export const SHUFFLE_M = 0.022;

/** The right-hand end of the duckboard, the step down to the floor, and the corridor between the two back tables. */
const BOARD_END_X = 0.07;
const STEP_DOWN = { x: 0.115, z: -0.207 };
const CORRIDOR = { out: 0.19, back: 0.206, top: -0.2, bottom: -0.062 };
/** The middle aisle: outbound and homebound keep to their own side of it. */
const AISLE = { out: -0.052, back: -0.034 };

const board = (x: number, z: number): Vector3 => new Vector3(x, DUCKBOARD_TOP_M, z);
const floor = (x: number, z: number): Vector3 => new Vector3(x, FLOOR_TOP_M, z);

export const stationPoint = (index: number, shift = 0): Vector3 => board(STATION_X[index] + shift, STATION_Z);

/** Where a barista stands to serve a table, the way it faces there, and where the tray is set down (x, z; the system adds the table top's height). */
export interface ServePoint {
  /** Index into the layout (which table). */
  table: number;
  stand: Vector3;
  yaw: number;
  tray: Vector3;
}

/** One serve point per table of the layout. */
export const SERVE_POINTS: ServePoint[] = OPENING_LAYOUT.flatMap((piece, table) => {
  if (piece.model === 'table-4') {
    // Beside it, in the gap to its right, facing the table.
    return [{ table, stand: floor(piece.x + 0.053, piece.z + 0.01), yaw: -Math.PI / 2, tray: new Vector3(piece.x + 0.014, 0, piece.z + 0.008) }];
  }
  if (piece.model !== 'table-2') return [];
  const frontRow = piece.z > -0.05;
  // The two-seaters' chairs are to left and right: serve from the aisle side.
  return frontRow
    ? [{ table, stand: floor(piece.x, piece.z - 0.039), yaw: 0, tray: new Vector3(piece.x, 0, piece.z - 0.008) }]
    : [{ table, stand: floor(piece.x, piece.z + 0.041), yaw: Math.PI, tray: new Vector3(piece.x, 0, piece.z + 0.008) }];
});

/** From a station out to a table: along the lane behind the others, round the counter's end, down the corridor and along the aisle. */
export function pathOut(station: number, shift: number, to: ServePoint): Vector3[] {
  const from = stationPoint(station, shift);
  return [
    from,
    board(from.x, LANE_Z),
    board(BOARD_END_X, LANE_Z),
    floor(STEP_DOWN.x, STEP_DOWN.z),
    floor(CORRIDOR.out, CORRIDOR.top),
    floor(CORRIDOR.out, CORRIDOR.bottom),
    floor(to.stand.x, AISLE.out),
    to.stand.clone(),
  ];
}

/** From a table back to a station. */
export function pathBack(from: ServePoint, station: number): Vector3[] {
  const home = stationPoint(station);
  return [
    from.stand.clone(),
    floor(from.stand.x, AISLE.back),
    floor(CORRIDOR.back, AISLE.back),
    floor(CORRIDOR.back, CORRIDOR.top),
    floor(STEP_DOWN.x, STEP_DOWN.z),
    board(BOARD_END_X, LANE_Z),
    board(home.x, LANE_Z),
    home,
  ];
}
