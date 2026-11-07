/**
 * PuppySystem: the little lives of the puppies. Each one breathes slowly,
 * twitches an ear now and then, wags its tail when picked up or just
 * settled, squashes contentedly into the bed after it settles, and after a
 * nip hops in an arc back onto the table.
 */

import { createSystem, Grabbed, Vector3, type Entity } from '@iwsdk/core';
import { Puppy } from '../game-components.js';
import { puppyData, type PuppyData } from '../puppies/puppy.js';

const BREATH_SECONDS = 2.8;
const SNUGGLE_SECONDS = 0.6;
const TWITCH_SECONDS = 0.35;
const HOP_HEIGHT = 0.07;

interface Twitch {
  ear: number;
  age: number;
}

export class PuppySystem extends createSystem({
  puppies: { required: [Puppy] },
}) {
  private readonly twitches = new Map<Entity, Twitch>();
  private readonly baseScale = new WeakMap<object, Vector3>();

  update(delta: number): void {
    const now = performance.now() / 1000;
    for (const entity of this.queries.puppies.entities) {
      const data = puppyData(entity);
      const object = entity.object3D;
      if (!data || !object) continue;
      this.breathe(data, now);
      this.ears(entity, data, delta);
      this.tail(entity, data, now);
      this.snuggle(data, delta);
      this.hop(entity, data, delta);
    }
  }

  private base(part: { scale: Vector3 }): Vector3 {
    let base = this.baseScale.get(part);
    if (!base) {
      base = part.scale.clone();
      this.baseScale.set(part, base);
    }
    return base;
  }

  private breathe(data: PuppyData, now: number): void {
    const body = data.parts.body;
    const base = this.base(body);
    const breath = 1 + 0.03 * Math.sin(((now / BREATH_SECONDS) + data.breathPhase) * Math.PI * 2);
    body.scale.set(base.x, base.y * breath, base.z * (1 + (breath - 1) * 0.4));
  }

  private ears(entity: Entity, data: PuppyData, delta: number): void {
    let twitch = this.twitches.get(entity);
    if (!twitch && Math.random() < delta * 0.25) {
      twitch = { ear: Math.floor(Math.random() * data.parts.ears.length), age: 0 };
      this.twitches.set(entity, twitch);
    }
    if (!twitch) return;
    twitch.age += delta;
    const ear = data.parts.ears[twitch.ear];
    if (!ear) return;
    const t = twitch.age / TWITCH_SECONDS;
    ear.rotation.z = t < 1 ? 0.35 * Math.sin(Math.PI * t) * (twitch.ear ? -1 : 1) : 0;
    if (t >= 1) this.twitches.delete(entity);
  }

  private tail(entity: Entity, data: PuppyData, now: number): void {
    // Puppies like being carried: the tail goes while held.
    if (entity.hasComponent(Grabbed)) data.wagUntil = Math.max(data.wagUntil, now + 0.3);
    const wagging = now < data.wagUntil;
    const fade = wagging ? Math.min(1, (data.wagUntil - now) / 0.4) : 0;
    data.parts.tail.rotation.y = fade * 0.55 * Math.sin(now * 17);
  }

  /** After settling in: a contented squash and spring back. */
  private snuggle(data: PuppyData, delta: number): void {
    if (data.snuggleAge >= SNUGGLE_SECONDS) {
      if (data.parts.root.scale.x !== 1) data.parts.root.scale.setScalar(1);
      return;
    }
    data.snuggleAge += delta;
    const t = Math.min(1, data.snuggleAge / SNUGGLE_SECONDS);
    const s = Math.sin(Math.PI * t) * (1 - t * 0.5);
    data.parts.root.scale.set(1 + 0.07 * s, 1 - 0.1 * s, 1 + 0.07 * s);
  }

  /** The hop after a nip: an arc from the bed to the table. */
  private hop(entity: Entity, data: PuppyData, delta: number): void {
    const hop = data.hop;
    const object = entity.object3D;
    if (!hop || !object) return;
    if (entity.hasComponent(Grabbed)) {
      data.hop = null;
      return;
    }
    hop.age += delta;
    const t = Math.min(1, hop.age / hop.seconds);
    object.position.lerpVectors(hop.from, hop.to, t);
    object.position.y += HOP_HEIGHT * 4 * t * (1 - t);
    if (t >= 1) data.hop = null;
  }
}
