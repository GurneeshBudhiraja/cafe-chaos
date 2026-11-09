/**
 * Lighting the café itself, in its own space (so it all moves and scales
 * with the café): the lamps as point lights with halos, the glowing
 * papers brightened, the key light and its shadows, and the light spill
 * onto the table. The models are not changed; this is what they are lit
 * and painted with.
 */

import { Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, Object3D, PointLight, type Material } from '@iwsdk/core';
import { makeHalo } from './halo.js';
import { GLOW, KEY, LAMPS } from './mood.js';
import { makeSpill } from './spill.js';

export interface CafeLights {
  lamps: PointLight[];
  key: DirectionalLight;
  spill: Mesh;
}

/** Add the lights to the café group (call once the café is built). */
export function lightTheCafe(cafe: Group): CafeLights {
  brightenGlow(cafe);
  setShadowFlags(cafe);
  const lamps = LAMPS.map((lamp) => {
    const light = new PointLight(lamp.color, lamp.intensity, lamp.distance, 2);
    light.position.set(...lamp.position);
    light.name = 'Lamp';
    cafe.add(light);
    if (lamp.halo > 0) {
      const halo = makeHalo(lamp.halo, lamp.color, lamp.haloOpacity);
      halo.position.set(lamp.position[0], lamp.position[1] + 0.006, lamp.position[2]);
      cafe.add(halo);
    }
    return light;
  });
  const key = makeKeyLight();
  cafe.add(key, key.target);
  const spill = makeSpill();
  cafe.add(spill);
  return { lamps, key, spill };
}

/** The one shadow-casting light, framed tightly on the café for crisp shadows. */
function makeKeyLight(): DirectionalLight {
  const key = new DirectionalLight(KEY.color, KEY.intensity);
  key.name = 'KeyLight';
  key.position.set(...KEY.position);
  key.target.position.set(0, 0, -0.05);
  key.castShadow = true;
  key.shadow.mapSize.set(KEY.shadowMapSize, KEY.shadowMapSize);
  const camera = key.shadow.camera;
  camera.left = camera.bottom = -0.75;
  camera.right = camera.top = 0.75;
  camera.near = 0.05;
  camera.far = 3;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.004;
  key.shadow.radius = KEY.shadowRadius;
  return key;
}

/** Opaque meshes cast and receive shadows; the blended ones (petals, glass, water, the AO skirts) do neither. */
function setShadowFlags(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
    const opaque = materials.every((m) => !m.transparent);
    node.castShadow = opaque;
    node.receiveShadow = opaque;
  });
}

/** Turn the glowing papers up for the night (shared materials: once is enough). */
function brightenGlow(root: Object3D): void {
  const done = new Set<Material>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      const glow = GLOW[m.name];
      if (!glow || done.has(m) || !(m instanceof MeshStandardMaterial)) continue;
      m.emissiveIntensity = glow.strength;
      if (glow.color !== undefined) m.emissive = new Color(glow.color);
      done.add(m);
    }
  });
}
