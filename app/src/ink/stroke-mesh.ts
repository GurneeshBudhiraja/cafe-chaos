/**
 * Renders one stroke as a flat ribbon mesh on the tablet.
 *
 * WebGL ignores line widths above 1px, so ink is drawn as a strip of
 * triangles in the tablet's local XY plane. Each sampled point produces two
 * vertices offset to either side of the stroke direction.
 *
 * Buffers grow by doubling, so appending points while drawing is cheap and
 * only reallocates occasionally.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
} from '@iwsdk/core';
import { INK_OPACITY } from './tool-catalog.js';
import type { Stroke } from '../notes/note-model.js';

/** Maps page coordinates (0..1) onto a surface of the given size in meters. */
export interface SurfaceSize {
  widthM: number;
  heightM: number;
}

const INITIAL_CAPACITY = 64;

/** One shared material per colour and opacity; strokes never mutate a material. */
const materialCache = new Map<string, MeshBasicMaterial>();

function materialFor(color: string, opacity: number): MeshBasicMaterial {
  const key = `${color}/${opacity}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new MeshBasicMaterial({
      color: new Color(color),
      opacity,
      // All ink draws in the transparent pass, so render order alone sets
      // what lies on top (highlighter under pen); see INK_RENDER_ORDER.
      transparent: true,
      // Ink sits on one plane. Skipping depth writes avoids z-fighting where
      // strokes overlap; later strokes simply draw over earlier ones.
      depthWrite: false,
    });
    materialCache.set(key, material);
  }
  return material;
}

/**
 * Draw order: highlighter strokes first, under the ink, like a highlighter
 * under a pen's writing; ink after them, and after anything laid on the page
 * below it (the nib shadow draws at INK_RENDER_ORDER - 1).
 */
const HIGHLIGHT_RENDER_ORDER = 1;
export const INK_RENDER_ORDER = 2;

/** Ignore pointer rays on ink so drawing over existing strokes still works. */
function noRaycast(): void {}

export class StrokeMesh {
  readonly mesh: Mesh;
  private readonly geometry = new BufferGeometry();
  private positions = new Float32Array(INITIAL_CAPACITY * 2 * 3);
  private capacity = INITIAL_CAPACITY;
  private pointCount = 0;

  constructor(
    readonly stroke: Stroke,
    private readonly surface: SurfaceSize,
  ) {
    this.allocate(Math.max(INITIAL_CAPACITY, stroke.points.length / 2));
    this.mesh = new Mesh(this.geometry, materialFor(stroke.color, INK_OPACITY[stroke.tool]));
    this.mesh.renderOrder = stroke.tool === 'highlighter' ? HIGHLIGHT_RENDER_ORDER : INK_RENDER_ORDER;
    this.mesh.name = `Stroke:${stroke.id}`;
    this.mesh.raycast = noRaycast;
    // Opt out of IWSDK/pmndrs pointer events as well.
    (this.mesh as unknown as { pointerEvents: string }).pointerEvents = 'none';
    this.mesh.frustumCulled = false;
    this.syncFromStroke();
  }

  /** Rebuild all vertices from `stroke.points` (used when loading a note). */
  syncFromStroke(): void {
    const total = this.stroke.points.length / 2;
    if (total > this.capacity) this.allocate(total);
    this.pointCount = total;
    for (let i = 0; i < total; i++) this.writePair(i);
    this.commit();
  }

  /** Render the newest point after the caller pushed it onto `stroke.points`. */
  appendLatestPoint(): void {
    const total = this.stroke.points.length / 2;
    if (total > this.capacity) this.allocate(total * 2);
    this.pointCount = total;
    // The previous point's side direction depends on the new point, so
    // refresh it as well as the new one.
    if (total >= 2) this.writePair(total - 2);
    this.writePair(total - 1);
    this.commit();
  }

  dispose(): void {
    // Materials are shared through the cache, so only the geometry is ours.
    this.geometry.dispose();
  }

  private allocate(points: number): void {
    const previous = this.positions;
    this.capacity = Math.max(points, INITIAL_CAPACITY);
    this.positions = new Float32Array(this.capacity * 2 * 3);
    this.positions.set(previous.subarray(0, this.positions.length));
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3),
    );

    // Two triangles per segment between consecutive points.
    const index = new Uint32Array(Math.max(this.capacity - 1, 1) * 6);
    for (let i = 0; i < this.capacity - 1; i++) {
      const a = i * 2;
      index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    this.geometry.setIndex(new BufferAttribute(index, 1));
  }

  /** Write the left/right vertex pair for point `i`. */
  private writePair(i: number): void {
    const p = this.stroke.points;
    const last = this.pointCount - 1;
    // Direction from the previous to the next point (clamped at the ends).
    const prev = Math.max(i - 1, 0);
    const next = Math.min(i + 1, last);
    let dx = (p[next * 2] - p[prev * 2]) * this.surface.widthM;
    // Page y grows downwards, local y grows upwards.
    let dy = -(p[next * 2 + 1] - p[prev * 2 + 1]) * this.surface.heightM;
    const length = Math.hypot(dx, dy);
    if (length > 1e-9) {
      dx /= length;
      dy /= length;
    } else {
      // Degenerate direction: fall back to a horizontal footprint.
      dx = 1;
      dy = 0;
    }

    const half = (this.stroke.width * (this.stroke.widths?.[i] ?? 1) * this.surface.widthM) / 2;
    const x = (p[i * 2] - 0.5) * this.surface.widthM;
    const y = (0.5 - p[i * 2 + 1]) * this.surface.heightM;
    // Perpendicular to the direction, in the surface plane.
    const nx = -dy * half;
    const ny = dx * half;
    this.positions.set([x + nx, y + ny, 0, x - nx, y - ny, 0], i * 6);
  }

  private writeDot(): void {
    const p = this.stroke.points;
    const half = (this.stroke.width * this.surface.widthM) / 2;
    const x = (p[0] - 0.5) * this.surface.widthM;
    const y = (0.5 - p[1]) * this.surface.heightM;
    // Vertex order matches the strip index: (0,1,2) and (1,3,2).
    this.positions.set(
      [
        x - half, y + half, 0,
        x - half, y - half, 0,
        x + half, y + half, 0,
        x + half, y - half, 0,
      ],
      0,
    );
  }

  private commit(): void {
    const attribute = this.geometry.getAttribute('position') as BufferAttribute;
    attribute.needsUpdate = true;
    const segments = Math.max(this.pointCount - 1, 0);
    if (this.pointCount === 1) {
      // A single tap draws a square dot from the first two vertex pairs.
      this.writeDot();
      this.geometry.setDrawRange(0, 6);
    } else {
      this.geometry.setDrawRange(0, segments * 6);
    }
    this.geometry.computeBoundingSphere();
  }
}
