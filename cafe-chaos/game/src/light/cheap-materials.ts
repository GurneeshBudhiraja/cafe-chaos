/**
 * Cheaper surfaces for the headset. Every model came in with physically
 * based (MeshStandardMaterial) surfaces: each pixel works out a specular
 * highlight from every light, plus the environment map. With eight lights
 * and the café filling much of the view when the player leans in, that was
 * the frame rate's main cost on the Quest (it fell into the 50s up close).
 *
 * Here each loaded model's standard materials are swapped, once, for matte
 * (Lambert) ones with the same colour, textures, glow, transparency and
 * sidedness: the café's look is matte paper and wood anyway, so little
 * changes but the cost. `?look=pbr` in the address keeps the old surfaces
 * (to compare).
 */

import { AssetManager, Mesh, MeshLambertMaterial, MeshStandardMaterial, type Material, type Object3D } from '@iwsdk/core';

export const CHEAP_LOOK = typeof location === 'undefined' || new URLSearchParams(location.search).get('look') !== 'pbr';

const swapped = new WeakMap<Material, Material>();

/** The matte twin of a standard material (made once, then shared). */
export function matte(material: Material): Material {
  if (!(material instanceof MeshStandardMaterial)) return material;
  let twin = swapped.get(material);
  if (twin) return twin;
  const m = material;
  const lambert = new MeshLambertMaterial({
    name: m.name,
    color: m.color,
    map: m.map,
    emissive: m.emissive,
    emissiveMap: m.emissiveMap,
    emissiveIntensity: m.emissiveIntensity,
    normalMap: m.normalMap,
    normalScale: m.normalScale,
    aoMap: m.aoMap,
    aoMapIntensity: m.aoMapIntensity,
    lightMap: m.lightMap,
    lightMapIntensity: m.lightMapIntensity,
    alphaMap: m.alphaMap,
    alphaTest: m.alphaTest,
    transparent: m.transparent,
    opacity: m.opacity,
    side: m.side,
    vertexColors: m.vertexColors,
    depthWrite: m.depthWrite,
    depthTest: m.depthTest,
    blending: m.blending,
    flatShading: m.flatShading,
    toneMapped: m.toneMapped,
    fog: m.fog,
  });
  lambert.userData = { ...m.userData };
  swapped.set(m, lambert);
  swapped.set(lambert, lambert);
  twin = lambert;
  return twin;
}

/** Swap every standard material under `root` for its matte twin. */
export function matteAll(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.material = Array.isArray(node.material) ? node.material.map(matte) : matte(node.material);
  });
}

/**
 * From now on, every model handed out by the asset manager comes with
 * matte surfaces (call once, before anything is loaded or copied).
 */
export function useCheapMaterials(): void {
  if (!CHEAP_LOOK) return;
  const get = AssetManager.getGLTF.bind(AssetManager);
  AssetManager.getGLTF = ((key: string, options?: { shared?: boolean }) => {
    const gltf = get(key, options);
    if (gltf?.scene) matteAll(gltf.scene);
    return gltf;
  }) as typeof AssetManager.getGLTF;
}
