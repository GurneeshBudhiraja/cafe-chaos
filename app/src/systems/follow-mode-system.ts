/**
 * FollowModeSystem: stick mode for the home window and the compact dock.
 *
 * While pinned, both follow the viewer's head through IWSDK's Follower
 * (thresholded and smooth, yawing only, so the panels stay upright and do
 * not swim with every small head turn). Unpinned, they stay where they were
 * placed. Each panel keeps the offset it had from the head when pinning, a
 * drag or a mode switch happened, so following never jumps it elsewhere.
 * While the user drags, following pauses.
 */

import {
  createSystem,
  Euler,
  FollowBehavior,
  Follower,
  Quaternion,
  Vector3,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import { getHomeMode, type HomeModeState } from '../ui/home-mode.js';

const FOLLOWED_NODES = ['home-window', 'compact-dock'];
/** Degrees off-centre / metres away before a pinned panel catches up. */
const MAX_ANGLE_DEG = 25;
const TOLERANCE_M = 0.3;
const SPEED = 1.4;

export class FollowModeSystem extends createSystem({}) {
  private homeMode!: HomeModeState;
  private readonly targets: Array<{ entity: Entity; object: Object3D }> = [];
  private readonly headPosition = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly offset = new Vector3();
  private readonly euler = new Euler();

  init(): void {
    this.homeMode = getHomeMode(this.world);
    for (const node of FOLLOWED_NODES) {
      const entity = this.world.getSceneEntity(node);
      const object = this.world.getSceneObject(node);
      if (entity && object) this.targets.push({ entity, object });
    }
    this.cleanupFuncs.push(this.homeMode.subscribePlacement(() => this.apply()));
  }

  private apply(): void {
    const follow = this.homeMode.pinned && !this.homeMode.dragging;
    for (const { entity, object } of this.targets) {
      if (entity.hasComponent(Follower)) entity.removeComponent(Follower);
      if (!follow) continue;
      entity.addComponent(Follower, {
        target: this.player.head,
        offsetPosition: this.offsetFromHead(object),
        behavior: FollowBehavior.PivotY,
        maxAngle: MAX_ANGLE_DEG,
        tolerance: TOLERANCE_M,
        speed: SPEED,
      });
    }
  }

  /** The object's position in the head's yaw-only frame. */
  private offsetFromHead(object: Object3D): [number, number, number] {
    const head = this.player.head;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    // Keep yaw only, to match FollowBehavior.PivotY.
    const yaw = this.euler.setFromQuaternion(this.headQuaternion, 'YXZ').y;
    this.offset.copy(object.position).sub(this.headPosition);
    this.offset.applyAxisAngle(UP, -yaw);
    return [this.offset.x, this.offset.y, this.offset.z];
  }
}

const UP = new Vector3(0, 1, 0);
