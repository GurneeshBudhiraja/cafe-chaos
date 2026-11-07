/**
 * Yappers: All Aboard. A hands-only Quest game. A crowd of little Yappers
 * queues at a bus stop on the table, each with a card saying where it will
 * sit (a window seat, the front row, beside a friend, not beside a grump,
 * a spare seat next to it...). Pinch them one by one and put them in the
 * open-top bus so that everyone's rules hold. A Yapper in the wrong seat
 * grumbles; one dropped on a taken seat bounces off.
 *
 * `virtual:iwsdk-project` (from iwsdk.config.json) brings the scene, assets,
 * components and XR features. Grabbing is IWSDK's own: every Yapper carries
 * OneHandGrabbable, and GrabSystem turns a hand's pinch into a grab. Hands
 * render as IWSDK's tracked hands.
 */

import { createSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { Soundscape } from './audio/soundscape.js';
import { Game } from './game/game.js';
import { PadSystem } from './game/pads.js';
import { setUpLighting } from './lighting.js';
import { HoverSystem } from './systems/hover-system.js';
import { RestSystem } from './systems/rest-system.js';
import { SeatSystem } from './systems/seat-system.js';
import { YapperSystem } from './systems/yapper-system.js';
import { checkYapper, countSolutions, describeRule, makeLevel } from './yappers/rules.js';

/** Runs the game's per-frame work (the wrist panel) after the input systems. */
class GameTickSystem extends createSystem({}) {
  game: Game | null = null;
  update(): void {
    this.game?.update();
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  setUpLighting(world);
  // The seats claim released Yappers before the rest system drops them.
  world.registerSystem(SeatSystem).registerSystem(RestSystem).registerSystem(YapperSystem).registerSystem(PadSystem).registerSystem(HoverSystem);
  const game = new Game(world);
  world.registerSystem(GameTickSystem);
  world.getSystem(GameTickSystem)!.game = game;
  game.onScore = (score, level) =>
    console.log(
      `[yappers] ${level.difficulty}: ${score.seated}/${score.total} aboard, ${score.happy} happy, ${score.grumbles} grumbles${score.complete ? `, done: ${score.stars} stars` : ''}`,
    );
  game.start('easy');

  // Dev only: lets the recording and test scripts find the world and start levels.
  if (import.meta.env.DEV) (window as unknown as { __yap: unknown }).__yap = { world, game, Soundscape, makeLevel, checkYapper, countSolutions, describeRule };
});
