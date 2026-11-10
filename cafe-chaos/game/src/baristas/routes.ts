/**
 * Where the baristas stand, in the café's own space (metres; +Y up; the
 * player toward +Z; the door on the right, +X): their stations on the
 * duckboard behind the counter, and how to find the place to stand at a
 * table. The ways between them are not written down: each barista finds
 * its own on the navigation grid (nav/nav-grid.ts), which is read from
 * the café's geometry, so a table put somewhere new is served, and a
 * new obstacle walked round, with nothing changed here.
 */

import { Vector3 } from '@iwsdk/core';
import type { NavGrid } from '../nav/nav-grid.js';

/** The duckboard's top, and the line along it the baristas work on. */
const DUCKBOARD_TOP_M = 0.036;
const STATION_Z = -0.204;
/** The stations along the duckboard (x), left to right: one per barista. */
export const STATION_X = [-0.265, -0.205, -0.145, -0.085, -0.025, 0.035];
/** A barista at work faces the counter and the player beyond it. */
export const STATION_YAW = 0;
/** Turned to the back bar (the kettle, the tins). */
export const BACK_BAR_YAW = Math.PI;
/** How far along the duckboard a working barista may shuffle from its station (metres). */
export const SHUFFLE_M = 0.022;

const board = (x: number, z: number): Vector3 => new Vector3(x, DUCKBOARD_TOP_M, z);

export const stationPoint = (index: number, shift = 0): Vector3 => board(STATION_X[index] + shift, STATION_Z);

/** Where a barista stands to serve a table, the way it faces there, and where the tray is set down. */
export interface ServePoint {
  /** Which piece of the café (an index into its pieces) the table is. */
  table: number;
  stand: Vector3;
  yaw: number;
  tray: Vector3;
}

/** A barista serving stands within this of the table's middle (metres), wherever there is room nearest it. */
const SERVE_REACH_M = 0.12;
/** The tray is set down this far from the table's middle, toward the barista (metres). */
const TRAY_IN_M = 0.01;

/**
 * Where to stand to serve a table: the nearest place to its middle with
 * room to stand (found on the navigation grid, so it is the open side of
 * a two-seater and the gap beside a four-seater without either being
 * told), facing the table. `centre` is the table's middle and `top` its
 * top's height (café space). Null if there is nowhere to stand by it.
 */
export function servePointFor(nav: NavGrid, table: number, centre: Vector3, top: number): ServePoint | null {
  const stand = nav.nearest(centre.x, centre.z, SERVE_REACH_M);
  if (!stand) return null;
  const dx = stand.x - centre.x;
  const dz = stand.z - centre.z;
  const away = Math.hypot(dx, dz) || 1;
  return {
    table,
    stand,
    yaw: Math.atan2(-dx, -dz),
    tray: new Vector3(centre.x + (dx / away) * TRAY_IN_M, top, centre.z + (dz / away) * TRAY_IN_M),
  };
}
