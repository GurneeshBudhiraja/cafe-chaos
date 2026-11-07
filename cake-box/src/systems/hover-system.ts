/**
 * HoverSystem: a soft ring of light appears under whatever a hand is
 * close enough to pinch, so you know what a pinch would pick up. The
 * hand's pinch point (between the thumb and index fingertips) is measured
 * from the tracked joints; the nearest piece or knife within reach of it
 * gets the ring. Rings come from a small pool.
 */

import { createSystem, Grabbed, Mesh, MeshBasicMaterial, RingGeometry, Vector3, type Entity, type Object3D } from '@iwsdk/core';
import { CAKE_HEIGHT } from '../cake/cake-mesh.js';
import { pieceData } from '../cake/piece.js';
import { boundingRadius } from '../cake/polygon.js';
import { CakePiece, Knife } from '../game-components.js';

/** How far (in plan) outside a thing's outline a pinch still reaches it (metres). */
const REACH = 0.035;
/** How far above its top (or below its base) the pinch point may be (metres). */
const REACH_UP = 0.06;

const ringMaterial = new MeshBasicMaterial({ color: 0xffc85a, transparent: true, opacity: 0.85, depthWrite: false });
const ringGeometry = new RingGeometry(0.88, 1, 48);
ringGeometry.rotateX(-Math.PI / 2);

export class HoverSystem extends createSystem({
  pieces: { required: [CakePiece] },
  knives: { required: [Knife] },
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
      let best: { entity: Entity; radius: number; lift: number; distance: number } | null = null;
      const consider = (entity: Entity, radius: number, height: number, lift: number) => {
        const object = entity.object3D;
        if (!object || entity.hasComponent(Grabbed)) return;
        object.getWorldPosition(this.at);
        const across = Math.hypot(pinch.x - this.at.x, pinch.z - this.at.z);
        const up = pinch.y - this.at.y;
        if (across > radius + REACH || up < -REACH_UP || up > height + REACH_UP) return;
        const distance = across + Math.max(0, up - height) * 0.5;
        if (!best || distance < best.distance) best = { entity, radius, lift, distance };
      };
      for (const piece of this.queries.pieces.entities) {
        const data = pieceData(piece);
        if (data) consider(piece, boundingRadius(data.polygon), CAKE_HEIGHT, 0.003);
      }
      for (const knife of this.queries.knives.entities) consider(knife, 0.05, 0.03, -0.0065);
      const hit = best as { entity: Entity; radius: number; lift: number } | null;
      if (!hit?.entity.object3D) continue;
      const ring = this.ring(used++);
      hit.entity.object3D.getWorldPosition(this.at);
      ring.position.set(this.at.x, this.at.y + hit.lift, this.at.z);
      ring.scale.setScalar(hit.radius + 0.012);
      ring.visible = true;
    }
    for (let i = used; i < this.rings.length; i++) this.rings[i].visible = false;
  }
}
