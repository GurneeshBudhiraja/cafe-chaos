/**
 * SeatSystem: let go of a Yapper over the bus and it sits in the nearest
 * seat, facing the front. If that seat is taken, the sitter squawks and the
 * newcomer bounces off the bus onto the table. Every change of seating is
 * judged against everyone's rules: a seated Yapper whose rules all hold is
 * happy; one with a broken rule grumbles (each new grumble counts against
 * the score). When everyone is seated and happy, the level is done.
 */

import { createSystem, Euler, Grabbed, Quaternion, Vector3, type Entity } from '@iwsdk/core';
import { Yapper } from '../game-components.js';
import { SEAT_TOP_Y, SEAT_WIDTH, type Bus } from '../game/bus.js';
import { checkYapper, SEATS_PER_ROW, type Level, type RuleState } from '../yappers/rules.js';
import { yapperData, type YapperData } from '../yappers/yapper.js';

/** A released Yapper takes a seat when its feet are within this of the seat's centre (metres)... */
const SEAT_REACH = SEAT_WIDTH * 0.62;
/** ...and let go no higher than this over the cushion. */
const DROP_HEIGHT = 0.22;
const SETTLE_SECONDS = 0.25;
/** The bounce off a taken seat: how long, and how far past the bus's nose it lands. */
const HOP_SECONDS = 0.55;
const HOP_CLEARANCE = 0.05;

export interface LevelScore {
  seated: number;
  total: number;
  happy: number;
  grumbles: number;
  complete: boolean;
  stars: number;
}

interface Settle {
  from: Vector3;
  to: Vector3;
  fromRotation: Quaternion;
  toRotation: Quaternion;
  age: number;
}

