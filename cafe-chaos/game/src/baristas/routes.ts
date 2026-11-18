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
import { isCanada } from '../cafe/style.js';
import type { NavGrid } from '../nav/nav-grid.js';

/** The duckboard's top, and the line along it the baristas work on. */
const DUCKBOARD_TOP_M = 0.036;
const STATION_Z = -0.204;
/** The stations along the duckboard (x), left to right: one per barista, spread along the counter. */
export const STATION_X = [-0.235, -0.115, 0.005];
/** A barista at work faces the counter and the player beyond it. */
export const STATION_YAW = 0;
/** Turned to the back bar (the kettle, the tins). */
export const BACK_BAR_YAW = Math.PI;
/** How far along the duckboard a working barista may shuffle from its station (metres). */
export const SHUFFLE_M = 0.022;

/**
 * The Canadian café's stations: on the duckboard behind the counter, in the
 * middle of the strip the walk grid finds there (z -0.222 to -0.175). The
 * shell's `BaristaSpot-1/2/3` anchors (z -0.159, moved 4.5 cm forward with
 * the counter on 17 Nov) are on the counter top's back edge (it reaches back
 * to -0.159), off the ground. The baristas walk along the strip to the way
 * out at the counter's left end.
 */
const CANADA_STATION_Z = -0.185;

const board = (x: number, z: number): Vector3 => new Vector3(x, DUCKBOARD_TOP_M, z);

export const stationPoint = (index: number, shift = 0): Vector3 => board(STATION_X[index] + shift, isCanada() ? CANADA_STATION_Z : STATION_Z);

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

/** A server can set an order down from this far away at most (metres from the guest's place to where it stands). */
const SERVE_ARM_M = 0.085;
/** Between the server and the guest's place nothing may stand higher than this above the table top (metres): chairs and the table itself are fine, the counter is not. */
const OVER_M = 0.02;
/** Two places to stand closer together than this count as the same place (metres). */
const SAME_PLACE_M = 0.03;

/**
 * The places a server could stand to serve one guest: looking out from
 * the guest's own place at the table in eight directions, the first
 * place in each with room to stand (and that can be walked to), within
 * arm's reach and with nothing tall in between. A two-seater in the middle of the room gives one on each
 * aisle side; a four-seater against the counter, the gap beside it. The
 * server then uses whichever it can walk to soonest, which is the side
 * it is already on, never the far side of the table with the long way
 * round. `place` is where the order goes down (the table's meal spot for
 * that seat, café space). Empty if there is nowhere to stand by it.
 */
export function servePointsForPlace(nav: NavGrid, table: number, place: Vector3): ServePoint[] {
  const points: ServePoint[] = [];
  for (let k = 0; k < 8; k++) {
    const dx = Math.sin((k * Math.PI) / 4);
    const dz = Math.cos((k * Math.PI) / 4);
    for (let r = 0.015; r <= SERVE_ARM_M; r += 0.005) {
      const x = place.x + dx * r;
      const z = place.z + dz * r;
      // Nothing tall between here and the guest's place: a server does not serve over the counter, a wall or a plant.
      if (nav.heightAt(x, z) > place.y + OVER_M) break;
      if (!nav.walkable(x, z)) continue;
      const stand = new Vector3(x, nav.heightAt(x, z), z);
      if (!points.some((p) => Math.hypot(p.stand.x - x, p.stand.z - z) < SAME_PLACE_M)) points.push({ table, stand, yaw: Math.atan2(-dx, -dz), tray: place.clone() });
      break;
    }
  }
  return points;
}
