/**
 * The static batch: the café's furniture never moves inside the café, so
 * every opaque mesh that shares a material is merged into one mesh, in
 * the café's own space. The headset then draws the whole room in a few
 * dozen draw calls instead of over a hundred (each one costs the
 * browser time, twice with shadows), with exactly the same picture.
 *
 * The original meshes stay where they are, hidden: their nodes still
 * carry the anchors the game reads (seats, meal spots), and they give
 * the café its bounds. Anything that will move or be swapped on its own
 * (a guest, a dirty table) is marked `userData.dynamic = true` on its
 * root before batching and is left alone. `unbatchStatic` undoes it, so a
 * room whose furniture changed (a table opened: its grey ghost turned
 * solid) can be folded again.
 */

import { Group, Matrix4, Mesh, type BufferGeometry, type Material, type Object3D } from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface BatchReport {
  /** Meshes folded into batches, and the batches that replaced them. */
  merged: number;
  batches: number;
}

/** True if `node` or any ancestor up to `root` is marked dynamic. */
function isDynamic(node: Object3D, root: Object3D): boolean {
  // `keepApart`: a part of the shell the game shows or hides (the left wall, the left garden), kept as its own meshes.
  for (let n: Object3D | null = node; n && n !== root; n = n.parent) if (n.userData.dynamic || n.userData.keepApart) return true;
  return false;
}

/** The vertex layout of a geometry: only geometries with the same one can be merged. */
function layoutOf(geometry: BufferGeometry): string {
  const names = Object.keys(geometry.attributes).sort();
  return `${names.map((n) => `${n}:${geometry.attributes[n].itemSize}`).join(',')}|${geometry.index ? 'i' : 'n'}`;
}

/**
 * Merge the static opaque meshes under `cafe` by material. The batches
 * are added to `cafe` in a group named `StaticBatch`; the originals are
 * hidden and marked `userData.batched`.
 */
export function batchStatic(cafe: Group): BatchReport {
  cafe.updateMatrixWorld(true);
  const toCafe = new Matrix4().copy(cafe.matrixWorld).invert();
  const groups = new Map<string, { material: Material; meshes: Mesh[] }>();
  cafe.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.visible || Array.isArray(mesh.material)) return;
    // Skinned and instanced meshes, and anything with morph targets, are not plain static geometry.
    if ((mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh || (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    if (Object.keys(mesh.geometry.morphAttributes).length > 0) return;
    // Blended meshes are sorted back to front one by one: merging them would change how they overlap.
    if (mesh.material.transparent) return;
    // A mirrored mesh would come out inside out once its transform is baked in.
    if (mesh.matrixWorld.determinant() < 0) return;
    if (isDynamic(mesh, cafe)) return;
    const key = `${mesh.material.uuid}|${layoutOf(mesh.geometry)}|${mesh.renderOrder}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { material: mesh.material, meshes: [] }));
    group.meshes.push(mesh);
  });

  const batch = new Group();
  batch.name = 'StaticBatch';
  const sources: Mesh[] = [];
  batch.userData.sources = sources;
  const report: BatchReport = { merged: 0, batches: 0 };
  const local = new Matrix4();
  for (const { material, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    // Each piece's geometry, moved from its own space into the café's.
    const parts = meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(local.multiplyMatrices(toCafe, mesh.matrixWorld)));
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, material);
    mesh.name = `Batch-${material.name || 'material'}`;
    mesh.renderOrder = meshes[0].renderOrder;
    mesh.castShadow = meshes[0].castShadow;
    mesh.receiveShadow = meshes[0].receiveShadow;
    batch.add(mesh);
    for (const source of meshes) {
      source.visible = false;
      source.userData.batched = true;
      sources.push(source);
    }
    report.merged += meshes.length;
    report.batches++;
  }
  cafe.add(batch);
  return report;
}

/** Undo `batchStatic(cafe)`: the batches go (their geometry freed), the folded meshes show again. */
export function unbatchStatic(cafe: Group): void {
  const batch = cafe.children.find((c) => c.name === 'StaticBatch');
  if (!batch) return;
  for (const source of (batch.userData.sources as Mesh[] | undefined) ?? []) {
    source.visible = true;
    delete source.userData.batched;
  }
  for (const mesh of batch.children) (mesh as Mesh).geometry?.dispose();
  cafe.remove(batch);
}
