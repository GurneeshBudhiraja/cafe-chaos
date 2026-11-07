/**
 * HoverSystem: a soft ring of light appears under whichever puppy a hand
 * is close enough to pinch, so you know which one a pinch would pick up.
 * The hand's pinch point (between the thumb and index fingertips) is
 * measured from the tracked joints. Rings come from a small pool.
 */

import { createSystem, Grabbed, Mesh, MeshBasicMaterial, RingGeometry, Vector3, type Entity, type Object3D } from '@iwsdk/core';
import { Puppy } from '../game-components.js';
import { puppyData } from '../puppies/puppy.js';

/** How far (in plan) outside a puppy's footprint a pinch still reaches it (metres). */
const REACH = 0.03;
/** How far above its back (or below its paws) the pinch point may be (metres). */
const REACH_UP = 0.07;
const PUPPY_HEIGHT = 0.06;

const ringMaterial = new MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 0.8, depthWrite: false });
const ringGeometry = new RingGeometry(0.88, 1, 48);
ringGeometry.rotateX(-Math.PI / 2);

export class HoverSystem extends createSystem({
  puppies: { required: [Puppy] },
}) {
  private readonly rings: Mesh[] = [];
  private readonly pinch = new Vector3();
  private readonly tip = new Vector3();
  private readonly at = new Vector3();

  private ring(i: number): Mesh {
    while (this.rings.length <= i) {
      const ring = new Mesh(ringGeometry, ringMaterial);
      ring.name = 'HoverRing';
      ring.renderOrder = 5;
      this.world.createTransformEntity(ring);
      this.rings.push(ring);
    }
    return this.rings[i];
  }

  /** The pinch point of a tracked hand, or null when it is not tracked. */
  private pinchPoint(hand: 'left' | 'right'): Vector3 | null {
    const visual = this.input.xr.visualAdapters.hand[hand]?.visual as { joints?: (Object3D | undefined)[]; model?: Object3D } | undefined;
    const thumb = visual?.joints?.[4];
    const index = visual?.joints?.[9];
    if (!thumb || !index || !visual?.model?.visible) return null;
    thumb.getWorldPosition(this.pinch);
    index.getWorldPosition(this.tip);
    return this.pinch.lerp(this.tip, 0.5);
  }

  update(): void {
    let used = 0;
    for (const hand of ['left', 'right'] as const) {
      const pinch = this.pinchPoint(hand);
      if (!pinch) continue;
      let best: { entity: Entity; radius: number; distance: number } | null = null;
      for (const puppy of this.queries.puppies.entities) {
        const object = puppy.object3D;
        const data = puppyData(puppy);
        if (!object || !data || puppy.hasComponent(Grabbed)) continue;
        object.getWorldPosition(this.at);
        const across = Math.hypot(pinch.x - this.at.x, pinch.z - this.at.z);
        const up = pinch.y - this.at.y;
        if (across > data.radius + REACH || up < -REACH_UP || up > PUPPY_HEIGHT + REACH_UP) continue;
        const distance = across + Math.max(0, up - PUPPY_HEIGHT) * 0.5;
        if (!best || distance < best.distance) best = { entity: puppy, radius: data.radius, distance };
      }
      const hit = best as { entity: Entity; radius: number } | null;
      if (!hit?.entity.object3D) continue;
      const ring = this.ring(used++);
      hit.entity.object3D.getWorldPosition(this.at);
      ring.position.set(this.at.x, this.at.y + 0.003, this.at.z);
      ring.scale.setScalar(hit.radius + 0.012);
      ring.visible = true;
    }
    for (let i = used; i < this.rings.length; i++) this.rings[i].visible = false;
  }
}
