/**
 * The game: starts a level (a bus parked on the right of the table with
 * its driver, a crowd of Yappers queueing at the stop on the left), clears
 * the last one, and keeps the score. Systems do the playing: SeatSystem
 * seats and judges, YapperSystem animates, RestSystem lets go.
 */

import { Vector3, type Entity, type World } from '@iwsdk/core';
import { Soundscape } from '../audio/soundscape.js';
import { Yapper } from '../game-components.js';
import { BUS_SPOT, QUEUE_Z, STOP_CENTRE, STOP_SIZE, STOP_THICKNESS, TABLE_SIZE, TABLE_TOP_Y } from '../scene-assets/furniture.scene-asset.js';
import { RestSystem } from '../systems/rest-system.js';
import { SeatSystem, type LevelScore } from '../systems/seat-system.js';
import { makeLevel, type Difficulty, type Level } from '../yappers/rules.js';
import { disposeYapper, spawnYapper, yapperData } from '../yappers/yapper.js';
import { createYapperLook } from '../yappers/yapper-mesh.js';
import { BUS_FLOOR_Y, createBus, type Bus } from './bus.js';
import { Scoreboard, WristHud, type FaceState } from './hud.js';
import { createPads, PadSystem, type PadKind } from './pads.js';

/** How long the bus bounces after everyone is aboard (seconds). */
const CELEBRATE_SECONDS = 2.2;
/** How long a Yapper yaps for each thing it says (seconds). */
const YAP = { happy: 0.5, grumble: 0.9, pickup: 0.25, bump: 0.6 };

export class Game {
  level: Level | null = null;
  bus: Bus | null = null;
  score: LevelScore = { seated: 0, total: 0, happy: 0, grumbles: 0, complete: false, stars: 0 };
  onScore: ((score: LevelScore, level: Level) => void) | null = null;
  readonly sound = new Soundscape();
  readonly scoreboard = new Scoreboard();
  readonly wristHud: WristHud;
  /** Every Yapper in the world. */
  readonly yappers;
  /** The current level's Yappers, in level order. */
  crowd: Entity[] = [];
  private fixtures: Entity[] = [];
  private readonly seats: SeatSystem;
  private readonly rest: RestSystem;
  /** Seconds since the crowd was last all aboard and content (the bus bounces for a moment). */
  private celebrateAge = 10;
  private lastTick = performance.now() / 1000;

  constructor(private readonly world: World) {
    this.seats = world.getSystem(SeatSystem)!;
    this.rest = world.getSystem(RestSystem)!;
    this.yappers = world.queryManager.registerQuery({ required: [Yapper] });
    const now = () => performance.now() / 1000;
    const yap = (entity: Entity, seconds: number) => {
      const data = yapperData(entity);
      if (data) data.yapUntil = Math.max(data.yapUntil, now() + seconds);
    };
    this.seats.onScore = (score) => {
      const wasComplete = this.score.complete;
      this.score = score;
      this.showStatus();
      if (score.complete && !wasComplete) {
        this.sound.play('complete', score.stars);
        this.celebrateAge = 0;
      }
      if (this.level) this.onScore?.(score, this.level);
    };
    this.seats.onSeated = () => this.sound.play('seat');
    this.seats.onHappy = (entity) => {
      this.sound.play('happy', entity.getValue(Yapper, 'index') ?? 0);
      yap(entity, YAP.happy);
    };
    this.seats.onGrumble = (entity) => {
      this.sound.play('grumble', entity.getValue(Yapper, 'index') ?? 0);
      yap(entity, YAP.grumble);
    };
    this.seats.onBump = (newcomer, sitter) => {
      this.sound.play('bump');
      yap(sitter, YAP.bump);
      yap(newcomer, YAP.bump * 0.6);
      const data = yapperData(sitter);
      if (data && data.mood !== 'grumpy') {
        data.mood = 'grumpy';
        data.moodAge = 0.3;
      }
    };
    this.seats.onPickUp = (entity) => {
      this.sound.play('pickup');
      yap(entity, YAP.pickup);
    };

    // The departures board stands behind the bus; the wrist panel rides the left hand.
    const table = world.getSceneObject('table')!;
    this.scoreboard.group.position.copy(table.localToWorld(new Vector3(BUS_SPOT.x, TABLE_TOP_Y, -TABLE_SIZE.depth / 2 + 0.04)));
    world.createTransformEntity(this.scoreboard.group);
    this.wristHud = new WristHud(world);

    // The pads start levels.
    createPads(world);
    const pads = world.getSystem(PadSystem)!;
    pads.onPress = (kind: PadKind) => {
      this.sound.play('tap');
      this.start(kind === 'new' ? (this.level?.difficulty ?? 'easy') : kind);
    };

    // Sound starts with the XR session (a user gesture lies behind it).
    world.renderer.xr.addEventListener('sessionstart', () => this.sound.start());
    document.addEventListener('pointerdown', () => this.sound.start(), { once: true });
  }

