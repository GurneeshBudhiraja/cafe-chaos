/**
 * YapperSystem: the little lives of the Yappers. Each one bobs as it
 * breathes, blinks now and then, and shows its mood: brows up and a
 * bounce with waving arms when happy (the propeller hat spins), brows
 * down with a head-shake and a yapping beak when grumpy. One that is
 * picked up kicks its feet; one bounced off a taken seat flies in an arc
 * back to the table. The rule card over each head follows it and turns
 * to face the player, shrinking once its owner is seated and content.
 */

import { createSystem, Euler, Grabbed, Vector3, type Entity } from '@iwsdk/core';
import { Yapper } from '../game-components.js';
import { yapperData, type YapperData } from '../yappers/yapper.js';
import { BODY_HEIGHT, HEAD_TOP_Y } from '../yappers/yapper-mesh.js';

const BREATH_SECONDS = 2.2;
const BLINK_SECONDS = 0.13;
const HAPPY_SECONDS = 1.5;
const GRUMPY_SECONDS = 1.2;
const HOP_HEIGHT = 0.07;
/** Where the card floats: this far above the feet. */
const CARD_HEIGHT = HEAD_TOP_Y + 0.045;

export class YapperSystem extends createSystem({
  yappers: { required: [Yapper] },
}) {
  private readonly baseScale = new WeakMap<object, Vector3>();
  private readonly at = new Vector3();
  private readonly eye = new Vector3();
  private readonly euler = new Euler();

  update(delta: number): void {
    const now = performance.now() / 1000;
    this.world.camera.getWorldPosition(this.eye);
    for (const entity of this.queries.yappers.entities) {
      const data = yapperData(entity);
      const object = entity.object3D;
      if (!data || !object) continue;
      data.moodAge += delta;
      this.breathe(data, now);
      this.blink(data, now, delta);
      this.mood(entity, data, now);
      this.beak(data, now);
      this.hop(entity, data, delta);
      this.card(entity, data, delta);
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

  private breathe(data: YapperData, now: number): void {
    const body = data.parts.body;
    const base = this.base(body);
    const breath = 1 + 0.025 * Math.sin((now / BREATH_SECONDS + data.idlePhase) * Math.PI * 2);
    body.scale.set(base.x * (1 - (breath - 1) * 0.5), base.y * breath, base.z * (1 - (breath - 1) * 0.5));
    body.position.y = (BODY_HEIGHT / 2) * breath;
  }

  private blink(data: YapperData, now: number, delta: number): void {
    if (data.blinkAge >= 1 && now >= data.blinkAt) {
      data.blinkAge = 0;
      data.blinkAt = now + 2.2 + Math.random() * 3.5;
    }
    data.blinkAge = Math.min(1, data.blinkAge + delta / BLINK_SECONDS);
    const closed = data.blinkAge < 1 ? Math.sin(Math.PI * data.blinkAge) : 0;
    for (const eye of data.parts.eyes) {
      const base = this.base(eye);
      eye.scale.set(base.x, base.y * (1 - closed * 0.9), base.z);
    }
  }

  /** Brows, bounce, arms and the head-shake, by mood; the kicking feet while carried. */
  private mood(entity: Entity, data: YapperData, now: number): void {
    const { root, brows, arms, feet, spinner } = data.parts;
    const held = entity.hasComponent(Grabbed);
    const age = data.moodAge;
    const happy = data.mood === 'happy';
    const grumpy = data.mood === 'grumpy';
    // Brows: raised and tilted out when happy, knitted when grumpy.
    const browTarget = happy ? 0.32 : grumpy ? -0.45 : 0.15;
    const browLift = happy ? 0.0015 : grumpy ? -0.0012 : 0;
    const k = 0.18;
    brows.forEach((brow, i) => {
      const side = i === 0 ? -1 : 1;
      brow.rotation.z += (side * browTarget - brow.rotation.z) * k;
      brow.position.y += (BODY_HEIGHT * 0.66 + 0.0095 + browLift - brow.position.y) * k;
    });
    // A happy bounce with waving arms (decaying), a grumpy head-shake.
    let bounce = 0;
    let wave = 0;
    let shake = 0;
    if (happy && age < HAPPY_SECONDS) {
      const fade = 1 - age / HAPPY_SECONDS;
      bounce = 0.012 * Math.abs(Math.sin((Math.PI * age) / 0.32)) * fade;
      wave = fade;
    }
    if (grumpy && age < GRUMPY_SECONDS) {
      shake = 0.3 * Math.sin(age * 32) * (1 - age / GRUMPY_SECONDS);
    }
    root.position.y = bounce;
    root.rotation.y = shake;
    arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      const up = held ? 0.9 : wave * (0.5 + 0.7 * Math.abs(Math.sin(now * 14 + side)));
      arm.rotation.z += (side * (0.25 + up) - arm.rotation.z) * 0.25;
      arm.rotation.x += ((grumpy ? -0.6 : 0) - arm.rotation.x) * 0.2;
    });
    // Feet kick while carried.
    feet.forEach((foot, i) => {
      const target = held ? 0.5 * Math.sin(now * 12 + i * Math.PI) : 0;
      foot.rotation.x += (target - foot.rotation.x) * 0.3;
    });
    if (spinner) spinner.rotation.y += (happy && age < HAPPY_SECONDS * 2 ? 0.45 : 0.03) * (1 - Math.min(1, age / 3) * (happy ? 0 : 1));
  }

  /** The beak opens and shuts while yapping. */
  private beak(data: YapperData, now: number): void {
    const yapping = now < data.yapUntil;
    const open = yapping ? 0.55 * Math.abs(Math.sin(now * 26)) : 0;
    data.parts.beakTop.rotation.x += (-open - data.parts.beakTop.rotation.x) * 0.5;
    data.parts.beakBottom.rotation.x += (open * 0.8 - data.parts.beakBottom.rotation.x) * 0.5;
  }

  private hop(entity: Entity, data: YapperData, delta: number): void {
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
    // A little tumble on the way.
    object.rotation.z = 0.35 * Math.sin(Math.PI * t);
    if (t >= 1) {
      object.rotation.z = 0;
      data.hop = null;
    }
  }

  /** The card floats over the head and turns to face the player; small once its owner is seated and happy. */
  private card(entity: Entity, data: YapperData, delta: number): void {
    const object = entity.object3D;
    const card = data.card.group;
    if (!object) return;
    object.getWorldPosition(this.at);
    const held = entity.hasComponent(Grabbed);
    card.position.set(this.at.x, this.at.y + CARD_HEIGHT + (held ? 0.02 : 0), this.at.z);
    const yaw = Math.atan2(this.eye.x - card.position.x, this.eye.z - card.position.z);
    card.quaternion.setFromEuler(this.euler.set(-0.25, yaw, 0, 'YXZ'));
    const content = data.seated && data.states.every((s) => s === 'ok');
    const target = content ? 0.55 : 1;
    const k = Math.min(1, delta * 8);
    card.scale.setScalar(card.scale.x + (target - card.scale.x) * k);
  }
}
