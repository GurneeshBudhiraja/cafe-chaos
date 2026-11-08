/**
 * Café Chaos: a seating puzzle on the player's real table (hands only,
 * seated, for Quest 3 / 3S). This build renders the café: as soon as the
 * session starts, the garden café shell with its waiting bench and the
 * ten tables of the opening layout appear on the table in front of the
 * player. Guests, demands and the janitor come next.
 *
 * `virtual:iwsdk-project` (from iwsdk.config.json) brings the scene, the
 * model manifest, components and XR features (AR with hand tracking and
 * plane detection).
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { setUpLighting } from './lighting.js';
import { CafeSystem } from './systems/cafe-system.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  setUpLighting(world);
  world.registerSystem(CafeSystem);
  const system = world.getSystem(CafeSystem)!;

  // Dev only: lets the check and recording scripts find the world and the café.
  if (import.meta.env.DEV) (window as unknown as { __cafe: unknown }).__cafe = { world, system };
});
