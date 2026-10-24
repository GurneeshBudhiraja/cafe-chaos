/**
 * TabletHandleSystem: moves and tilts a tablet through its separate handle.
 *
 * The handle carries IWSDK's grab components (DistanceGrabbable for rays,
 * OneHandGrabbable for a near hand or controller), so IWSDK's GrabSystem moves
 * the handle. This system makes the linked tablet follow it, keeping the
 * relative offset captured when the grab started.
 *
 * Work happens only while a handle is grabbed; idle tablets cost nothing.
 */

import { createSystem, Grabbed, Matrix4, type Entity } from '@iwsdk/core';
import { TabletHandle } from '../note-components.js';

interface FollowLink {
  tablet: Entity;
  /** Tablet pose relative to the handle, in world space. */
  offset: Matrix4;
}

export class TabletHandleSystem extends createSystem({
  grabbedHandles: { required: [TabletHandle, Grabbed] },
}) {
  private readonly links = new Map<Entity, FollowLink>();
  private readonly scratch = new Matrix4();
  private readonly parentInverse = new Matrix4();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.grabbedHandles.subscribe('qualify', (handle) =>
        this.beginFollow(handle),
      ),
      this.queries.grabbedHandles.subscribe('disqualify', (handle) =>
        this.links.delete(handle),
      ),
    );
  }

  update(): void {
    for (const handle of this.queries.grabbedHandles.entities) {
      const link = this.links.get(handle);
      const handleObject = handle.object3D;
      const tabletObject = link?.tablet.object3D;
      if (!link || !handleObject || !tabletObject) continue;

      // tabletWorld = handleWorld * offset, then convert into parent space.
      handleObject.updateWorldMatrix(true, false);
      this.scratch.multiplyMatrices(handleObject.matrixWorld, link.offset);
      const parent = tabletObject.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        this.parentInverse.copy(parent.matrixWorld).invert();
        this.scratch.premultiply(this.parentInverse);
      }
      // position/quaternion are synced views onto the ECS Transform.
      this.scratch.decompose(
        tabletObject.position,
        tabletObject.quaternion,
        tabletObject.scale,
      );
    }
  }

  private beginFollow(handle: Entity): void {
    const nodeId = handle.getValue(TabletHandle, 'tabletNodeId') as string;
    const tablet = this.world.getSceneEntity(nodeId);
    const handleObject = handle.object3D;
    const tabletObject = tablet?.object3D;
    if (!tablet || !handleObject || !tabletObject) {
      console.warn(`[TabletHandleSystem] No tablet with node id "${nodeId}".`);
      return;
    }
    handleObject.updateWorldMatrix(true, false);
    tabletObject.updateWorldMatrix(true, false);
    // offset = inverse(handleWorld) * tabletWorld. Allocated once per grab.
    const offset = new Matrix4()
      .copy(handleObject.matrixWorld)
      .invert()
      .multiply(tabletObject.matrixWorld);
    this.links.set(handle, { tablet, offset });
  }
}
