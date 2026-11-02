/**
 * Knife demo: pick a knife up off the floor with your bare hand (hand
 * tracking, no controllers) and cut an apple on the table in two.
 *
 * `virtual:iwsdk-project` (from iwsdk.config.json) brings the scene, assets,
 * components and XR features; grabbing is IWSDK's own: the knife carries
 * OneHandGrabbable, and GrabSystem turns a hand's pinch into a grab.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { setUpLighting } from './lighting.js';
import { GloveSystem, GRIP } from './systems/glove-system.js';
import { KnifeRestSystem } from './systems/knife-rest-system.js';
import { SliceSystem } from './systems/slice-system.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  setUpLighting(world);
  // The glove poses after IWSDK's input and grab systems (negative priorities) each frame.
  world.registerSystem(SliceSystem).registerSystem(KnifeRestSystem).registerSystem(GloveSystem);
  if (import.meta.env.DEV) Object.assign(window, { __grip: GRIP, __glove: world.getSystem(GloveSystem) });
  // Dev only: lets the recording script find the world.
  if (import.meta.env.DEV) (window as unknown as { __knife: unknown }).__knife = { world };
});
