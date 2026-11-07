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

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { setUpLighting } from './lighting.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  setUpLighting(world);
  // Dev only: lets the recording and test scripts find the world.
  if (import.meta.env.DEV) (window as unknown as { __cake: unknown }).__cake = { world };
});
