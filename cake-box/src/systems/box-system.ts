
/**
 * BoxSystem: let go of a cake piece over a cell of the box and it settles
 * into the cell, and the cell's card says how well it fits its shape.
 * Pick it back up and the cell is free again. When every cell is filled,
 * the level is scored.
 *
 * The fit is the overlap of the piece's footprint with the card's shape
 * (intersection over union), turned the way the player placed it, with a
 * few degrees of forgiveness.
 */

import { createSystem, Euler, Grabbed, Quaternion, Vector3, type Entity } from '@iwsdk/core';
import { pieceData } from '../cake/piece.js';
import { iou } from '../cake/polygon.js';
import { CakePiece } from '../game-components.js';
import { BOX_FLOOR, type CakeBox } from '../game/box.js';
import { fitOnCard, type Level } from '../game/level.js';

/** A released piece whose centroid is over a cell, give or take this much, drops into it (metres). */
const CELL_SLACK = 0.015;
/** ...if it is let go no higher than this over the box floor (metres). */
const DROP_HEIGHT = 0.2;
const SETTLE_SECONDS = 0.18;

export interface LevelScore {
  /** Per cell: the fit of the piece in it, or null when empty. */
  fits: (number | null)[];
  complete: boolean;
  stars: number;
}

interface Settle {
  entity: Entity;
  from: Vector3;
  to: Vector3;
  fromRotation: Quaternion;
  toRotation: Quaternion;
  age: number;
}

export class BoxSystem extends createSystem({
  heldPieces: { required: [CakePiece, Grabbed] },
}) {
  box: CakeBox | null = null;
  level: Level | null = null;
  /** Cuts made in this level (the game sets it from the cut system). */
  cutsMade = () => 0;
  onScore: ((score: LevelScore) => void) | null = null;
  onSnap: ((cell: number, fit: number) => void) | null = null;

  private readonly occupants = new Map<number, Entity>();
  private readonly settles = new Map<Entity, Settle>();
  private readonly local = new Vector3();
  private readonly euler = new Euler();
  private readonly boxQuaternion = new Quaternion();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.heldPieces.subscribe('qualify', (entity) => this.takeOut(entity)),
      this.queries.heldPieces.subscribe('disqualify', (entity) => this.tryDrop(entity)),
    );
  }

  /** Start over for a new level. */
  reset(box: CakeBox | null, level: Level | null): void {
    this.box = box;
    this.level = level;
    this.occupants.clear();
    this.settles.clear();
  }

  update(delta: number): void {
    for (const [entity, settle] of this.settles) {
      const object = entity.object3D;
      if (!object || entity.hasComponent(Grabbed)) {
        this.settles.delete(entity);
        continue;
      }
      settle.age += delta;
      const t = Math.min(1, settle.age / SETTLE_SECONDS);
      const e = 1 - (1 - t) ** 3;
      object.position.lerpVectors(settle.from, settle.to, e);
      object.quaternion.slerpQuaternions(settle.fromRotation, settle.toRotation, e);
      if (t >= 1) this.settles.delete(entity);
    }
  }

  score(): LevelScore {
    const level = this.level;
    const fits = (level?.cards ?? []).map((_, i) => {
      const occupant = this.occupants.get(i);
      return occupant ? ((occupant.object3D?.userData.fit as number | undefined) ?? null) : null;
    });
    const complete = !!level && fits.every((f) => f !== null);
    let stars = 0;
    if (complete) {
      const values = fits as number[];
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      // Par is the number of cuts the level was made with.
      const par = level.cuts.length;
      if (values.every((f) => f >= 0.85) && this.cutsMade() <= par) stars = 3;
      else if (mean >= 0.75) stars = 2;
      else stars = 1;
    }
    return { fits, complete, stars };
  }

  private takeOut(entity: Entity): void {
    const cell = entity.getValue(CakePiece, 'cell') ?? -1;
    if (cell < 0) return;
    entity.setValue(CakePiece, 'cell', -1);
    if (this.occupants.get(cell) === entity) this.occupants.delete(cell);
    if (entity.object3D) delete entity.object3D.userData.fit;
    this.box?.showFit(cell, null);
    this.onScore?.(this.score());
  }

  private tryDrop(entity: Entity): void {
    const box = this.box;
    const level = this.level;
    const object = entity.object3D;
    const data = pieceData(entity);
    if (!box || !level || !object || !data) return;
    box.group.updateWorldMatrix(true, false);
    object.updateWorldMatrix(true, false);
    object.getWorldPosition(this.local);
    box.group.worldToLocal(this.local);
    if (this.local.y < BOX_FLOOR - 0.03 || this.local.y > BOX_FLOOR + DROP_HEIGHT) return;
    // The free cell it is over (the nearest centre, when it is over one at all).
    let best = -1;
    let bestDistance = Infinity;
    box.cells.forEach(({ cell, centre }, index) => {
      if (this.occupants.has(index)) return;
      if (Math.abs(this.local.x - cell.x) > cell.width / 2 + CELL_SLACK || Math.abs(this.local.z - cell.z) > cell.depth / 2 + CELL_SLACK) return;
      const distance = Math.hypot(this.local.x - centre.x, this.local.z - centre.z);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    if (best < 0) return;
    const cell = box.cells[best];

    // The piece's yaw relative to the box, and the fit at (about) that yaw.
    box.group.getWorldQuaternion(this.boxQuaternion);
    const relative = this.boxQuaternion.clone().invert().multiply(object.getWorldQuaternion(new Quaternion()));
    this.euler.setFromQuaternion(relative, 'YXZ');
    const { fit, yaw } = fitOnCard(data.polygon, cell.card, this.euler.y, iou);
    object.userData.fit = fit;
    entity.setValue(CakePiece, 'cell', best);
    this.occupants.set(best, entity);

    // Settle onto the cell: upright, centred, at the forgiving yaw.
    const to = box.group.localToWorld(cell.centre.clone());
    if (object.parent) object.parent.worldToLocal(to);
    const toRotation = this.boxQuaternion.clone().multiply(new Quaternion().setFromEuler(this.euler.set(0, yaw, 0, 'YXZ')));
    this.settles.set(entity, { entity, from: object.position.clone(), to, fromRotation: object.quaternion.clone(), toRotation, age: 0 });
    box.showFit(best, fit);
    this.onSnap?.(best, fit);
    this.onScore?.(this.score());
  }
}
