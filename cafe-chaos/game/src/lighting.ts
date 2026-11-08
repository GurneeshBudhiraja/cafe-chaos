/**
 * Light for the café: a warm golden-hour mood. The models carry their own
 * glow (shoji walls, lanterns) and baked contact shading, so no real-time
 * shadows are used (a WebGL shadow-sampler bug on Quest makes them
 * unsafe). The scene's HDR environment (set in the scene JSON) does most
 * of the work; the warm sky fill and low sun tint it the way the model
 * notes describe, and keep the preview lit where the emulator ignores a
 * custom environment in XR.
 */

import { DirectionalLight, HemisphereLight, type World } from '@iwsdk/core';

export function setUpLighting(world: World): void {
  world.renderer.shadowMap.enabled = false;
  world.scene.environmentIntensity = 1.0;
  world.createTransformEntity(new HemisphereLight(0xffe9c4, 0x8a6b4f, 1.25));
  const sun = new DirectionalLight(0xffd9a0, 1.1);
  sun.position.set(-0.6, 1.4, 0.9);
  world.createTransformEntity(sun);
}
