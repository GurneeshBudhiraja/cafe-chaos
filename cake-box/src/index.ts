/**
 * Cake Box: a hands-only Quest game. A layered cake stands on the board;
 * pick up the knife, cut the cake into the shapes the box's cards ask for,
 * and fit the pieces into the box.
 *
 * `virtual:iwsdk-project` (from iwsdk.config.json) brings the scene, assets,
 * components and XR features. Grabbing is IWSDK's own: the knife and every
 * cake piece carry OneHandGrabbable, and GrabSystem turns a hand's pinch
 * into a grab. Hands render as IWSDK's tracked hands.
 */

import { createSystem, Hovered, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { Soundscape } from './audio/soundscape.js';
import { iou } from './cake/polygon.js';
import { Game } from './game/game.js';
import { fitAtCardTurn } from './game/level.js';
import { PadSystem } from './game/pads.js';
import { setUpLighting } from './lighting.js';
import { BoxSystem } from './systems/box-system.js';
import { CrumbSystem } from './systems/crumb-system.js';
import { CutSystem } from './systems/cut-system.js';
import { HandGripSystem } from './systems/hand-grip-system.js';
import { HoverSystem } from './systems/hover-system.js';
import { RestSystem } from './systems/rest-system.js';

/** Runs the game's per-frame work (the wrist panel, the boards) after the input systems. */
class GameTickSystem extends createSystem({}) {
  game: Game | null = null;
  update(): void {
    this.game?.update();
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  setUpLighting(world);
  // Crumbs register first: the cut system looks them up. The box claims
  // released pieces before the rest system drops them.
  world
    .registerSystem(CrumbSystem)
    .registerSystem(CutSystem)
    .registerSystem(BoxSystem)
    .registerSystem(RestSystem)
    .registerSystem(PadSystem)
    .registerSystem(HoverSystem)
    .registerSystem(HandGripSystem); // After IWSDK's input system: it overrides the holding hand's bones.
  const game = new Game(world);
  world.registerSystem(GameTickSystem);
  world.getSystem(GameTickSystem)!.game = game;
  game.onScore = (score, level) => console.log(`[cake] ${level.difficulty}: fits ${score.fits.map((f) => (f === null ? '-' : Math.round(f * 100))).join(' ')}${score.complete ? `, done: ${score.stars} stars` : ''}`);
  game.start('easy');

  // Dev only: lets the recording and test scripts find the world and start levels.
  if (import.meta.env.DEV)
    (window as unknown as { __cake: unknown }).__cake = { world, game, cut: world.getSystem(CutSystem), fitAtCardTurn, iou, Soundscape, Hovered };
});
