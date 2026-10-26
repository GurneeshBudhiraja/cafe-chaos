/**
 * Small 2D shape helpers shared by the notes models (rounded rectangles and
 * rims), extruded into thin parts.
 */

import { type BufferGeometry, ExtrudeGeometry, Path, Shape } from '@iwsdk/core';

/** A rounded rectangle centred on the origin, as a Shape or a hole Path. */
export function roundedRect<T extends Shape | Path>(target: T, width: number, height: number, radius: number): T {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  target.moveTo(-w + r, -h);
  target.lineTo(w - r, -h);
  target.quadraticCurveTo(w, -h, w, -h + r);
  target.lineTo(w, h - r);
  target.quadraticCurveTo(w, h, w - r, h);
  target.lineTo(-w + r, h);
  target.quadraticCurveTo(-w, h, -w, h - r);
  target.lineTo(-w, -h + r);
  target.quadraticCurveTo(-w, -h, -w + r, -h);
  return target;
}

/**
 * A rounded-rectangle frame (outer outline minus an inset), extruded along
 * +Z by `depth` from z = 0. For edge rims and page lips.
 */
export function roundedRim(width: number, height: number, radius: number, inset: number, depth: number): ExtrudeGeometry {
  const shape = roundedRect(new Shape(), width, height, radius);
  shape.holes.push(roundedRect(new Path(), width - inset * 2, height - inset * 2, Math.max(0.0005, radius - inset)));
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
}

/**
 * Remap a geometry's UVs to 0..1 across its X/Y bounds. Shape and extrude
 * geometries carry UVs in shape units (metres here), which would sample a
 * texture almost at a single point.
 */
export function normalizeUvs<T extends BufferGeometry>(geometry: T): T {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const uv = geometry.attributes.uv;
  const position = geometry.attributes.position;
  if (!box || !uv) return geometry;
  const w = box.max.x - box.min.x || 1;
  const h = box.max.y - box.min.y || 1;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (position.getX(i) - box.min.x) / w, (position.getY(i) - box.min.y) / h);
  }
  uv.needsUpdate = true;
  return geometry;
}