export class SeatSystem extends createSystem({
  heldYappers: { required: [Yapper, Grabbed] },
}) {
  bus: Bus | null = null;
  level: Level | null = null;
  /** The table top's world height (where a bounced Yapper lands). */
  landingY = 0;
  grumbles = 0;
  /** Who sits where: Yapper index -> seat. */
  readonly seating = new Map<number, number>();
  onScore: ((score: LevelScore) => void) | null = null;
  onSeated: ((yapper: Entity) => void) | null = null;
  onHappy: ((yapper: Entity) => void) | null = null;
  onGrumble: ((yapper: Entity) => void) | null = null;
  onBump: ((newcomer: Entity, sitter: Entity) => void) | null = null;
  onPickUp: ((yapper: Entity) => void) | null = null;

  private readonly entities = new Map<number, Entity>();
  private readonly settles = new Map<Entity, Settle>();
  private readonly local = new Vector3();
  private readonly euler = new Euler();
  private readonly busQuaternion = new Quaternion();
  private readonly faceFront = new Quaternion().setFromEuler(new Euler(0, -Math.PI / 2, 0));

  init(): void {
    this.cleanupFuncs.push(
      this.queries.heldYappers.subscribe('qualify', (entity) => this.pickUp(entity)),
      this.queries.heldYappers.subscribe('disqualify', (entity) => this.trySeat(entity)),
    );
  }

  /** Start over for a new level, with its Yappers (in level order). */
  reset(bus: Bus | null, level: Level | null, landingY: number, yappers: Entity[] = []): void {
    this.bus = bus;
    this.level = level;
    this.landingY = landingY;
    this.seating.clear();
    this.settles.clear();
    this.entities.clear();
    yappers.forEach((entity, i) => this.entities.set(i, entity));
    this.grumbles = 0;
  }

  update(delta: number): void {
    for (const [entity, settle] of this.settles) {
      const object = entity.object3D;
      if (!object || entity.hasComponent(Grabbed)) {
        this.settles.delete(entity);
        continue;
      }
      settle.age += delta;
      const t = Math.min(1, settle.age / SETTLE_SECONDS);
      const e = 1 - (1 - t) ** 3;
      object.position.lerpVectors(settle.from, settle.to, e);
      object.quaternion.slerpQuaternions(settle.fromRotation, settle.toRotation, e);
      if (t >= 1) this.settles.delete(entity);
    }
  }

  score(): LevelScore {
    const total = this.level?.yappers.length ?? 0;
    const seated = this.seating.size;
    let happy = 0;
    for (const [index] of this.seating) {
      const data = yapperData(this.entities.get(index)!);
      if (data && data.states.every((s) => s === 'ok')) happy++;
    }
    const complete = total > 0 && seated === total && happy === total;
    const stars = !complete ? 0 : this.grumbles === 0 ? 3 : this.grumbles <= 2 ? 2 : 1;
    return { seated, total, happy, grumbles: this.grumbles, complete, stars };
  }

  /** Who sits in a seat, if anyone. */
  sitter(seat: number): Entity | null {
    for (const [index, s] of this.seating) if (s === seat) return this.entities.get(index) ?? null;
    return null;
  }

  private pickUp(entity: Entity): void {
    const data = yapperData(entity);
    if (!data) return;
    data.hop = null;
    const index = entity.getValue(Yapper, 'index') ?? -1;
    if (this.seating.delete(index)) {
      entity.setValue(Yapper, 'seat', -1);
      data.seated = false;
      this.judge();
    }
    this.onPickUp?.(entity);
  }

  private trySeat(entity: Entity): void {
    const bus = this.bus;
    const object = entity.object3D;
    const data = yapperData(entity);
    if (!bus || !object || !data || !this.level) return;
    bus.group.updateWorldMatrix(true, false);
    object.updateWorldMatrix(true, false);
    object.getWorldPosition(this.local);
    bus.group.worldToLocal(this.local);
    if (this.local.y < SEAT_TOP_Y - 0.04 || this.local.y > SEAT_TOP_Y + DROP_HEIGHT) return;

    // The nearest seat, if close enough.
    let best = -1;
    let bestDistance = Infinity;
    for (let seat = 0; seat < bus.rows * SEATS_PER_ROW; seat++) {
      const at = bus.seatLocal(seat);
      const distance = Math.hypot(at.x - this.local.x, at.z - this.local.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = seat;
      }
    }
    if (best < 0 || bestDistance > SEAT_REACH) return;

    bus.group.getWorldQuaternion(this.busQuaternion);
    const index = entity.getValue(Yapper, 'index') ?? -1;
    const sitter = this.sitter(best);
    if (sitter && sitter !== entity) {
      // Taken: bounce off the bus, past its nose, onto the table.
      const landLocal = new Vector3(bus.centreX - bus.half.x - HOP_CLEARANCE - data.radius, 0, Math.max(-bus.half.z, Math.min(bus.half.z, this.local.z)));
      const land = bus.group.localToWorld(landLocal);
      land.y = this.landingY;
      const from = object.getWorldPosition(new Vector3());
      if (object.parent) {
        object.parent.worldToLocal(land);
        object.parent.worldToLocal(from);
      }
      data.hop = { from, to: land, age: 0, seconds: HOP_SECONDS };
      // Upright, facing the player.
      this.euler.setFromQuaternion(object.quaternion, 'YXZ');
      object.quaternion.setFromEuler(this.euler.set(0, 0, 0, 'YXZ'));
      this.onBump?.(entity, sitter);
      return;
    }

    // Sit: feet on the cushion, facing the front of the bus.
    const to = bus.group.localToWorld(bus.seatLocal(best));
    if (object.parent) object.parent.worldToLocal(to);
    const toRotation = this.busQuaternion.clone().multiply(this.faceFront);
    this.settles.set(entity, { from: object.position.clone(), to, fromRotation: object.quaternion.clone(), toRotation, age: 0 });
    this.seating.set(index, best);
    entity.setValue(Yapper, 'seat', best);
    data.seated = true;
    this.onSeated?.(entity);
    this.judge(entity);
  }

  /**
   * Judge every seated Yapper's rules. A Yapper whose rules newly all hold
   * is happy; one with a newly broken rule grumbles (counted). `justSat`
   * reacts even if nothing changed, so sitting always gets a response.
   */
  private judge(justSat?: Entity): void {
    const level = this.level;
    if (!level) return;
    for (const [index, entity] of this.entities) {
      const data = yapperData(entity);
      if (!data) continue;
      const states: RuleState[] = this.seating.has(index) ? checkYapper(data.spec, index, this.seating, level.rows) : data.spec.rules.map(() => 'pending');
      const was = data.states;
      const changed = states.some((s, i) => s !== was[i]);
      const allOk = states.length > 0 ? states.every((s) => s === 'ok') : this.seating.has(index);
      const anyBad = states.some((s) => s === 'bad');
      const wasBad = was.some((s) => s === 'bad');
      const wasOk = was.length > 0 && was.every((s) => s === 'ok');
      data.states = states;
      if (!this.seating.has(index)) {
        if (changed || data.mood !== 'calm') this.setMood(data, 'calm');
        continue;
      }
      if (anyBad && (!wasBad || entity === justSat)) {
        this.grumbles++;
        this.setMood(data, 'grumpy');
        this.onGrumble?.(entity);
      } else if (allOk && (!wasOk || entity === justSat)) {
        this.setMood(data, 'happy');
        this.onHappy?.(entity);
      } else if (changed) this.setMood(data, anyBad ? 'grumpy' : allOk ? 'happy' : 'calm');
    }
    this.onScore?.(this.score());
  }

  private setMood(data: YapperData, mood: 'calm' | 'happy' | 'grumpy'): void {
    data.mood = mood;
    data.moodAge = 0;
    if (this.level) data.card.paint(data.spec, this.level, data.states, mood);
  }
}
