/**
 * CutSystem: a held knife cuts cake pieces where its edge actually goes.
 *
 * The cut is tracked as a stroke, per knife and piece: it starts when the
 * blade's edge enters the piece (below its top, over its footprint), it
 * remembers how far along the blade's line the edge has swept, and it ends
 * when the edge leaves. When the edge reaches the board, the swept stretch
 * is compared with the chord the blade's line makes across the footprint:
 *
 * - If the sweep covers the whole chord, the piece splits in two along it.
 *   A cut across a corner takes just the corner: the chord there is short.
 * - If not (the blade stopped inside the cake), the piece is only scored:
 *   a groove on the top marks where the blade went. Grooves along the same
 *   line add up, so a cut finished in a second stroke still goes through.
 *
 * Everything is measured from where the knife is, never from what the
 * user sees, so a hand in front of the cake changes nothing.
 */

import { createSystem, Grabbed, Matrix4, Vector3, type Entity } from '@iwsdk/core';
import { CrumbSystem } from './crumb-system.js';
import { CAKE_HEIGHT } from '../cake/cake-mesh.js';
import { addGroove, pieceData, splitPiece } from '../cake/piece.js';
import { boundingRadius, chord, type Vec2 } from '../cake/polygon.js';
import { CakePiece, Knife } from '../game-components.js';
import { KNIFE_EDGE } from '../scene-assets/kitchen.scene-asset.js';

/** The blade counts as on the board when its edge is this close to the cake's base (metres). */
const BOARD_REACH = 0.006;
/** A sweep may stop this short of the footprint's outline and still cut through (metres). */
const EDGE_SLACK = 0.008;
/** After a cut, the blade must get this far from the piece (or lift out) before it can cut it again (metres). */
const CLEAR_MARGIN = 0.03;
/** Grooves within this distance and angle of the blade's line count as the same cut. */
const SAME_LINE_DISTANCE = 0.005;
const SAME_LINE_ANGLE = (8 * Math.PI) / 180;
/** Splits on the same line within this long count as one cut (a stroke through several pieces). */
const SAME_CUT_MS = 2500;
/** Scores shorter than this are not worth a groove (metres). */
const MIN_GROOVE = 0.012;
/** Crumbs fall each time the blade goes this much deeper (metres). */
const CRUMB_STEP = 0.012;
/** How far and how long the two new pieces slide apart after a cut. */
const PART_DISTANCE = 0.002;
const PART_SECONDS = 0.3;

/** A stroke in progress, in the piece's frame. */
interface Stroke {
  /** The two ends of what the edge has swept, as points (re-projected onto the current blade line). */
  sweptA: Vec2;
  sweptB: Vec2;
  lowestY: number;
  /** Set once the stroke has cut or decided not to: nothing more happens until the edge leaves. */
  spent: boolean;
  /** How deep the blade was when crumbs last fell. */
  crumbY: number;
  /** Last frame's depth and sweep length (for the cutting sound). */
  lastY: number;
  lastLength: number;
}

