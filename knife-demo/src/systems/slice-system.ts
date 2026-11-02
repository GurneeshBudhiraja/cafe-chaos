/**
 * SliceSystem: a held knife cuts an apple in two when its edge slices down
 * through it, the way you would cut one on a board.
 *
 * The test, per Sliceable: the knife arms once its edge is above the apple
 * (and over it), and cuts when the armed edge then goes down past the
 * apple's middle within its outline. The cut runs through the apple's
 * centre in the blade's plane (upright: the apple stands on the board).
 * The apple is swapped for two halves that part on the blade and tip over
 * onto their backs, cut faces up, with a little spray of juice.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  createSystem,
  Grabbed,
  Group,
  Points,
  PointsMaterial,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { AppleHalf, JuiceSpray, Knife, Sliceable } from '../kitchen-components.js';
import { BOARD_THICKNESS, KNIFE_EDGE, TABLE_TOP_Y } from '../scene-assets/kitchen.scene-asset.js';
import { createAppleHalf } from '../slicing/apple-half.js';

/** How far the halves tip over (radians), and how long the fall takes (seconds). */
const TIP_ANGLE = (76 * Math.PI) / 180;
const FALL_S = 0.42;
/** How far each half slides off the blade (metres). */
const PART_M = 0.012;
/** The pivot each half tips around: its outer bottom edge, in the apple's frame (metres). */
const PIVOT = { x: 0.026, y: -0.034 };
const DROPS = 22;
const JUICE_S = 1.1;
const GRAVITY = 9.8;

