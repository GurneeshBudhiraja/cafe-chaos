/**
 * RestSystem: let go of a puppy and it settles on what is under it (the
 * blanket, the table top, the bed's mattress or the floor), upright,
 * keeping its heading. No physics engine: a short fall, then it rests.
 * Puppies dropped onto the bed's cells are the bed's business (see
 * BedSystem), which claims them first.
 */

import { createSystem, Euler, Grabbed, Quaternion, Vector3, type Entity } from '@iwsdk/core';
import { Puppy } from '../game-components.js';
import { puppyData } from '../puppies/puppy.js';
import { BLANKET_CENTRE, BLANKET_SIZE, BLANKET_THICKNESS, TABLE_SIZE, TABLE_TOP_Y } from '../scene-assets/furniture.scene-asset.js';

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
  heldPuppies: { required: [Puppy, Grabbed] },
}) {
  /** Things standing on the table that puppies can land on (the bed's mattress). */
  extraSurfaces: RestSurface[] = [];
  private readonly drops = new Map<Entity, Drop>();
  /** Released this frame: dropped next frame, unless the bed claims them first. */
  private readonly released: Entity[] = [];
  private readonly local = new Vector3();
  private readonly euler = new Euler();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.heldPuppies.subscribe('qualify', (entity) => this.drops.delete(entity)),
      this.queries.heldPuppies.subscribe('disqualify', (entity) => this.released.push(entity)),
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
    const data = puppyData(entity);
    if (!object || !data || entity.hasComponent(Grabbed)) return;
    // A puppy the bed has taken, or sent hopping, is the bed's business.
    if ((entity.getValue(Puppy, 'column') ?? -1) >= 0 || data.hop) return;
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

  /** The height of what is under a world point: an extra surface, the blanket, the table top or the floor. */
  surfaceUnder(point: Vector3): number {
    for (const s of this.extraSurfaces) {
      if (point.y >= s.y - 0.02 && Math.abs(point.x - s.centre.x) < s.halfX && Math.abs(point.z - s.centre.z) < s.halfZ) return s.y;
    }
    const table = this.world.getSceneObject(TABLE_NODE);
    if (!table) return 0;
    table.worldToLocal(this.local.copy(point));
    const onBlanket =
      Math.abs(this.local.x - BLANKET_CENTRE.x) < BLANKET_SIZE.width / 2 && Math.abs(this.local.z - BLANKET_CENTRE.z) < BLANKET_SIZE.depth / 2;
    const onTable = Math.abs(this.local.x) < TABLE_SIZE.width / 2 && Math.abs(this.local.z) < TABLE_SIZE.depth / 2;
    if (onBlanket && this.local.y > TABLE_TOP_Y) return TABLE_TOP_Y + BLANKET_THICKNESS;
    if (onTable && this.local.y > TABLE_TOP_Y - 0.05) return TABLE_TOP_Y;
    return 0;
  }
}
