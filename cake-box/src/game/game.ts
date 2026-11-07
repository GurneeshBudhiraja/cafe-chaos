/**
 * The game: starts a level (a cake on the board, a box with its cards on
 * the counter), clears the last one, and keeps the score. Systems do the
 * playing: CutSystem cuts, BoxSystem fits, RestSystem settles.
 */

import { Vector3, type Entity, type World } from '@iwsdk/core';
import { Soundscape } from '../audio/soundscape.js';
import { createCakeBoard, decorateCake } from '../cake/cake-mesh.js';
import { spawnPiece } from '../cake/piece.js';
import { boundingRadius } from '../cake/polygon.js';
import { CakePiece } from '../game-components.js';
import { castShadows } from '../lighting.js';
import { BOARD_CENTRE, BOARD_THICKNESS, BOX_SPOT, COUNTER_SIZE, COUNTER_TOP_Y } from '../scene-assets/kitchen.scene-asset.js';
import { BoxSystem, type LevelScore } from '../systems/box-system.js';
import { CutSystem } from '../systems/cut-system.js';
import { RestSystem } from '../systems/rest-system.js';
import { createCakeBox, type CakeBox } from './box.js';
import { Scoreboard, WristHud } from './hud.js';
import { makeLevel, type Difficulty, type Level } from './level.js';
import { createPads, PadSystem, type PadKind } from './pads.js';

/** The cake board is this thick: the cake stands this much above the cutting board (metres). */
const CAKE_BOARD_THICKNESS = 0.004;

export class Game {
  level: Level | null = null;
  box: CakeBox | null = null;
  score: LevelScore = { fits: [], complete: false, stars: 0 };
  onScore: ((score: LevelScore, level: Level) => void) | null = null;
  readonly sound = new Soundscape();
  readonly scoreboard = new Scoreboard();
  readonly wristHud: WristHud;
  private fixtures: Entity[] = [];
  /** Every cake piece in the world. */
  readonly pieces;
  private readonly cut: CutSystem;
  private readonly boxSystem: BoxSystem;
  private readonly rest: RestSystem;
  private lastCuts = 0;

  constructor(private readonly world: World) {
    this.cut = world.getSystem(CutSystem)!;
    this.boxSystem = world.getSystem(BoxSystem)!;
    this.rest = world.getSystem(RestSystem)!;
    this.pieces = world.queryManager.registerQuery({ required: [CakePiece] });
    this.boxSystem.cutsMade = () => this.cut.cuts;
    this.boxSystem.onScore = (score) => {
      this.score = score;
      this.showStatus();
      if (score.complete) this.sound.play('complete', score.stars);
      if (this.level) this.onScore?.(score, this.level);
    };
    this.boxSystem.onSnap = (_cell, fit) => this.sound.play('snap', fit);
    this.cut.onCut = () => {
      this.sound.play('cut');
      this.showStatus();
    };
    this.cut.onCutting = (speed) => this.sound.cutting(speed);

    // The scoreboard stands behind the box; the wrist panel rides the left hand.
    const counter = world.getSceneObject('counter')!;
    this.scoreboard.group.position.copy(counter.localToWorld(new Vector3(BOX_SPOT.x, COUNTER_TOP_Y, -COUNTER_SIZE.depth / 2 + 0.05)));
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

  /** Call every frame: the wrist panel follows the hand; the cut count on the boards stays fresh. */
  update(): void {
    this.wristHud.follow();
    if (this.cut.cuts !== this.lastCuts) this.showStatus();
  }

  private showStatus(): void {
    this.lastCuts = this.cut.cuts;
    const status = { level: this.level, score: this.score, cuts: this.cut.cuts };
    this.scoreboard.show(status);
    this.wristHud.show(status);
  }

  /** Where the cutting board's top is, in the world. */
  private boardTop(): Vector3 {
    const counter = this.world.getSceneObject('counter')!;
    return counter.localToWorld(new Vector3(BOARD_CENTRE.x, COUNTER_TOP_Y + BOARD_THICKNESS, BOARD_CENTRE.z));
  }

  /** Start a level: a fresh cake and box; `seed` repeats a level. */
  start(difficulty: Difficulty, seed?: number): Level {
    this.clear();
    const level = makeLevel(difficulty, seed);
    this.level = level;
    const world = this.world;
    const counter = world.getSceneObject('counter')!;

    // The cake, on its board, on the cutting board.
    const boardTop = this.boardTop();
    const cakeBoard = createCakeBoard(boundingRadius(level.cake));
    cakeBoard.position.copy(boardTop);
    castShadows(cakeBoard, true);
    this.fixtures.push(world.createTransformEntity(cakeBoard));
    this.rest.extraSurfaces = [{ centre: boardTop.clone(), radius: boundingRadius(level.cake) + 0.02, y: boardTop.y + CAKE_BOARD_THICKNESS }];
    const cakeAt = boardTop.clone().setY(boardTop.y + CAKE_BOARD_THICKNESS);
    this.fixtures.push(spawnPiece(world, { polygon: level.cake, decorations: decorateCake(level.cake, level.strawberries), grooves: [] }, cakeAt, 0));

    // The box, on the right of the counter, its front toward the player.
    const box = createCakeBox(level);
    box.group.position.copy(counter.localToWorld(new Vector3(BOX_SPOT.x, COUNTER_TOP_Y, BOX_SPOT.z)));
    castShadows(box.group, true);
    this.fixtures.push(world.createTransformEntity(box.group));
    this.box = box;
    this.boxSystem.reset(box, level);
    this.cut.cuts = 0;
    this.score = this.boxSystem.score();
    this.showStatus();
    this.onScore?.(this.score, level);
    return level;
  }

  /** Take away the current level's cake, pieces and box. */
  clear(): void {
    for (const entity of this.fixtures) entity.dispose();
    this.fixtures = [];
    // Pieces cut from the cake are their own entities: find them by their component.
    for (const entity of [...this.pieces.entities]) entity.dispose();
    this.boxSystem.reset(null, null);
    this.box = null;
    this.level = null;
  }
}