export class SliceSystem extends createSystem({
  knives: { required: [Knife] },
  sliceables: { required: [Sliceable] },
  halves: { required: [AppleHalf] },
  sprays: { required: [JuiceSpray] },
}) {
  private readonly edge = KNIFE_EDGE.map(() => new Vector3());
  private readonly centre = new Vector3();
  private readonly normal = new Vector3();
  /** Per sliceable: whether the edge has been above it since it last left. */
  private readonly armed = new WeakMap<Entity, boolean>();

  update(delta: number): void {
    for (const knife of this.queries.knives.entities) {
      if (!knife.hasComponent(Grabbed) || !knife.object3D) continue;
      knife.object3D.updateWorldMatrix(true, false);
      KNIFE_EDGE.forEach(([x, y], i) => this.edge[i].set(x, y, 0).applyMatrix4(knife.object3D!.matrixWorld));
      for (const target of this.queries.sliceables.entities) this.testCut(knife, target);
    }
    for (const half of this.queries.halves.entities) this.animateHalf(half, delta);
    for (const spray of this.queries.sprays.entities) this.animateSpray(spray, delta);
  }

  // ------------------------------------------------------------- the cut

  private testCut(knife: Entity, target: Entity): void {
    const object = target.object3D;
    if (!object?.visible) return;
    const radius = target.getValue(Sliceable, 'radius') ?? 0.042;
    object.getWorldPosition(this.centre);
    let over = false;
    let above = true;
    let through = false;
    for (const p of this.edge) {
      const across = Math.hypot(p.x - this.centre.x, p.z - this.centre.z);
      if (across < radius * 1.2) over = true;
      if (across < radius * 1.2 && p.y < this.centre.y + radius) above = false;
      if (across < radius * 0.75 && p.y < this.centre.y) through = true;
    }
    if (!over) {
      this.armed.set(target, false);
      return;
    }
    if (above) this.armed.set(target, true);
    else if (through && this.armed.get(target)) this.cut(knife, target, radius);
  }

  private cut(knife: Entity, target: Entity, radius: number): void {
    const apple = target.object3D!;
    // The blade's plane: the knife's flat side, upright.
    this.normal.set(0, 0, 1).transformDirection(knife.object3D!.matrixWorld).setY(0);
    if (this.normal.lengthSq() < 1e-4) this.normal.set(1, 0, 0);
    this.normal.normalize();
    // Yaw that turns the apple frame's +X onto that normal.
    const yaw = Math.atan2(-this.normal.z, this.normal.x);
    const centre = apple.getWorldPosition(new Vector3());
    apple.visible = false;
    target.removeComponent(Sliceable);

    for (const side of [1, -1]) {
      const pivot = new Group();
      pivot.name = side > 0 ? 'AppleHalfA' : 'AppleHalfB';
      const half = createAppleHalf(side > 0);
      // The other half is the same shape turned round to the -X side.
      if (side < 0) half.rotation.y = Math.PI;
      half.position.set(-side * PIVOT.x, -PIVOT.y, 0);
      pivot.add(half);
      pivot.rotation.set(0, yaw, 0);
      pivot.position.set(side * PIVOT.x, PIVOT.y, 0).applyEuler(pivot.rotation).add(centre);
      pivot.userData.origin = pivot.position.clone();
      pivot.userData.out = this.normal.clone().multiplyScalar(side);
      const entity = this.world.createTransformEntity(pivot);
      entity.addComponent(AppleHalf, { side, age: 0 });
    }
    this.spray(centre, radius);
  }

  /** Part from the blade, then tip outward onto the back, cut face up (a little bounce at the end). */
  private animateHalf(entity: Entity, delta: number): void {
    const pivot = entity.object3D;
    if (!pivot) return;
    const age = (entity.getValue(AppleHalf, 'age') ?? 0) + delta;
    entity.setValue(AppleHalf, 'age', age);
    if (age > FALL_S + 0.6) return;
    const side = entity.getValue(AppleHalf, 'side') ?? 1;
    const part = Math.min(1, age / 0.12);
    const fall = Math.min(1, age / FALL_S);
    let angle = TIP_ANGLE * fall * fall;
    if (age > FALL_S) {
      const t = age - FALL_S;
      angle -= 0.12 * Math.exp(-9 * t) * Math.abs(Math.sin(t * 22));
    }
    pivot.position
      .copy(pivot.userData.origin as Vector3)
      .addScaledVector(pivot.userData.out as Vector3, PART_M * (1 - (1 - part) ** 2));
    pivot.rotation.z = -side * angle;
  }

  // ------------------------------------------------------------- juice

  private spray(at: Vector3, radius: number): void {
    const positions = new Float32Array(DROPS * 3);
    const velocities = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) {
      positions.set([at.x, at.y + radius * 0.4, at.z], i * 3);
      const side = i % 2 ? 1 : -1;
      const out = 0.25 + Math.random() * 0.45;
      const along = (Math.random() - 0.5) * 0.5;
      // Out to either side of the blade, and along it, and up.
      velocities.set(
        [
          this.normal.x * out * side - this.normal.z * along,
          0.35 + Math.random() * 0.6,
          this.normal.z * out * side + this.normal.x * along,
        ],
        i * 3,
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: 0xfff2b0,
      size: 0.0045,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const points = new Points(geometry, material);
    points.name = 'Juice';
    points.frustumCulled = false;
    points.userData.velocities = velocities;
    const entity = this.world.createTransformEntity(points);
    entity.addComponent(JuiceSpray, { age: 0, floorY: TABLE_TOP_Y + BOARD_THICKNESS + 0.001 });
  }

  private animateSpray(entity: Entity, delta: number): void {
    const points = entity.object3D as Points | undefined;
    if (!points) return;
    const age = (entity.getValue(JuiceSpray, 'age') ?? 0) + delta;
    entity.setValue(JuiceSpray, 'age', age);
    if (age > JUICE_S) {
      entity.dispose();
      return;
    }
    const floorY = entity.getValue(JuiceSpray, 'floorY') ?? 0;
    const position = points.geometry.getAttribute('position') as BufferAttribute;
    const v = points.userData.velocities as Float32Array;
    for (let i = 0; i < DROPS; i++) {
      let y = position.getY(i);
      if (y <= floorY) continue; // Landed: it stays put.
      v[i * 3 + 1] -= GRAVITY * delta;
      y = Math.max(floorY, y + v[i * 3 + 1] * delta);
      position.setXYZ(i, position.getX(i) + v[i * 3] * delta, y, position.getZ(i) + v[i * 3 + 2] * delta);
    }
    position.needsUpdate = true;
    (points.material as PointsMaterial).opacity = 0.9 * (1 - Math.max(0, age - 0.5) / (JUICE_S - 0.5));
  }
}
