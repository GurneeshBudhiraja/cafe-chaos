/**
 * Puppy Bite: a hands-only Quest game. A litter of sleepy puppies lies on
 * a blanket; pick each one up with a pinch, turn it, and tuck it into the
 * bed so they all fit. A puppy dropped on another one nips and hops off.
 *
 * `virtual:iwsdk-project` (from iwsdk.config.json) brings the scene, assets,
 * components and XR features. Grabbing is IWSDK's own: every puppy carries
 * OneHandGrabbable, and GrabSystem turns a hand's pinch into a grab. Hands
 * render as IWSDK's tracked hands.
 */

import { createSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { Soundscape } from './audio/soundscape.js';
import { Game } from './game/game.js';
import { spawnPuppy } from './puppies/puppy.js';
import { COATS } from './puppies/puppy-mesh.js';
import { POSES } from './puppies/shapes.js';
import { PadSystem } from './game/pads.js';
import { setUpLighting } from './lighting.js';
import { BedSystem } from './systems/bed-system.js';
import { HoverSystem } from './systems/hover-system.js';
import { PuppySystem } from './systems/puppy-system.js';
import { RestSystem } from './systems/rest-system.js';

/** Runs the game's per-frame work (the wrist panel) after the input systems. */
class GameTickSystem extends createSystem({}) {
  game: Game | null = null;
  update(): void {
    this.game?.update();
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  setUpLighting(world);
  // The bed claims released puppies before the rest system drops them.
  world.registerSystem(BedSystem).registerSystem(RestSystem).registerSystem(PuppySystem).registerSystem(PadSystem).registerSystem(HoverSystem);
  const game = new Game(world);
  world.registerSystem(GameTickSystem);
  world.getSystem(GameTickSystem)!.game = game;
  game.onScore = (score, level) =>
    console.log(`[puppies] ${level.difficulty}: ${score.placed}/${score.total} on the bed, ${score.nips} nips${score.complete ? `, done: ${score.stars} stars` : ''}`);
  game.start('easy');

  // Dev only: lets the recording and test scripts find the world and start levels.
  if (import.meta.env.DEV) (window as unknown as { __pup: unknown }).__pup = { world, game, Soundscape, spawnPuppy, POSES, COATS };
});
