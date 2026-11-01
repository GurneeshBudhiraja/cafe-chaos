/**
 * Clipping to the page's edges: canvas content (ink, typed text) that pans
 * or zooms past the page is cut off at its border, as a window shows only
 * what is behind it.
 *
 * Four world-space planes along the page's edges, shared by every material
 * that draws on that page (three.js local clipping; the renderer's
 * `localClippingEnabled` must be on). They are re-aimed each frame, since
 * the page moves with the tablet.
 */

import { Plane, Vector3, type Object3D } from '@iwsdk/core';

const normal = new Vector3();
const point = new Vector3();

export class PageClip {
  /** Pass this array as a material's `clippingPlanes` (it is updated in place). */
  readonly planes: Plane[] = [new Plane(), new Plane(), new Plane(), new Plane()];

  constructor(
    private readonly surface: Object3D,
    private readonly widthM: number,
    private readonly heightM: number,
  ) {}

  /** Re-aim the planes at the page's edges where it is now. */
  update(): void {
    this.surface.updateWorldMatrix(true, false);
    const w = this.widthM / 2;
    const h = this.heightM / 2;
    // Each plane faces into the page: what is behind it (outside) is cut.
    this.set(0, 1, 0, -w, 0);
    this.set(1, -1, 0, w, 0);
    this.set(2, 0, 1, 0, -h);
    this.set(3, 0, -1, 0, h);
  }

  private set(index: number, nx: number, ny: number, px: number, py: number): void {
    const matrix = this.surface.matrixWorld;
    point.set(px, py, 0).applyMatrix4(matrix);
    normal.set(nx, ny, 0).transformDirection(matrix);
    this.planes[index].setFromNormalAndCoplanarPoint(normal, point);
  }
}
