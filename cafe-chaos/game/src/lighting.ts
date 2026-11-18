/**
 * The scene's light: a lo-fi night. The renderer gets filmic tone mapping
 * and shadow maps; the HDR environment is turned well down and a
 * dim, cool fill takes its place, so the café's own warm lamps carry the
 * scene (see light/mood.ts for the numbers, light/cafe-lights.ts for the
 * lamps, house light, moon and spill that hang on the café itself).
 */

import { ACESFilmicToneMapping, Group, HemisphereLight, PCFShadowMap, type World } from '@iwsdk/core';
import { lightTheCafe, type CafeLights } from './light/cafe-lights.js';
import { ENVIRONMENT_INTENSITY, EXPOSURE, FILL } from './light/mood.js';
import { PROBE } from './lib/probe.js';

export function setUpLighting(world: World, cafe: Group): CafeLights {
  const { renderer, scene } = world;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  // `?noshadow` (lib/probe.ts): no shadow map, to see whether its redraws are what flickers on the headset.
  renderer.shadowMap.enabled = !PROBE.noShadow;
  // Plain PCF: the soft kind samples the shadow map many more times on every pixel that receives a shadow.
  renderer.shadowMap.type = PCFShadowMap;
  scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  const fill = new HemisphereLight(FILL.sky, FILL.ground, FILL.intensity);
  world.createTransformEntity(fill);
  // The café's lights on a rig of their own (light/cafe-lights.ts), kept on the café's pose by MoodSystem.
  const rig = new Group();
  rig.name = 'CafeLightRig';
  world.createTransformEntity(rig);
  const lights = lightTheCafe(cafe, rig);
  lights.fill = fill;
  return lights;
}
