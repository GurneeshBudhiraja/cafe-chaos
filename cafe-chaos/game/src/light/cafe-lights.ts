/**
 * Lighting the café itself, in its own space (so it all moves and scales
 * with the café): the lamps as point lights with halos, the glowing
 * papers brightened, the house light and its shadows, the faint moon, and
 * the light spill onto the table. The models are not changed; this is what they are lit
 * and painted with.
 *
 * The lights themselves (the lamps, the moon and the house light) hang on
 * a rig of their own beside the café, not in it, kept on the café's pose
 * each frame (MoodSystem). The café is hidden while the pause card is up;
 * lights inside it would go with it, and every lit material's shader is
 * built for the number of lights in view, so each pause and resume linked
 * shaders again (a long frame, and a flash on the headset). On the rig the
 * set of lights stays the same whether the café shows or not.
 */

import { Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, Object3D, PointLight, SpotLight, type HemisphereLight, type Material, type Sprite } from '@iwsdk/core';
import { makeHalo } from './halo.js';
import { DAY, GLOW, HALOS, HOUSE, LAMPS, MOON } from './mood.js';
import { makeSpill } from './spill.js';

export interface CafeLights {
  /** What the lights hang on: kept on the café's pose (MoodSystem), outside the café so they stay when it is hidden. */
  rig: Group;
  /** One per entry in LAMPS, in order. */
  lamps: PointLight[];
  /** One per entry in HALOS, in order. */
  halos: Sprite[];
  /** The faint cool moon (no shadows). */
  moon: DirectionalLight;
  /** The warm house light over the counter: the one that casts shadows. */
  house: SpotLight;
  spill: Mesh;
  /** The sky fill (lighting.ts sets it): brighter in the Canadian café's day. */
  fill?: HemisphereLight;
}

/** Light the café: its glow and shadow flags on the café, the lights on `rig` (kept on the café's pose by MoodSystem). */
export function lightTheCafe(cafe: Group, rig: Group): CafeLights {
  brightenGlow(cafe);
  setShadowFlags(cafe);
  const lamps = LAMPS.map((lamp) => {
    const light = new PointLight(lamp.color, lamp.intensity, lamp.distance, 2);
    light.position.set(...lamp.position);
    light.name = 'Lamp';
    rig.add(light);
    return light;
  });
  const halos = HALOS.map((spec) => {
    const halo = makeHalo(spec.size, spec.color, spec.opacity);
    halo.position.set(spec.position[0], spec.position[1] + 0.006, spec.position[2]);
    cafe.add(halo);
    return halo;
  });
  const moon = new DirectionalLight(MOON.color, MOON.intensity);
  moon.name = 'Moon';
  moon.position.set(...MOON.position);
  moon.target.position.set(0, 0, 0);
  rig.add(moon, moon.target);
  const house = makeHouseLight();
  rig.add(house, house.target);
  const spill = makeSpill();
  cafe.add(spill);
  return { rig, lamps, halos, moon, house, spill };
}

/**
 * Light furniture added later (the annex) as the café was lit: its glowing
 * papers turned up for the night, and its opaque meshes casting and taking
 * shadows.
 */
export function lightAddition(root: Object3D): void {
  brightenGlow(root);
  setShadowFlags(root);
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

/**
 * Light the Canadian café's pieces as it is built (CafeSystem.setCafe): their
 * glow set for the day (DAY.glow) and their opaque meshes casting and taking
 * shadows from the sun.
 */
export function lightDay(root: Object3D): void {
  brightenGlow(root, DAY.glow);
  setShadowFlags(root);
}

/** Turn the glowing papers up for the night (shared materials: once is enough); `table` names each material's glow. */
function brightenGlow(root: Object3D, table: Record<string, { strength: number; color?: number }> = GLOW): void {
  const done = new Set<Material>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      const glow = table[m.name];
      if (!glow || done.has(m) || !('emissiveIntensity' in m)) continue;
      const lit = m as MeshStandardMaterial;
      lit.emissiveIntensity = glow.strength;
      if (glow.color !== undefined) lit.emissive = new Color(glow.color);
      done.add(m);
    }
  });
}
