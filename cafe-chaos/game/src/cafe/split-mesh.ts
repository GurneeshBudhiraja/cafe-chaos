/**
 * Split part of a mesh off into a mesh of its own, so that part can be
 * shown or hidden by itself. Used where the café model bakes a piece we
 * need to switch (the corner post and beam where the annex joins on) into
 * a mesh shared with the rest of the timberwork.
 *
 * The triangles are picked by their centre, in the space of `frame` (the
 * café group). The original mesh gets a copy of its geometry without
 * them, so the loaded model's own geometry is never changed.
 */

import { BufferAttribute, BufferGeometry, Matrix4, Mesh, Vector3, type Object3D } from '@iwsdk/core';

/** A box in café space: a triangle whose centre is inside it is split off. */
export interface Box {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

/**
 * Move the triangles of `mesh` whose centres lie in `box` (café space)
 * into a new sibling mesh named `name`, with the same material. Returns
 * the new mesh, or null if no triangle was in the box.
 */
export function splitOff(mesh: Mesh, frame: Object3D, box: Box, name: string): Mesh | null {
  const { source, kept, split } = sortTriangles(mesh, frame, box);
  if (split.length === 0) return null;
  mesh.geometry = pick(source, kept);
  const part = new Mesh(pick(source, split), mesh.material);
  part.name = name;
  part.position.copy(mesh.position);
  part.quaternion.copy(mesh.quaternion);
  part.scale.copy(mesh.scale);
  mesh.parent?.add(part);
  return part;
}

/**
 * A copy of the part of `mesh` whose triangles have their centres in
 * `box` (café space), as a geometry in café space; the mesh itself is
 * left as it is. Null if no triangle was in the box. Used to hang more of
 * a piece the model has only in one place (a paper lantern).
 */
export function copyPart(mesh: Mesh, frame: Object3D, box: Box): BufferGeometry | null {
  const { source, split, toFrame } = sortTriangles(mesh, frame, box);
  if (split.length === 0) return null;
  return pick(source, split).applyMatrix4(toFrame);
}

/** The mesh's triangles (of a non-indexed copy of its geometry), sorted into those with their centres in the box and the rest. */
function sortTriangles(mesh: Mesh, frame: Object3D, box: Box): { source: BufferGeometry; kept: number[]; split: number[]; toFrame: Matrix4 } {
  frame.updateMatrixWorld(true);
  const toFrame = new Matrix4().copy(frame.matrixWorld).invert().multiply(mesh.matrixWorld);
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const position = source.getAttribute('position');
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const inBox = (p: Vector3): boolean =>
    p.x >= box.min[0] && p.x <= box.max[0] && p.y >= box.min[1] && p.y <= box.max[1] && p.z >= box.min[2] && p.z <= box.max[2];
  const kept: number[] = [];
  const split: number[] = [];
  for (let tri = 0; tri < position.count / 3; tri++) {
    a.fromBufferAttribute(position, tri * 3).applyMatrix4(toFrame);
    b.fromBufferAttribute(position, tri * 3 + 1).applyMatrix4(toFrame);
    c.fromBufferAttribute(position, tri * 3 + 2).applyMatrix4(toFrame);
    (inBox(a.add(b).add(c).divideScalar(3)) ? split : kept).push(tri);
  }
  return { source, kept, split, toFrame };
}

/** A new geometry of just these triangles (of a non-indexed geometry), every attribute carried over. */
function pick(source: BufferGeometry, triangles: number[]): BufferGeometry {
  const out = new BufferGeometry();
  for (const [key, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize;
    const values = new (attribute.array.constructor as Float32ArrayConstructor)(triangles.length * 3 * size);
    triangles.forEach((tri, i) => {
      for (let v = 0; v < 3; v++) {
        for (let k = 0; k < size; k++) values[(i * 3 + v) * size + k] = attribute.getComponent(tri * 3 + v, k);
      }
    });
    out.setAttribute(key, new BufferAttribute(values, size, attribute.normalized));
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}
