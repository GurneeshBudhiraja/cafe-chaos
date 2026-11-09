/**
 * Café Chaos: a seating puzzle on the player's real table (hands only,
 * seated, for Quest 3 / 3S). This build is the café at night: as soon as
 * the session starts, the garden café with its furniture appears on the
 * table in front of the player, the room dims to dusk around it, and its
 * lamps and lanterns light it, throwing shadows and spilling a warm glow
 * out over the table. A dock of big labelled buttons stands beside the
 * café for moving, turning and resizing it; pinching the café itself
 * works too. The player's hands are drawn in the café's own warm style.
 * Guests, seating and the rest of the game come next.
 *
 * `virtual:iwsdk-project` (from iwsdk.config.json) brings the scene, the
 * model manifest, components and XR features (AR with hand tracking and
 * plane detection).
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { themeHands } from './hands/cafe-hand.js';
import { setUpLighting } from './lighting.js';
import { CafeSystem } from './systems/cafe-system.js';
import { DockSystem } from './systems/dock-system.js';
import { HoldSystem } from './systems/hold-system.js';
import { MoodSystem } from './systems/mood-system.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(CafeSystem).registerSystem(HoldSystem).registerSystem(DockSystem).registerSystem(MoodSystem);
  const system = world.getSystem(CafeSystem)!;
  const lights = setUpLighting(world, system.cafe);
  const mood = world.getSystem(MoodSystem)!;
  const hold = world.getSystem(HoldSystem)!;
  const dock = world.getSystem(DockSystem)!;
  mood.lights = lights;
  themeHands(world);

  // Dev only: lets the check and recording scripts find the world, the café, its lights, the mood, the hold and the dock.
  if (import.meta.env.DEV) (window as unknown as { __cafe: unknown }).__cafe = { world, system, lights, mood, hold, dock };
});
