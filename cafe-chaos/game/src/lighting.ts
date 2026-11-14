/**
 * The scene's light: a lo-fi night. The renderer gets filmic tone mapping
 * and shadow maps; the HDR environment is turned well down and a
 * dim, cool fill takes its place, so the café's own warm lamps carry the
 * scene (see light/mood.ts for the numbers, light/cafe-lights.ts for the
 * lamps, house light, moon and spill that hang on the café itself).
 */

import { ACESFilmicToneMapping, HemisphereLight, PCFShadowMap, type Group, type World } from '@iwsdk/core';
import { lightTheCafe, type CafeLights } from './light/cafe-lights.js';
import { ENVIRONMENT_INTENSITY, EXPOSURE, FILL } from './light/mood.js';

export function setUpLighting(world: World, cafe: Group): CafeLights {
  const { renderer, scene } = world;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.shadowMap.enabled = true;
  // Plain PCF: the soft kind samples the shadow map many more times on every pixel that receives a shadow.
  renderer.shadowMap.type = PCFShadowMap;
  scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  world.createTransformEntity(new HemisphereLight(FILL.sky, FILL.ground, FILL.intensity));
  return lightTheCafe(cafe);
}
