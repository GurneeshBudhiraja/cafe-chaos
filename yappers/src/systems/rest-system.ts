/**
 * RestSystem: let go of a Yapper away from a seat and it lands on what is
 * under it (the pavement, the table top, the bus's floor or the floor),
 * upright, keeping its heading. No physics engine: a short fall, then it
 * stands. Yappers let go over a seat are the seat system's business, which
 * claims them first.
 */

import { createSystem, Euler, Grabbed, Quaternion, Vector3, type Entity } from '@iwsdk/core';
import { Yapper } from '../game-components.js';
import { STOP_CENTRE, STOP_SIZE, STOP_THICKNESS, TABLE_SIZE, TABLE_TOP_Y } from '../scene-assets/furniture.scene-asset.js';
import { yapperData } from '../yappers/yapper.js';

const TABLE_NODE = 'table';

/** A flat rectangle something can land on: world centre, half size and top height. */
export interface RestSurface {
  centre: Vector3;
  halfX: number;
  halfZ: number;
  y: number;
}

interface Drop {
  from: Vector3;
  to: Vector3;
  fromRotation: Quaternion;
  toRotation: Quaternion;
  seconds: number;
  age: number;
}

export class RestSystem extends createSystem({
  heldYappers: { required: [Yapper, Grabbed] },
}) {
  /** Things standing on the table that Yappers can land on (the bus's floor). */
  extraSurfaces: RestSurface[] = [];
  private readonly drops = new Map<Entity, Drop>();
  /** Released this frame: dropped next frame, unless a seat claims them first. */
  private readonly released: Entity[] = [];
  private readonly local = new Vector3();
  private readonly euler = new Euler();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.heldYappers.subscribe('qualify', (entity) => this.drops.delete(entity)),
      this.queries.heldYappers.subscribe('disqualify', (entity) => this.released.push(entity)),
    );
  }

  update(delta: number): void {
    for (const entity of this.released.splice(0)) this.startDrop(entity);
    for (const [entity, drop] of this.drops) {
      const object = entity.object3D;
      if (!object || entity.hasComponent(Grabbed)) {
        this.drops.delete(entity);
        continue;
      }
      drop.age += delta;
      const t = Math.min(1, drop.age / drop.seconds);
      // Falls (speeding up), turning upright as it goes.
      object.position.lerpVectors(drop.from, drop.to, t * t);
      object.quaternion.slerpQuaternions(drop.fromRotation, drop.toRotation, Math.min(1, t * 1.4));
      if (t >= 1) this.drops.delete(entity);
    }
  }

  private startDrop(entity: Entity): void {
    const object = entity.object3D;
    const data = yapperData(entity);
    if (!object || !data || entity.hasComponent(Grabbed)) return;
    // A Yapper that took a seat, or was bounced off one, is the seat system's business.
    if (data.seated || data.hop) return;
    const from = object.position.clone();
    const surfaceY = this.surfaceUnder(object.getWorldPosition(new Vector3()));
    const to = from.clone().setY(surfaceY);
    this.euler.setFromQuaternion(object.quaternion, 'YXZ');
    const toRotation = new Quaternion().setFromEuler(this.euler.set(0, this.euler.y, 0, 'YXZ'));
    const height = Math.max(0, from.y - to.y);
    this.drops.set(entity, {
      from,
      to,
      fromRotation: object.quaternion.clone(),
      toRotation,
      seconds: Math.max(0.12, Math.sqrt((2 * height) / 9.8)),
      age: 0,
    });
  }

  /** The height of what is under a world point: an extra surface, the pavement, the table top or the floor. */
  surfaceUnder(point: Vector3): number {
    for (const s of this.extraSurfaces) {
      if (point.y >= s.y - 0.02 && Math.abs(point.x - s.centre.x) < s.halfX && Math.abs(point.z - s.centre.z) < s.halfZ) return s.y;
    }
    const table = this.world.getSceneObject(TABLE_NODE);
    if (!table) return 0;
    table.worldToLocal(this.local.copy(point));
    const onPavement = Math.abs(this.local.x - STOP_CENTRE.x) < STOP_SIZE.width / 2 && Math.abs(this.local.z - STOP_CENTRE.z) < STOP_SIZE.depth / 2;
    const onTable = Math.abs(this.local.x) < TABLE_SIZE.width / 2 && Math.abs(this.local.z) < TABLE_SIZE.depth / 2;
    if (onPavement && this.local.y > TABLE_TOP_Y) return TABLE_TOP_Y + STOP_THICKNESS;
    if (onTable && this.local.y > TABLE_TOP_Y - 0.05) return TABLE_TOP_Y;
    return 0;
  }
}