  /** Call every frame: the wrist panel follows the hand; the bus bounces on its springs after a win. */
  update(): void {
    this.wristHud.follow();
    const now = performance.now() / 1000;
    const delta = Math.min(0.1, now - this.lastTick);
    this.lastTick = now;
    this.celebrateAge += delta;
    const bus = this.bus;
    if (!bus) return;
    const t = this.celebrateAge;
    const fade = Math.max(0, 1 - t / CELEBRATE_SECONDS);
    bus.parts.body.position.y = 0.008 * Math.abs(Math.sin((Math.PI * t) / 0.38)) * fade;
    bus.parts.body.rotation.x = 0.03 * Math.sin((Math.PI * t) / 0.38) * fade;
    for (const wheel of bus.parts.wheels) wheel.rotation.z += 6 * delta * fade;
  }

  private faces(): FaceState[] {
    return this.crowd.map((entity) => {
      const data = yapperData(entity);
      if (!data || !data.seated) return 'standing';
      if (data.states.some((s) => s === 'bad')) return 'grumpy';
      return data.states.every((s) => s === 'ok') ? 'happy' : 'waiting';
    });
  }

  private showStatus(): void {
    const status = { level: this.level, score: this.score, faces: this.faces() };
    this.scoreboard.show(status);
    this.wristHud.show(status);
  }

  /** Start a level: a fresh crowd and bus; `seed` repeats a level. */
  start(difficulty: Difficulty, seed?: number): Level {
    this.clear();
    const level = makeLevel(difficulty, seed);
    this.level = level;
    const world = this.world;
    const table = world.getSceneObject('table')!;

    // The bus, parked on the right, its front toward the queue.
    const bus = createBus(level.rows);
    const busAt = table.localToWorld(new Vector3(BUS_SPOT.x, TABLE_TOP_Y, BUS_SPOT.z));
    bus.group.position.copy(busAt);
    // The driver: a steady grey-blue Yapper in a cap, at the wheel, facing the front.
    const driver = createYapperLook(1, 1, level.seed + 99).group;
    driver.position.copy(bus.driverLocal);
    driver.rotation.y = -Math.PI / 2;
    driver.name = 'Driver';
    bus.group.add(driver);
    this.fixtures.push(world.createTransformEntity(bus.group));
    this.bus = bus;

    // The crowd, queueing along the pavement toward the bus, facing the player.
    const n = level.yappers.length;
    const left = STOP_CENTRE.x - STOP_SIZE.width / 2 + 0.07;
    const right = STOP_CENTRE.x + STOP_SIZE.width / 2 - 0.07;
    const spacing = n > 1 ? Math.min(0.075, (right - left) / (n - 1)) : 0;
    const start = (left + right) / 2 - (spacing * (n - 1)) / 2;
    this.crowd = level.yappers.map((_, i) => {
      const wobble = Math.sin(level.seed * 0.37 + i * 2.1);
      const at = table.localToWorld(new Vector3(start + i * spacing, TABLE_TOP_Y + STOP_THICKNESS, QUEUE_Z + wobble * 0.02));
      return spawnYapper(world, level, i, at, wobble * 0.35);
    });

    this.seats.reset(bus, level, busAt.y, this.crowd);
    const floorCentre = bus.group.localToWorld(new Vector3(bus.centreX, 0, 0));
    this.rest.extraSurfaces = [{ centre: floorCentre, halfX: bus.half.x, halfZ: bus.half.z, y: busAt.y + BUS_FLOOR_Y }];
    this.score = this.seats.score();
    this.showStatus();
    this.onScore?.(this.score, level);
    return level;
  }

  /** Take away the current level's Yappers and bus. */
  clear(): void {
    for (const entity of this.fixtures) entity.dispose();
    this.fixtures = [];
    for (const entity of [...this.yappers.entities]) disposeYapper(entity);
    this.crowd = [];
    this.seats.reset(null, null, 0);
    this.rest.extraSurfaces = [];
    this.bus = null;
    this.level = null;
  }
}