export class CutSystem extends createSystem({
  knives: { required: [Knife, Grabbed] },
  pieces: { required: [CakePiece] },
}) {
  /** Cuts made so far (for the score): one stroke of the knife is one cut, however many pieces it goes through. */
  cuts = 0;
  private lastCut: { at: number; p: Vector3; d: Vector3 } | null = null;
  private readonly cutP = new Vector3();
  private readonly cutD = new Vector3();
  /** Called after each cut with the two new pieces (for sounds and the like). */
  onCut: ((pieces: Entity[]) => void) | null = null;
  /** Called every frame with how fast the blade is moving through cake (m/s; 0 when it is not). */
  onCutting: ((speed: number) => void) | null = null;
  private cuttingSpeed = 0;

  private readonly strokes = new Map<Entity, Map<Entity, Stroke>>();
  private crumbs: CrumbSystem | undefined;
  private readonly crumbAt = new Vector3();
  private readonly crumbOut = new Vector3();
  private readonly edgeWorld = KNIFE_EDGE.map(() => new Vector3());
  private readonly edgeLocal = KNIFE_EDGE.map(() => new Vector3());
  private readonly toPiece = new Matrix4();
  private readonly bladeDir = new Vector3();

  init(): void {
    this.crumbs = this.world.getSystem(CrumbSystem);
  }

  update(delta: number): void {
    this.cuttingSpeed = 0;
    this.delta = delta;
    for (const knife of this.queries.knives.entities) {
      if (!knife.object3D) continue;
      knife.object3D.updateWorldMatrix(true, false);
      KNIFE_EDGE.forEach(([x, y], i) => this.edgeWorld[i].set(x, y, 0).applyMatrix4(knife.object3D!.matrixWorld));
      let strokes = this.strokes.get(knife);
      if (!strokes) this.strokes.set(knife, (strokes = new Map()));
      for (const piece of [...this.queries.pieces.entities]) this.track(knife, piece, strokes);
    }
    for (const piece of this.queries.pieces.entities) this.part(piece, delta);
    this.onCutting?.(this.cuttingSpeed);
  }
  private delta = 1 / 60;

  /** Follow the edge through one piece this frame. */
  private track(knife: Entity, piece: Entity, strokes: Map<Entity, Stroke>): void {
    const object = piece.object3D;
    const data = pieceData(piece);
    if (!object || !data || piece.hasComponent(Grabbed) || (piece.getValue(CakePiece, 'cell') ?? -1) >= 0) {
      strokes.delete(piece);
      return;
    }
    object.updateWorldMatrix(true, false);
    this.toPiece.copy(object.matrixWorld).invert();
    const reach = boundingRadius(data.polygon) + 0.02;
    // The blade's line across the piece: along the knife's +X, flattened.
    this.bladeDir.set(1, 0, 0).transformDirection(knife.object3D!.matrixWorld).transformDirection(this.toPiece).setY(0);
    if (this.bladeDir.lengthSq() < 1e-4) return;
    this.bladeDir.normalize();
    const d: Vec2 = [this.bladeDir.x, this.bladeDir.z];

    // The edge in the piece's frame, and the stretch of it that is down in
    // the cake (below the top): the edge is a continuous line from heel to
    // tip, so where it crosses the top plane counts too.
    for (let i = 0; i < KNIFE_EDGE.length; i++) this.edgeLocal[i].copy(this.edgeWorld[i]).applyMatrix4(this.toPiece);
    const anchor = this.edgeLocal[0];
    const ax = anchor.x;
    const az = anchor.z;
    const along = (p: Vector3) => (p.x - ax) * d[0] + (p.z - az) * d[1];
    let tMin = Infinity;
    let tMax = -Infinity;
    let lowestY = Infinity;
    for (let i = 0; i < KNIFE_EDGE.length; i++) {
      const p = this.edgeLocal[i];
      if (p.y <= CAKE_HEIGHT) {
        tMin = Math.min(tMin, along(p));
        tMax = Math.max(tMax, along(p));
        lowestY = Math.min(lowestY, p.y);
      }
      const q = this.edgeLocal[i + 1];
      if (q && (p.y <= CAKE_HEIGHT) !== (q.y <= CAKE_HEIGHT)) {
        const f = (CAKE_HEIGHT - p.y) / (q.y - p.y);
        const t = along(p) + (along(q) - along(p)) * f;
        tMin = Math.min(tMin, t);
        tMax = Math.max(tMax, t);
      }
    }
    // Is that stretch over the cake at all? Where the blade's line crosses the footprint...
    const range = tMin <= tMax && lowestY > -0.05 && Math.hypot(ax, az) < reach + 0.3 ? chord(data.polygon, [ax, az], d) : null;
    // ...and the sweep this frame is the edge's stretch clipped to it.
    const inside = !!range && tMax >= range[0] - EDGE_SLACK && tMin <= range[1] + EDGE_SLACK;

    const stroke = strokes.get(piece);
    if (stroke?.spent) {
      // A stroke that has cut stays spent until the blade is well clear of the
      // piece (the fresh pieces slide apart, which would otherwise look like
      // the blade leaving and coming back).
      const lifted = tMin > tMax;
      const past = !!range && (tMax < range[0] - CLEAR_MARGIN || tMin > range[1] + CLEAR_MARGIN);
      // The blade's line is away from the piece: every corner is on one side of it, by a margin.
      let near = -Infinity;
      let far = Infinity;
      for (const [x, z] of data.polygon) {
        const side = (x - ax) * -d[1] + (z - az) * d[0];
        near = Math.max(near, side);
        far = Math.min(far, side);
      }
      const aside = near < -CLEAR_MARGIN || far > CLEAR_MARGIN;
      if (lifted || past || aside) strokes.delete(piece);
      return;
    }
    if (!inside || !range) {
      if (stroke) {
        strokes.delete(piece);
        this.score(piece, stroke);
      }
      return;
    }
    tMin = Math.max(tMin, range[0]);
    tMax = Math.min(tMax, range[1]);
    const sweptA: Vec2 = [ax + d[0] * tMin, az + d[1] * tMin];
    const sweptB: Vec2 = [ax + d[0] * tMax, az + d[1] * tMax];
    if (!stroke) {
      strokes.set(piece, { sweptA, sweptB, lowestY, spent: false, crumbY: CAKE_HEIGHT, lastY: lowestY, lastLength: tMax - tMin });
      return;
    }
    // Grow the sweep: the old ends, re-projected onto this frame's line.
    const project = ([x, z]: Vec2) => (x - ax) * d[0] + (z - az) * d[1];
    const lo = Math.min(tMin, project(stroke.sweptA), project(stroke.sweptB));
    const hi = Math.max(tMax, project(stroke.sweptA), project(stroke.sweptB));
    // How much the blade moved in the cake this frame (down, or along the cut).
    const moved = Math.abs(lowestY - stroke.lastY) + Math.abs(hi - lo - stroke.lastLength) * 0.5;
    stroke.lastY = lowestY;
    stroke.lastLength = hi - lo;
    if (lowestY < CAKE_HEIGHT - 0.003) this.cuttingSpeed = Math.max(this.cuttingSpeed, moved / Math.max(this.delta, 1e-3));
    stroke.sweptA = [ax + d[0] * lo, az + d[1] * lo];
    stroke.sweptB = [ax + d[0] * hi, az + d[1] * hi];
    stroke.lowestY = Math.min(stroke.lowestY, lowestY);
    // Every few millimetres deeper, a few crumbs shake loose where the blade enters the top.
    if (stroke.crumbY - lowestY > CRUMB_STEP) {
      stroke.crumbY = lowestY;
      this.shedCrumbs(object, stroke, d, 4);
    }
    if (stroke.lowestY > BOARD_REACH) return;

    // On the board: does the sweep (plus earlier grooves on this line) cover the chord?
    let coveredLo = lo;
    let coveredHi = hi;
    for (const [g0, g1] of data.grooves) {
      if (!this.sameLine(g0, g1, [ax, az], d)) continue;
      coveredLo = Math.min(coveredLo, project(g0), project(g1));
      coveredHi = Math.max(coveredHi, project(g0), project(g1));
    }
    if (coveredLo > range[0] + EDGE_SLACK || coveredHi < range[1] - EDGE_SLACK) return;
    stroke.spent = true;
    strokes.delete(piece);
    // The blade's line in the world, to tell one stroke's cuts from a new one's.
    this.cutP.set(ax, 0, az).applyMatrix4(object.matrixWorld);
    this.cutD.set(d[0], 0, d[1]).transformDirection(object.matrixWorld);
    const pieces = splitPiece(this.world, piece, [ax, az], d);
    if (pieces.length) {
      const now = performance.now();
      const last = this.lastCut;
      const sameStroke =
        !!last &&
        now - last.at < SAME_CUT_MS &&
        Math.abs(last.d.dot(this.cutD)) > Math.cos(SAME_LINE_ANGLE) &&
        Math.abs(this.cutP.clone().sub(last.p).cross(this.cutD).y) < SAME_LINE_DISTANCE;
      if (!sameStroke) this.cuts++;
      this.lastCut = { at: now, p: this.cutP.clone(), d: this.cutD.clone() };
      // The new pieces are in the blade's path: no new stroke on them until the edge leaves.
      for (const p of pieces) strokes.set(p, { sweptA, sweptB, lowestY, spent: true, crumbY: 0, lastY: lowestY, lastLength: 0 });
      this.shedCrumbs(object, stroke, d, 18, true);
      this.onCut?.(pieces);
    }
  }

  /** Crumbs along the blade's sweep: at the top while cutting, at the base when it goes through. */
  private shedCrumbs(object: NonNullable<Entity['object3D']>, stroke: Stroke, d: Vec2, count: number, atBase = false): void {
    if (!this.crumbs) return;
    const floorY = object.getWorldPosition(this.crumbAt).y;
    this.crumbOut.set(-d[1], 0, d[0]).transformDirection(object.matrixWorld);
    for (let k = 0; k < count; k++) {
      const t = Math.random();
      const x = stroke.sweptA[0] + (stroke.sweptB[0] - stroke.sweptA[0]) * t;
      const z = stroke.sweptA[1] + (stroke.sweptB[1] - stroke.sweptA[1]) * t;
      this.crumbAt.set(x, atBase ? 0.004 : CAKE_HEIGHT, z);
      object.localToWorld(this.crumbAt);
      this.crumbs.emit(this.crumbAt, this.crumbOut, 1, floorY, atBase ? 0.22 : 0.1);
    }
  }

  /** A stroke that ended without cutting through leaves a groove where it went. */
  private score(piece: Entity, stroke: Stroke): void {
    const data = pieceData(piece);
    if (!data) return;
    const length = Math.hypot(stroke.sweptB[0] - stroke.sweptA[0], stroke.sweptB[1] - stroke.sweptA[1]);
    // Only a blade that went deep enough to mark the top, and far enough to show.
    if (stroke.lowestY > CAKE_HEIGHT - 0.004 || length < MIN_GROOVE) return;
    addGroove(piece, [stroke.sweptA, stroke.sweptB]);
  }

  private sameLine(g0: Vec2, g1: Vec2, p: Vec2, d: Vec2): boolean {
    const gx = g1[0] - g0[0];
    const gz = g1[1] - g0[1];
    const len = Math.hypot(gx, gz);
    if (len < 1e-6) return false;
    const cos = Math.abs((gx * d[0] + gz * d[1]) / len);
    if (cos < Math.cos(SAME_LINE_ANGLE)) return false;
    // Distance of the groove's midpoint from the blade's line.
    const mx = (g0[0] + g1[0]) / 2 - p[0];
    const mz = (g0[1] + g1[1]) / 2 - p[1];
    return Math.abs(mx * -d[1] + mz * d[0]) < SAME_LINE_DISTANCE;
  }

  /** Fresh pieces slide a little apart, off the blade. */
  private part(piece: Entity, delta: number): void {
    const age = piece.getValue(CakePiece, 'age') ?? 10;
    if (age > PART_SECONDS) return;
    const data = pieceData(piece);
    const object = piece.object3D;
    if (!data?.nudge || !data.origin || !object || piece.hasComponent(Grabbed)) return;
    const next = Math.min(PART_SECONDS, age + delta);
    piece.setValue(CakePiece, 'age', next);
    const t = next / PART_SECONDS;
    object.position.copy(data.origin).addScaledVector(data.nudge, PART_DISTANCE * (1 - (1 - t) ** 2));
  }
}
