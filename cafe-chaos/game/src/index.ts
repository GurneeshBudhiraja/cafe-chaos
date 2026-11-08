/**
 * Café Chaos: a seating puzzle on the player's real table (hands only,
 * seated, for Quest 3 / 3S). This build renders the café: as soon as the
 * session starts, the garden café shell with its waiting bench and the
 * ten tables of the opening layout appear on the table in front of the
 * player. Guests then arrive at the gate every few seconds and wait on
 * the bench, each with a patience timer; when it runs out they walk back
 * out and fade away. Seating them, demands and the janitor come next.
 *
 * `virtual:iwsdk-project` (from iwsdk.config.json) brings the scene, the
 * model manifest, components and XR features (AR with hand tracking and
 * plane detection).
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { setUpLighting } from './lighting.js';
import { CafeSystem } from './systems/cafe-system.js';
import { GuestSystem } from './systems/guest-system.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  setUpLighting(world);
  world.registerSystem(CafeSystem).registerSystem(GuestSystem);
  const system = world.getSystem(CafeSystem)!;
  const guests = world.getSystem(GuestSystem)!;

  // Dev only: lets the check and recording scripts find the world, the café and the guests.
  if (import.meta.env.DEV) (window as unknown as { __cafe: unknown }).__cafe = { world, system, guests };
});
