/**
 * Café Chaos: a seating puzzle on the player's real table (hands only,
 * seated, for Quest 3 / 3S). This build is the café at night: as soon as
 * the session starts, the garden café with its furniture appears on the
 * table in front of the player, the room dims to dusk around it, and its
 * lamps and lanterns light it, throwing shadows and spilling a warm glow
 * out over the table. Six baristas work behind the counter and carry
 * trays out to the tables; steam rises over the kettle and blossom
 * falls from the cherry tree. Guests walk up and line up outside the
 * door; the player pinches one up, carries it over the café and lets go
 * over the seat that glows blue; after its meal it hops down and leaves.
 * The café has a grab pill on the side facing the player (pinch and
 * drag to move it) and a bracket at each corner (pinch and pull to
 * resize, swing to turn), as a Horizon OS window does. The player's
 * hands are the café's own cream hands.
 *
 * `virtual:iwsdk-project` (from iwsdk.config.json) brings the scene, the
 * model manifest, components and XR features (AR with hand tracking and
 * plane detection).
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { themeHands } from './hands/cafe-hand.js';
import { findSurfaceSpot } from './lib/desk-placement.js';
import { setUpLighting } from './lighting.js';
import { AmbienceSystem } from './systems/ambience-system.js';
import { BaristaSystem } from './systems/barista-system.js';
import { CafeSystem } from './systems/cafe-system.js';
import { GuestSystem } from './systems/guest-system.js';
import { HandleSystem } from './systems/handle-system.js';
import { HoldSystem } from './systems/hold-system.js';
import { MoodSystem } from './systems/mood-system.js';
import { RenderBudgetSystem } from './systems/render-budget-system.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(CafeSystem).registerSystem(HoldSystem).registerSystem(HandleSystem).registerSystem(GuestSystem).registerSystem(BaristaSystem).registerSystem(AmbienceSystem).registerSystem(MoodSystem).registerSystem(RenderBudgetSystem);
  const system = world.getSystem(CafeSystem)!;
  const lights = setUpLighting(world, system.cafe);
  const mood = world.getSystem(MoodSystem)!;
  const hold = world.getSystem(HoldSystem)!;
  const handles = world.getSystem(HandleSystem)!;
  const budget = world.getSystem(RenderBudgetSystem)!;
  const guests = world.getSystem(GuestSystem)!;
  const baristas = world.getSystem(BaristaSystem)!;
  const ambience = world.getSystem(AmbienceSystem)!;
  mood.lights = lights;
  themeHands(world);

  // Dev only: lets the check and recording scripts find the world, the café, its lights, the mood, the hold, the handles and the surface finder.
  if (import.meta.env.DEV) (window as unknown as { __cafe: unknown }).__cafe = { world, system, lights, mood, hold, handles, budget, guests, baristas, ambience, findSurfaceSpot };
});
