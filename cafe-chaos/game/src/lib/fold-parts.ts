/**
 * Folding rigid parts into one skinned mesh.
 *
 * The café's characters are built from rigid parts (a body, arms, legs,
 * a head), each its own mesh moved by the clips. Drawn as they come,
 * that is a draw call per part. This folds a set of parts that share a
 * material into a single skinned mesh whose bones are the parts' own
 * nodes, each vertex bound wholly to its part: the clips move it exactly
 * as before, but it is one draw call.
 *
 * The parts stay in the tree as the bones (the clips still target them,
 * and things parented to them still follow); they are only taken off
 * every render layer, so the renderer passes over them but still visits
 * their children.
 */

import { BufferAttribute, Matrix4, Skeleton, SkinnedMesh, type Bone, type BufferGeometry, type Material, type Mesh, type Object3D } from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Fold `parts` (meshes under `container`, sharing one material) into a
 * skinned mesh added to `container`. Call with the model in its rest
 * pose, before any clip has moved it. Returns null if there is nothing
 * worth folding.
 */
export function foldParts(container: Object3D, parts: Mesh[], name: string): SkinnedMesh | null {
  if (parts.length < 2) return null;
  container.updateWorldMatrix(true, true);
  const material = parts[0].material as Material;
  const toContainer = new Matrix4().copy(container.matrixWorld).invert();
  const local = new Matrix4();
  const geometries: BufferGeometry[] = parts.map((part, bone) => {
    const geometry = part.geometry.clone().applyMatrix4(local.multiplyMatrices(toContainer, part.matrixWorld));
    const count = geometry.attributes.position.count;
    const index = new Uint16Array(count * 4);
    const weight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      index[i * 4] = bone;
      weight[i * 4] = 1;
    }
    geometry.setAttribute('skinIndex', new BufferAttribute(index, 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(weight, 4));
    return geometry;
  });
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) return null;
  const skin = new SkinnedMesh(merged, material);
  skin.name = name;
  skin.frustumCulled = false;
  container.add(skin);
  skin.updateMatrixWorld(true);
  // The parts are plain nodes, not Bone objects; a skeleton only needs their world matrices.
  skin.bind(new Skeleton(parts as unknown as Bone[]), skin.matrixWorld);
  for (const part of parts) {
    part.layers.disableAll();
    part.userData.folded = true;
  }
  return skin;
}
