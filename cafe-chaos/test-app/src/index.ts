/**
 * Café Chaos grey-box test app: shows the grey-box models as a sample café
 * on the detected desk, and lets a tracked hand pinch a guest into a seat,
 * to check the models' sizes. Not the game.
 */

import { World } from '@iwsdk/core';
import { DirectionalLight, HemisphereLight } from 'three';
import projectOptions from 'virtual:iwsdk-project';
import { CafeTestSystem } from './cafe-test-system.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  // Warm golden-hour mood for previews. (The emulator ignores a custom
  // scene.environment in XR, so warm lights do the tinting here; the real
  // game should use a warm HDR environment — see START-HERE.md's recipe.)
  world.scene.environmentIntensity = 0.55;
  const hemi = new HemisphereLight(0xffe9c4, 0x8a6b4f, 1.0);
  const sun = new DirectionalLight(0xffd9a0, 0.9);
  sun.position.set(-0.6, 1.4, 0.9);
  world.scene.add(hemi, sun);
  world.registerSystem(CafeTestSystem);
});
