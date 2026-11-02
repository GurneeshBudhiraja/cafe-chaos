/**
 * KnifeRestSystem: let go of the knife and it drops onto what is under it
 * (the cutting board, the table or the floor) and lies flat there, blade
 * pointing the way it pointed. No physics engine: a short fall.
 */

import { createSystem, Euler, Grabbed, Quaternion, Vector3, type Entity } from '@iwsdk/core';
import { Knife } from '../kitchen-components.js';
import { BOARD_SIZE, BOARD_THICKNESS, TABLE_SIZE, TABLE_TOP_Y } from '../scene-assets/kitchen.scene-asset.js';

const TABLE_NODE = 'side-table';
/** The knife's handle is this thick: lying flat, its centre is this high over the surface (metres). */
const LYING_HALF_THICKNESS = 0.0095;

interface Drop {
  entity: Entity;
  from: Vector3;
  to: Vector3;
  fromRotation: Quaternion;
  toRotation: Quaternion;
  seconds: number;
  age: number;
}

export class KnifeRestSystem extends createSystem({
  held: { required: [Knife, Grabbed] },
}) {
  private drop: Drop | null = null;
  private readonly local = new Vector3();
  private readonly blade = new Vector3();
  private readonly euler = new Euler();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', () => (this.drop = null)),
      this.queries.held.subscribe('disqualify', (entity) => this.startDrop(entity)),
    );
  }

  update(delta: number): void {
    const drop = this.drop;
    const object = drop?.entity.object3D;
    if (!drop || !object) return;
    drop.age += delta;
    const t = Math.min(1, drop.age / drop.seconds);
    // Falls (speeding up), turning flat as it goes.
    object.position.lerpVectors(drop.from, drop.to, t * t);
    object.quaternion.slerpQuaternions(drop.fromRotation, drop.toRotation, Math.min(1, t * 1.4));
    if (t >= 1) this.drop = null;
  }

  private startDrop(entity: Entity): void {
    const object = entity.object3D;
    if (!object) return;
    const from = object.position.clone();
    const surfaceY = this.surfaceUnder(object.getWorldPosition(new Vector3()));
    const to = from.clone().setY(surfaceY + LYING_HALF_THICKNESS);
    // Flat on its side, the blade pointing (in plan) the way it points now.
    this.blade.set(1, 0, 0).applyQuaternion(object.quaternion).setY(0);
    const yaw = this.blade.lengthSq() > 1e-4 ? Math.atan2(-this.blade.z, this.blade.x) : 0;
    const toRotation = new Quaternion().setFromEuler(this.euler.set(-Math.PI / 2, 0, yaw));
    const height = Math.max(0, from.y - to.y);
    this.drop = {
      entity,
      from,
      to,
      fromRotation: object.quaternion.clone(),
      toRotation,
      seconds: Math.max(0.12, Math.sqrt((2 * height) / 9.8)),
      age: 0,
    };
  }

  /** The height of what is under a world point: the board, the table top or the floor. */
  private surfaceUnder(point: Vector3): number {
    const table = this.world.getSceneObject(TABLE_NODE);
    if (!table) return 0;
    table.worldToLocal(this.local.copy(point));
    const onBoard = Math.abs(this.local.x) < BOARD_SIZE.width / 2 && Math.abs(this.local.z) < BOARD_SIZE.depth / 2;
    const onTable = Math.abs(this.local.x) < TABLE_SIZE.width / 2 && Math.abs(this.local.z) < TABLE_SIZE.depth / 2;
    if (onBoard && this.local.y > TABLE_TOP_Y) return TABLE_TOP_Y + BOARD_THICKNESS;
    if (onTable && this.local.y > TABLE_TOP_Y - 0.05) return TABLE_TOP_Y;
    return 0;
  }
}
