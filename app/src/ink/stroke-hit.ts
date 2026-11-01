/**
 * Which strokes a point on the page touches (what the eraser rubs out), and
 * which a lasso loop surrounds.
 *
 * Page coordinates run 0..1 across the page's width (x) and height (y);
 * the page is wider than tall (PAGE_ASPECT), so y distances are scaled to
 * width units before measuring. Radii and stroke widths are fractions of the
 * page width, as stored. Pure functions (no IWSDK).
 */

import { PAGE_ASPECT, type Stroke } from '../notes/note-model.js';

/** A box on the page (page units). */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Each stroke's points' bounding box (page units), cached by its points array (replaced, never edited, after a stroke ends). */
const boundsCache = new WeakMap<number[], Bounds>();

function boundsOf(points: number[]): Bounds {
  let bounds = boundsCache.get(points);
  if (!bounds) {
    bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (let i = 0; i < points.length; i += 2) {
      bounds.minX = Math.min(bounds.minX, points[i]);
      bounds.maxX = Math.max(bounds.maxX, points[i]);
      bounds.minY = Math.min(bounds.minY, points[i + 1]);
      bounds.maxY = Math.max(bounds.maxY, points[i + 1]);
    }
    boundsCache.set(points, bounds);
  }
  return bounds;
}

/** Whether a circle at page point (x, y) with `radius` (page widths) touches `stroke`'s ink. */
export function strokeTouchesCircle(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const p = stroke.points;
  if (p.length < 2) return false;
  const reach = radius + stroke.width / 2;
  // Quick reject on the bounding box, grown by the reach (y in page heights).
  const b = boundsOf(p);
  const reachY = reach * PAGE_ASPECT;
  if (x < b.minX - reach || x > b.maxX + reach || y < b.minY - reachY || y > b.maxY + reachY) return false;
  if (p.length === 2) return distance(x, y, p[0], p[1]) <= reach;
  for (let i = 2; i < p.length; i += 2) {
    if (distanceToSegment(x, y, p[i - 2], p[i - 1], p[i], p[i + 1]) <= reach) return true;
  }
  return false;
}

/** Distance in page widths between two page points. */
function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, (ay - by) / PAGE_ASPECT);
}

/** Distance in page widths from point (x, y) to the segment a-b. */
function distanceToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  // In width units, so the page's aspect does not skew the projection.
  const px = x - ax;
  const py = (y - ay) / PAGE_ASPECT;
  const sx = bx - ax;
  const sy = (by - ay) / PAGE_ASPECT;
  const length2 = sx * sx + sy * sy;
  const t = length2 > 0 ? Math.min(1, Math.max(0, (px * sx + py * sy) / length2)) : 0;
  return Math.hypot(px - sx * t, py - sy * t);
}

/**
 * Whether a lasso loop (page points [x0, y0, x1, y1, ...], closed from its
 * last point back to its first) surrounds `stroke`: at least half of the
 * stroke's points inside, so a loose loop still catches a word.
 */
export function strokeInsideLoop(stroke: Stroke, loop: readonly number[]): boolean {
  const p = stroke.points;
  if (p.length < 2 || loop.length < 6) return false;
  let inside = 0;
  for (let i = 0; i < p.length; i += 2) if (pointInLoop(p[i], p[i + 1], loop)) inside++;
  return inside * 2 >= p.length / 2;
}

/** The box around several strokes' ink (their points, grown by half their widths), or null for none. */
export function strokesBounds(strokes: readonly Stroke[]): Bounds | null {
  if (strokes.length === 0) return null;
  const all: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const stroke of strokes) {
    const b = boundsOf(stroke.points);
    const half = stroke.width / 2;
    all.minX = Math.min(all.minX, b.minX - half);
    all.maxX = Math.max(all.maxX, b.maxX + half);
    all.minY = Math.min(all.minY, b.minY - half * PAGE_ASPECT);
    all.maxY = Math.max(all.maxY, b.maxY + half * PAGE_ASPECT);
  }
  return all;
}

/** Even-odd point-in-polygon test on page points. */
function pointInLoop(x: number, y: number, loop: readonly number[]): boolean {
  let inside = false;
  const n = loop.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = loop[i * 2];
    const ay = loop[i * 2 + 1];
    const bx = loop[j * 2];
    const by = loop[j * 2 + 1];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
