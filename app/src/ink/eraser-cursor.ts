/**
 * The eraser's ring: a thin circle on the page under the nib, the size of
 * what the eraser rubs out, so you see exactly what it will remove before
 * it touches. Drawn in faint ink colour (warm white would vanish on paper).
 *
 * One per tablet, a child of its ink layer (tablet-local metres, page at
 * z = 0, x right, y up).
 */

import { Mesh, MeshBasicMaterial, RingGeometry, type Object3D } from '@iwsdk/core';
import { THEME } from '../ui/theme.js';

/** The ring's line, as a fraction of its radius. */
const LINE = 0.12;
const OPACITY = 0.55;

export class EraserCursor {
  private readonly mesh: Mesh;

  constructor(parent: Object3D) {
    // A unit ring, scaled to the eraser's radius.
    this.mesh = new Mesh(
      new RingGeometry(1 - LINE, 1, 48),
      new MeshBasicMaterial({ color: THEME.inkOnLight, transparent: true, opacity: OPACITY, depthWrite: false }),
    );
    this.mesh.name = 'EraserCursor';
    // Drawn on the page, it must not catch pointer rays meant for the page.
    this.mesh.raycast = () => {};
    this.mesh.renderOrder = 3; // Over the ink.
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /** Show the ring centred on tablet-local (x, y), with `radiusM` metres. */
  show(x: number, y: number, radiusM: number): void {
    this.mesh.position.set(x, y, 0);
    this.mesh.scale.setScalar(radiusM);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
