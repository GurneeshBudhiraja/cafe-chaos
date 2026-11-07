/**
 * BedSystem: let go of a puppy over the bed and it settles into the cells
 * under it, turned to the nearest quarter turn. If it would land on
 * another puppy, or hang off the edge, it nips: a yip and a hop back off
 * the bed onto the table. Pick a settled puppy up and its cells are free
 * again. When every puppy of the litter is on the bed, the level is done.
 */

import { createSystem, Euler, Grabbed, Quaternion, Vector3, type Entity } from '@iwsdk/core';
import { Puppy } from '../game-components.js';
import type { Bed } from '../game/bed.js';
import type { Level } from '../game/level.js';
import { puppyData } from '../puppies/puppy.js';
import { CELL, gridCells, snapOrigin, turnsToYaw, yawToTurns, type Vec2 } from '../puppies/shapes.js';

/** A released puppy counts as over the bed when its origin is within this of the mattress (metres). */
const EDGE_SLACK = CELL * 0.6;
/** ...and let go no higher than this over the mattress. */
const DROP_HEIGHT = 0.25;
const SETTLE_SECONDS = 0.2;
/** The hop after a nip: how long, and how far in front of the bed it lands. */
const HOP_SECONDS = 0.5;
const HOP_CLEARANCE = 0.05;

export interface LevelScore {
  placed: number;
  total: number;
  nips: number;
  complete: boolean;
  stars: number;
}

interface Settle {
  from: Vector3;
  to: Vector3;
  fromRotation: Quaternion;
  toRotation: Quaternion;
  age: number;
}

export class BedSystem extends createSystem({
  heldPuppies: { required: [Puppy, Grabbed] },
}) {
  bed: Bed | null = null;
  level: Level | null = null;
  /** Where a hopping puppy lands (the table's top, world height). */
  landingY = 0;
  nips = 0;
  onScore: ((score: LevelScore) => void) | null = null;
  onSnuggle: ((puppy: Entity) => void) | null = null;
  onNip: ((puppy: Entity) => void) | null = null;
  onPickUp: ((puppy: Entity) => void) | null = null;

  private readonly occupied = new Map<Entity, Vec2[]>();
  private readonly settles = new Map<Entity, Settle>();
  private readonly local = new Vector3();
  private readonly euler = new Euler();
  private readonly bedQuaternion = new Quaternion();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.heldPuppies.subscribe('qualify', (entity) => this.pickUp(entity)),
      this.queries.heldPuppies.subscribe('disqualify', (entity) => this.tryBed(entity)),
    );
  }

  /** Start over for a new level. */
  reset(bed: Bed | null, level: Level | null, landingY: number): void {
    this.bed = bed;
    this.level = level;
    this.landingY = landingY;
    this.occupied.clear();
    this.settles.clear();
    this.nips = 0;
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
    const total = this.level?.puppies.length ?? 0;
    const placed = this.occupied.size;
    const complete = total > 0 && placed === total;
    const stars = !complete ? 0 : this.nips === 0 ? 3 : this.nips <= 2 ? 2 : 1;
    return { placed, total, nips: this.nips, complete, stars };
  }

  /** Is a cell free (and on the bed)? */
  private free(cell: Vec2, except: Entity): boolean {
    const bed = this.bed!;
    if (cell[0] < 0 || cell[1] < 0 || cell[0] >= bed.columns || cell[1] >= bed.rows) return false;
    for (const [entity, cells] of this.occupied) {
      if (entity === except) continue;
      if (cells.some((c) => c[0] === cell[0] && c[1] === cell[1])) return false;
    }
    return true;
  }

  private pickUp(entity: Entity): void {
    const data = puppyData(entity);
    if (data) data.hop = null;
    if (this.occupied.delete(entity)) {
      entity.setValue(Puppy, 'column', -1);
      entity.setValue(Puppy, 'row', -1);
      this.onScore?.(this.score());
    }
    this.onPickUp?.(entity);
  }

  private tryBed(entity: Entity): void {
    const bed = this.bed;
    const object = entity.object3D;
    const data = puppyData(entity);
    if (!bed || !object || !data) return;
    bed.group.updateWorldMatrix(true, false);
    object.updateWorldMatrix(true, false);
    object.getWorldPosition(this.local);
    bed.group.worldToLocal(this.local);
    const overBed = Math.abs(this.local.x) <= bed.half.x + EDGE_SLACK && Math.abs(this.local.z) <= bed.half.z + EDGE_SLACK;
    const lowEnough = this.local.y >= bed.corner.y - 0.03 && this.local.y <= bed.corner.y + DROP_HEIGHT;
    if (!overBed || !lowEnough) return;

    // Which cells it would take, turned to the nearest quarter turn.
    bed.group.getWorldQuaternion(this.bedQuaternion);
    const relative = this.bedQuaternion.clone().invert().multiply(object.getWorldQuaternion(new Quaternion()));
    this.euler.setFromQuaternion(relative, 'YXZ');
    const turns = yawToTurns(this.euler.y);
    const snapped = snapOrigin(data.pose, turns, (this.local.x - bed.corner.x) / CELL, (this.local.z - bed.corner.z) / CELL);
    const cells = gridCells(data.pose, turns, snapped.gx, snapped.gz);
    const fits = cells.every((cell) => this.free(cell, entity));

    if (!fits) {
      // A nip: it hops off the front of the bed onto the table.
      this.nips++;
      const landLocal = new Vector3(Math.max(-bed.half.x, Math.min(bed.half.x, this.local.x)), 0, bed.half.z + HOP_CLEARANCE + data.radius);
      const land = bed.group.localToWorld(landLocal);
      land.y = this.landingY;
      const from = object.getWorldPosition(new Vector3());
      if (object.parent) {
        object.parent.worldToLocal(land);
        object.parent.worldToLocal(from);
      }
      data.hop = { from, to: land, age: 0, seconds: HOP_SECONDS };
      // Upright, at the quarter turn it was heading for.
      object.quaternion.copy(this.bedQuaternion).multiply(new Quaternion().setFromEuler(this.euler.set(0, turnsToYaw(turns), 0, 'YXZ')));
      this.onNip?.(entity);
      this.onScore?.(this.score());
      return;
    }

    // Settle in: origin on the snapped grid position, upright, at the quarter turn.
    const to = bed.group.localToWorld(new Vector3(bed.corner.x + snapped.gx * CELL, bed.corner.y, bed.corner.z + snapped.gz * CELL));
    if (object.parent) object.parent.worldToLocal(to);
    const toRotation = this.bedQuaternion.clone().multiply(new Quaternion().setFromEuler(this.euler.set(0, turnsToYaw(turns), 0, 'YXZ')));
    this.settles.set(entity, { from: object.position.clone(), to, fromRotation: object.quaternion.clone(), toRotation, age: 0 });
    this.occupied.set(entity, cells);
    const corner = cells.reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1])] as Vec2, [Infinity, Infinity] as Vec2);
    entity.setValue(Puppy, 'column', corner[0]);
    entity.setValue(Puppy, 'row', corner[1]);
    entity.setValue(Puppy, 'turns', turns);
    data.snuggleAge = 0;
    data.wagUntil = performance.now() / 1000 + 1.6;
    this.onSnuggle?.(entity);
    this.onScore?.(this.score());
  }
}
