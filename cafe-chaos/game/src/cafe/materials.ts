/**
 * The material pass for the grey-box pieces (the unlocks and the meals
 * still have placeholder flat materials named `GB_*`): dress them in the
 * café's own materials, taken from the art models already loaded, so
 * they sit in the same palette of walnut, timber, indigo cushions and
 * ceramic. The models themselves are untouched; only what their meshes
 * are painted with changes.
 */

import { CHEAP_LOOK, matte } from '../light/cheap-materials.js';
import { AssetManager, Color, Mesh, MeshStandardMaterial, type Material, type Object3D } from '@iwsdk/core';

/** Which café material (by name, from the art models) replaces each grey-box one. */
const BORROWED: Record<string, { from: string; material: string }> = {
  GB_Furniture: { from: 'table-2', material: 'CafeWalnut' },
  GB_Seat: { from: 'table-4', material: 'CafeZabuton' },
};

/** Flat café colours for the rest (sRGB), with a roughness. */
const PAINTED: Record<string, { color: number; roughness: number }> = {
  GB_Plant: { color: 0x4d7a3c, roughness: 0.85 },
  GB_Plate: { color: 0xe9dfcf, roughness: 0.35 },
  GB_Food: { color: 0xb9682f, roughness: 0.6 },
  GB_Mess: { color: 0x8a5a2a, roughness: 0.8 },
};

const cache = new Map<string, Material>();

/** Swap every `GB_*` material on `object` for a café one (shared across pieces). */
export function dressGreyBox(object: Object3D): void {
  object.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const replaced = materials.map((m: Material) => cafeMaterialFor(m.name) ?? m);
    node.material = Array.isArray(node.material) ? replaced : replaced[0];
  });
}

function cafeMaterialFor(name: string): Material | undefined {
  if (!name.startsWith('GB_')) return undefined;
  let material = cache.get(name);
  if (material) return material;
  const borrowed = BORROWED[name];
  if (borrowed) material = findMaterial(borrowed.from, borrowed.material);
  if (!material) {
    const paint = PAINTED[name] ?? { color: 0x8a6b4f, roughness: 0.7 };
    material = new MeshStandardMaterial({ color: new Color(paint.color), roughness: paint.roughness, metalness: 0 });
    material.name = `Cafe${name.slice(3)}`;
    if (CHEAP_LOOK) material = matte(material);
  }
  cache.set(name, material);
  return material;
}

/** A material by name from a loaded art model (undefined if not loaded or not there). */
function findMaterial(model: string, name: string): Material | undefined {
  let found: Material | undefined;
  AssetManager.getGLTF(model)?.scene.traverse((node) => {
    if (found || !(node instanceof Mesh)) return;
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) if (m.name === name) found = m;
  });
  return found;
}
