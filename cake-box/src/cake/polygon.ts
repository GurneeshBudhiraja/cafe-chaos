/**
 * Flat polygon maths for cake footprints, in the cake's plan view: points
 * are [x, z] in metres (three.js X and Z; Y is up). Every cake footprint is
 * convex, and a straight cut keeps it that way, so the clipping here is the
 * simple convex kind (Sutherland–Hodgman). Pure functions, no three.js.
 */

export type Vec2 = readonly [number, number];
export type Polygon = Vec2[];

/** Signed area: positive when the points run counter-clockwise seen from above (+Y). */
export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % n];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

export function area(poly: Polygon): number {
  return Math.abs(signedArea(poly));
}

/** The polygon with its points running counter-clockwise seen from above. */
export function normalize(poly: Polygon): Polygon {
  return signedArea(poly) < 0 ? [...poly].reverse() : [...poly];
}

export function centroid(poly: Polygon): Vec2 {
  const n = poly.length;
  if (n < 3) return [0, 0];
  let cx = 0;
  let cz = 0;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % n];
    const cross = x0 * z1 - x1 * z0;
    a += cross;
    cx += (x0 + x1) * cross;
    cz += (z0 + z1) * cross;
  }
  if (Math.abs(a) < 1e-12) return [poly[0][0], poly[0][1]];
  return [cx / (3 * a), cz / (3 * a)];
}

export function translate(poly: Polygon, dx: number, dz: number): Polygon {
  return poly.map(([x, z]) => [x + dx, z + dz]);
}

/** Turn about +Y by `yaw` radians (the same sense as three.js `rotation.y`). */
export function rotate(poly: Polygon, yaw: number): Polygon {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return poly.map(([x, z]) => [x * c + z * s, -x * s + z * c]);
}

/** The farthest point from the origin (metres): a bounding circle around the local origin. */
export function boundingRadius(poly: Polygon): number {
  let r = 0;
  for (const [x, z] of poly) r = Math.max(r, Math.hypot(x, z));
  return r;
}

/** Axis-aligned bounds. */
export function bounds(poly: Polygon): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Whether a point is inside a convex, counter-clockwise polygon (edges count
 * as inside). `tolerance` (metres) lets points just outside count too.
 */
export function contains(poly: Polygon, [px, pz]: Vec2, tolerance = 0): boolean {
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % n];
    // The inside is to the left of every edge (positive signed area); the
    // cross product over the edge's length is the signed distance from it.
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const distance = ((x1 - x0) * (pz - z0) - (z1 - z0) * (px - x0)) / len;
    if (distance < -tolerance) return false;
  }
  return true;
}

/** Keep the part of a polygon on the side of the line through `p` that `n` points to: points q with dot(q - p, n) >= 0. */
export function clipHalfPlane(poly: Polygon, p: Vec2, n: Vec2): Polygon {
  const out: Vec2[] = [];
  const side = ([x, z]: Vec2) => (x - p[0]) * n[0] + (z - p[1]) * n[1];
  for (let i = 0, count = poly.length; i < count; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % count];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** The two normals of a direction: n for the left side, -n for the right. */
function normalOf(d: Vec2): Vec2 {
  return [-d[1], d[0]];
}

/** Split a polygon by the line through `p` along `d`. Slivers (under `minArea`) are dropped. */
export function splitByLine(poly: Polygon, p: Vec2, d: Vec2, minArea = 1e-6): Polygon[] {
  const n = normalOf(d);
  const parts = [clipHalfPlane(poly, p, n), clipHalfPlane(poly, p, [-n[0], -n[1]])];
  return parts.filter((part) => part.length >= 3 && area(part) > minArea).map(normalize);
}

/**
 * Where the line through `p` along `d` crosses a convex polygon: the
 * parameter range [t0, t1] (p + t d), or null when it misses.
 */
export function chord(poly: Polygon, p: Vec2, d: Vec2): [number, number] | null {
  // Clip the (unbounded) parameter range by each edge's half-plane.
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % n];
    const ex = x1 - x0;
    const ez = z1 - z0;
    // Inside is where cross(edge, q - a) >= 0 (counter-clockwise polygon).
    const num = ex * (p[1] - z0) - ez * (p[0] - x0);
    const den = ex * d[1] - ez * d[0];
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null; // Parallel and outside.
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t0 < t1 ? [t0, t1] : null;
}

/** The overlap of two convex polygons (counter-clockwise), or an empty list. */
export function intersectConvex(a: Polygon, b: Polygon): Polygon {
  let out = a;
  for (let i = 0, n = b.length; i < n && out.length >= 3; i++) {
    const p = b[i];
    const q = b[(i + 1) % n];
    const d: Vec2 = [q[0] - p[0], q[1] - p[1]];
    out = clipHalfPlane(out, p, normalOf(d));
  }
  return out.length >= 3 ? out : [];
}

/** Intersection over union of two convex polygons: 1 when they match, 0 when they miss. */
export function iou(a: Polygon, b: Polygon): number {
  const overlap = area(intersectConvex(a, b));
  const union = area(a) + area(b) - overlap;
  return union > 0 ? overlap / union : 0;
}

/** Clip a segment to a convex polygon: the part inside, or null. */
export function clipSegment(poly: Polygon, a: Vec2, b: Vec2): [Vec2, Vec2] | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-9) return null;
  const d: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const range = chord(poly, a, d);
  if (!range) return null;
  const t0 = Math.max(0, range[0]);
  const t1 = Math.min(len, range[1]);
  if (t1 - t0 < 1e-6) return null;
  return [
    [a[0] + d[0] * t0, a[1] + d[1] * t0],
    [a[0] + d[0] * t1, a[1] + d[1] * t1],
  ];
}

// ------------------------------------------------------------- shapes

/** A regular polygon of `sides` sides and `radius` (to the corners), centred. */
export function regularPolygon(sides: number, radius: number, phase = 0): Polygon {
  const poly: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = phase + (i / sides) * Math.PI * 2;
    poly.push([Math.cos(angle) * radius, -Math.sin(angle) * radius]);
  }
  return normalize(poly);
}

/** A rectangle `width` across (X) by `depth` deep (Z), centred. */
export function rectangle(width: number, depth: number): Polygon {
  const w = width / 2;
  const d = depth / 2;
  return normalize([
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
  ]);
}
