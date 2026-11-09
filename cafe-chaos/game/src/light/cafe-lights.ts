/**
 * Lighting the café itself, in its own space (so it all moves and scales
 * with the café): the lamps as point lights with halos, the glowing
 * papers brightened, the house light and its shadows, the faint moon, and
 * the light spill onto the table. The models are not changed; this is what they are lit
 * and painted with.
 */

import { Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, Object3D, PointLight, SpotLight, type Material, type Sprite } from '@iwsdk/core';
import { makeHalo } from './halo.js';
import { GLOW, HOUSE, LAMPS, MOON } from './mood.js';
import { makeSpill } from './spill.js';

export interface CafeLights {
  /** One per entry in LAMPS, in order. */
  lamps: PointLight[];
  /** The halo of each lamp (undefined where a lamp has none), same order. */
  halos: (Sprite | undefined)[];
  /** The faint cool moon (no shadows). */
  moon: DirectionalLight;
  /** The warm house light over the counter: the one that casts shadows. */
  house: SpotLight;
  spill: Mesh;
}

/** Add the lights to the café group (call once the café is built). */
export function lightTheCafe(cafe: Group): CafeLights {
  brightenGlow(cafe);
  setShadowFlags(cafe);
  const lamps: PointLight[] = [];
  const halos: (Sprite | undefined)[] = [];
  for (const lamp of LAMPS) {
    const light = new PointLight(lamp.color, lamp.intensity, lamp.distance, 2);
    light.position.set(...lamp.position);
    light.name = 'Lamp';
    cafe.add(light);
    lamps.push(light);
    let halo: Sprite | undefined;
    if (lamp.halo > 0) {
      halo = makeHalo(lamp.halo, lamp.color, lamp.haloOpacity);
      halo.position.set(lamp.position[0], lamp.position[1] + 0.006, lamp.position[2]);
      cafe.add(halo);
    }
    halos.push(halo);
  }
  const moon = new DirectionalLight(MOON.color, MOON.intensity);
  moon.name = 'Moon';
  moon.position.set(...MOON.position);
  moon.target.position.set(0, 0, 0);
  cafe.add(moon, moon.target);
  const house = makeHouseLight();
  cafe.add(house, house.target);
  const spill = makeSpill();
  cafe.add(spill);
  return { lamps, halos, moon, house, spill };
}

/** The one shadow-casting light: the warm spot over the counter, shining down and out the front. */
function makeHouseLight(): SpotLight {
  const house = new SpotLight(HOUSE.color, HOUSE.intensity, HOUSE.distance, HOUSE.angle, HOUSE.penumbra, 2);
  house.name = 'HouseLight';
  house.position.set(...HOUSE.position);
  house.target.position.set(...HOUSE.target);
  house.castShadow = true;
  house.shadow.mapSize.set(HOUSE.shadowMapSize, HOUSE.shadowMapSize);
  house.shadow.camera.near = 0.02;
  house.shadow.camera.far = HOUSE.distance;
  house.shadow.bias = -0.0003;
  house.shadow.normalBias = 0.003;
  house.shadow.radius = HOUSE.shadowRadius;
  return house;
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
