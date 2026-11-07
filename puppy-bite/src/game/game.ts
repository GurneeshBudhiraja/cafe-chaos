/**
 * The game: starts a level (a litter of puppies on the blanket, the bed on
 * the right of the table), clears the last one, and keeps the score.
 * Systems do the playing: BedSystem settles and nips, PuppySystem animates,
 * RestSystem lets go.
 */

import { Vector3, type Entity, type World } from '@iwsdk/core';
import { Soundscape } from '../audio/soundscape.js';
import { Puppy } from '../game-components.js';
import { spawnPuppy } from '../puppies/puppy.js';
import { turnsToYaw } from '../puppies/shapes.js';
import { BED_SPOT, BLANKET_CENTRE, BLANKET_SIZE, BLANKET_THICKNESS, TABLE_SIZE, TABLE_TOP_Y } from '../scene-assets/furniture.scene-asset.js';
import { BedSystem, type LevelScore } from '../systems/bed-system.js';
import { RestSystem } from '../systems/rest-system.js';
import { createBed, MATTRESS_TOP, type Bed } from './bed.js';
import { Scoreboard, WristHud } from './hud.js';
import { makeLevel, type Difficulty, type Level } from './level.js';
import { createPads, PadSystem, type PadKind } from './pads.js';

export class Game {
  level: Level | null = null;
  bed: Bed | null = null;
  score: LevelScore = { placed: 0, total: 0, nips: 0, complete: false, stars: 0 };
  onScore: ((score: LevelScore, level: Level) => void) | null = null;
  readonly sound = new Soundscape();
  readonly scoreboard = new Scoreboard();
  readonly wristHud: WristHud;
  /** Every puppy in the world. */
  readonly puppies;
  private fixtures: Entity[] = [];
  private readonly bedSystem: BedSystem;
  private readonly rest: RestSystem;

  constructor(private readonly world: World) {
    this.bedSystem = world.getSystem(BedSystem)!;
    this.rest = world.getSystem(RestSystem)!;
    this.puppies = world.queryManager.registerQuery({ required: [Puppy] });
    this.bedSystem.onScore = (score) => {
      const wasComplete = this.score.complete;
      this.score = score;
      this.showStatus();
      if (score.complete && !wasComplete) this.sound.play('complete', score.stars);
      if (this.level) this.onScore?.(score, this.level);
    };
    this.bedSystem.onSnuggle = () => this.sound.play('snuggle');
    this.bedSystem.onNip = () => this.sound.play('nip');
    this.bedSystem.onPickUp = () => this.sound.play('pickup');

    // The scoreboard stands behind the bed; the wrist panel rides the left hand.
    const table = world.getSceneObject('table')!;
    this.scoreboard.group.position.copy(table.localToWorld(new Vector3(BED_SPOT.x, TABLE_TOP_Y, -TABLE_SIZE.depth / 2 + 0.04)));
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

  /** Call every frame: the wrist panel follows the hand. */
  update(): void {
    this.wristHud.follow();
  }

  private showStatus(): void {
    const status = { level: this.level, score: this.score };
    this.scoreboard.show(status);
    this.wristHud.show(status);
  }

  /** Start a level: a fresh litter and bed; `seed` repeats a level. */
  start(difficulty: Difficulty, seed?: number): Level {
    this.clear();
    const level = makeLevel(difficulty, seed, BLANKET_SIZE);
    this.level = level;
    const world = this.world;
    const table = world.getSceneObject('table')!;

    // The litter, on the blanket.
    for (const puppy of level.puppies) {
      const at = table.localToWorld(new Vector3(BLANKET_CENTRE.x + puppy.scatter.x, TABLE_TOP_Y + BLANKET_THICKNESS, BLANKET_CENTRE.z + puppy.scatter.z));
      this.fixtures.push(spawnPuppy(world, puppy.pose, puppy.coat, puppy.seed, at, turnsToYaw(puppy.scatter.turns)));
    }

    // The bed, on the right, its front toward the player.
    const bed = createBed(level.columns, level.rows);
    const bedAt = table.localToWorld(new Vector3(BED_SPOT.x, TABLE_TOP_Y, BED_SPOT.z));
    bed.group.position.copy(bedAt);
    this.fixtures.push(world.createTransformEntity(bed.group));
    this.bed = bed;
    this.bedSystem.reset(bed, level, bedAt.y);
    this.rest.extraSurfaces = [{ centre: bedAt.clone(), halfX: bed.half.x + 0.05, halfZ: bed.half.z + 0.05, y: bedAt.y + MATTRESS_TOP }];
    this.score = this.bedSystem.score();
    this.showStatus();
    this.onScore?.(this.score, level);
    return level;
  }

  /** Take away the current level's puppies and bed. */
  clear(): void {
    for (const entity of this.fixtures) entity.dispose();
    this.fixtures = [];
    for (const entity of [...this.puppies.entities]) entity.dispose();
    this.bedSystem.reset(null, null, 0);
    this.rest.extraSurfaces = [];
    this.bed = null;
    this.level = null;
  }
}
