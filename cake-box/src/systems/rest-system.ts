/**
 * RestSystem: let go of something and it settles on what is under it (the
 * cutting board, the counter top or the floor). No physics engine: a short
 * fall, then it rests.
 *
 * - The knife lies flat on its side, blade pointing the way it pointed.
 * - A cake piece lands upright, keeping its yaw. Pieces dropped into the
 *   box are the box's business (see BoxSystem), which claims them first.
 */

import { createSystem, Euler, Grabbed, Quaternion, Vector3, type Entity } from '@iwsdk/core';
import { CakePiece, Knife } from '../game-components.js';
import { BOARD_CENTRE, BOARD_SIZE, BOARD_THICKNESS, COUNTER_SIZE, COUNTER_TOP_Y } from '../scene-assets/kitchen.scene-asset.js';

const COUNTER_NODE = 'counter';
/** The knife's handle is this thick: lying flat, its centre is this high over the surface (metres). */
const KNIFE_HALF_THICKNESS = 0.0095;

interface Drop {
  entity: Entity;
  from: Vector3;
  to: Vector3;
  fromRotation: Quaternion;
  toRotation: Quaternion;
  seconds: number;
  age: number;
}

export class RestSystem extends createSystem({
  heldKnives: { required: [Knife, Grabbed] },
  heldPieces: { required: [CakePiece, Grabbed] },
}) {
  private readonly drops = new Map<Entity, Drop>();
  /** Released this frame: dropped next frame, unless something (the box) claims them first. */
  private readonly released: Entity[] = [];
  private readonly local = new Vector3();
  private readonly blade = new Vector3();
  private readonly euler = new Euler();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.heldKnives.subscribe('qualify', (entity) => this.drops.delete(entity)),
      this.queries.heldPieces.subscribe('qualify', (entity) => this.drops.delete(entity)),
      this.queries.heldKnives.subscribe('disqualify', (entity) => this.released.push(entity)),
      this.queries.heldPieces.subscribe('disqualify', (entity) => this.released.push(entity)),
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
      // Falls (speeding up), turning to rest as it goes.
      object.position.lerpVectors(drop.from, drop.to, t * t);
      object.quaternion.slerpQuaternions(drop.fromRotation, drop.toRotation, Math.min(1, t * 1.4));
      if (t >= 1) this.drops.delete(entity);
    }
  }

  private startDrop(entity: Entity): void {
    const object = entity.object3D;
    if (!object || entity.hasComponent(Grabbed)) return;
    const isKnife = entity.hasComponent(Knife);
    // A piece the box has taken rests there instead.
    if (!isKnife && (entity.getValue(CakePiece, 'cell') ?? -1) >= 0) return;
    const from = object.position.clone();
    const surfaceY = this.surfaceUnder(object.getWorldPosition(new Vector3()));
    const to = from.clone().setY(surfaceY + (isKnife ? KNIFE_HALF_THICKNESS : 0));
    let toRotation: Quaternion;
    if (isKnife) {
      // Flat on its side, the blade pointing (in plan) the way it points now.
      this.blade.set(1, 0, 0).applyQuaternion(object.quaternion).setY(0);
      const yaw = this.blade.lengthSq() > 1e-4 ? Math.atan2(-this.blade.z, this.blade.x) : 0;
      toRotation = new Quaternion().setFromEuler(this.euler.set(-Math.PI / 2, 0, yaw));
    } else {
      // Upright, keeping its heading.
      this.euler.setFromQuaternion(object.quaternion, 'YXZ');
      toRotation = new Quaternion().setFromEuler(this.euler.set(0, this.euler.y, 0, 'YXZ'));
    }
    const height = Math.max(0, from.y - to.y);
    this.drops.set(entity, {
      entity,
      from,
      to,
      fromRotation: object.quaternion.clone(),
      toRotation,
      seconds: Math.max(0.12, Math.sqrt((2 * height) / 9.8)),
      age: 0,
    });
  }

  /** The height of what is under a world point: the board, the counter top or the floor. */
  surfaceUnder(point: Vector3): number {
    const counter = this.world.getSceneObject(COUNTER_NODE);
    if (!counter) return 0;
    counter.worldToLocal(this.local.copy(point));
    const onBoard =
      Math.abs(this.local.x - BOARD_CENTRE.x) < BOARD_SIZE.width / 2 && Math.abs(this.local.z - BOARD_CENTRE.z) < BOARD_SIZE.depth / 2;
    const onCounter = Math.abs(this.local.x) < COUNTER_SIZE.width / 2 && Math.abs(this.local.z) < COUNTER_SIZE.depth / 2;
    if (onBoard && this.local.y > COUNTER_TOP_Y) return COUNTER_TOP_Y + BOARD_THICKNESS;
    if (onCounter && this.local.y > COUNTER_TOP_Y - 0.05) return COUNTER_TOP_Y;
    return 0;
  }
}
