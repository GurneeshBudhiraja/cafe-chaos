/**
 * Puppies as entities: a transform entity whose object3D is the puppy's
 * look and whose userData carries its pose, coat and animation parts.
 * Puppies are grabbable with one hand (IWSDK's OneHandGrabbable).
 */

import { OneHandGrabbable, Vector3, type Entity, type World } from '@iwsdk/core';
import { Puppy } from '../game-components.js';
import { createPuppyLook, type Coat, type PuppyParts } from './puppy-mesh.js';
import { footprintRadius, type Pose } from './shapes.js';

export interface PuppyData {
  pose: Pose;
  coat: Coat;
  seed: number;
  parts: PuppyParts;
  /** How far the footprint reaches from the origin (metres). */
  radius: number;
  /** Animation state. */
  breathPhase: number;
  wagUntil: number;
  snuggleAge: number;
  /** A hop in progress (after a nip), or null. */
  hop: { from: Vector3; to: Vector3; age: number; seconds: number } | null;
}

export function puppyData(entity: Entity): PuppyData | undefined {
  return entity.object3D?.userData.puppy as PuppyData | undefined;
}

/** Make a puppy at a world position with a yaw (radians about +Y). */
export function spawnPuppy(world: World, pose: Pose, coat: Coat, seed: number, position: Vector3, yaw: number): Entity {
  const { group, parts } = createPuppyLook(pose, coat, seed);
  group.position.copy(position);
  group.rotation.y = yaw;
  group.userData.puppy = {
    pose,
    coat,
    seed,
    parts,
    radius: footprintRadius(pose),
    breathPhase: (seed % 97) / 97,
    wagUntil: 0,
    snuggleAge: 10,
    hop: null,
  } satisfies PuppyData;
  const entity = world.createTransformEntity(group);
  entity.addComponent(Puppy, { column: -1, row: -1, turns: 0 });
  entity.addComponent(OneHandGrabbable, {});
  return entity;
}
