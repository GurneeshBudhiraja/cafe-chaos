/**
 * Yappers as entities: a transform entity whose object3D is the Yapper's
 * look and whose userData carries its spec (name, look, rules), the state
 * of each rule, its mood and animation parts, and its rule card. Yappers
 * are grabbable with one hand (IWSDK's OneHandGrabbable).
 */

import { OneHandGrabbable, Vector3, type Entity, type World } from '@iwsdk/core';
import { Yapper } from '../game-components.js';
import { RuleCard } from './cards.js';
import type { Level, RuleState, YapperSpec } from './rules.js';
import { createYapperLook, YAPPER_RADIUS, type YapperParts } from './yapper-mesh.js';

export type Mood = 'calm' | 'happy' | 'grumpy';

export interface YapperData {
  index: number;
  spec: YapperSpec;
  parts: YapperParts;
  /** How far the footprint reaches from the origin (metres). */
  radius: number;
  card: RuleCard;
  /** The state of each rule, as last checked. */
  states: RuleState[];
  /** The mood, and how long it has been held (seconds). */
  mood: Mood;
  moodAge: number;
  /** Animation state. */
  idlePhase: number;
  blinkAt: number;
  blinkAge: number;
  yapUntil: number;
  waveUntil: number;
  /** A hop in progress (bounced off a taken seat), or null. */
  hop: { from: Vector3; to: Vector3; age: number; seconds: number } | null;
  /** True while it is a passenger (the seat system owns its place). */
  seated: boolean;
}

export function yapperData(entity: Entity): YapperData | undefined {
  return entity.object3D?.userData.yapper as YapperData | undefined;
}

/** Make a Yapper at a world position with a yaw (radians about +Y); its card goes into the scene too. */
export function spawnYapper(world: World, level: Level, index: number, position: Vector3, yaw: number): Entity {
  const spec = level.yappers[index];
  const { group, parts } = createYapperLook(spec.color, spec.hat, level.seed + index * 7);
  group.position.copy(position);
  group.rotation.y = yaw;
  const card = new RuleCard();
  card.paint(spec, level, spec.rules.map(() => 'pending'));
  card.group.position.copy(position);
  card.entity = world.createTransformEntity(card.group);
  group.userData.yapper = {
    index,
    spec,
    parts,
    radius: YAPPER_RADIUS,
    card,
    states: spec.rules.map(() => 'pending' as RuleState),
    mood: 'calm',
    moodAge: 10,
    idlePhase: (index * 0.37) % 1,
    blinkAt: 1 + index * 0.7,
    blinkAge: 10,
    yapUntil: 0,
    waveUntil: 0,
    hop: null,
    seated: false,
  } satisfies YapperData;
  const entity = world.createTransformEntity(group);
  entity.addComponent(Yapper, { index, seat: -1 });
  entity.addComponent(OneHandGrabbable, {});
  return entity;
}

/** Take a Yapper and its card out of the world. */
export function disposeYapper(entity: Entity): void {
  const data = yapperData(entity);
  data?.card.dispose();
  entity.dispose();
}
