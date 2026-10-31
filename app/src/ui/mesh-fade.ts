/**
 * Fades a 3D object (a tablet and its ink) in or out as a whole.
 *
 * Materials are shared between copies of an asset and between strokes of
 * one colour, so they cannot simply be made see-through. While a fade runs,
 * each mesh gets its own transparent copy of its material; at full opacity
 * the shared originals go back and the copies are freed.
 */

import { Mesh, type Material, type Object3D } from '@iwsdk/core';

interface Swap {
  original: Material;
  copy: Material;
}

export class MeshFade {
  private readonly swaps = new Map<Mesh, Swap>();
  private opacity = 1;
  // Bound once, so fading allocates nothing per frame.
  private readonly visit = (object: Object3D): void => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
    let swap = this.swaps.get(object);
    if (!swap) {
      const original = object.material as Material;
      const copy = original.clone();
      copy.transparent = true;
      swap = { original, copy };
      object.material = copy;
      this.swaps.set(object, swap);
    }
    swap.copy.opacity = swap.original.opacity * this.opacity;
  };

  constructor(private readonly root: Object3D) {}

  /** 0 (gone) to 1 (as authored). */
  set(opacity: number): void {
    if (opacity >= 1) {
      this.restore();
      return;
    }
    this.opacity = opacity;
    this.root.traverse(this.visit);
  }

  /** Put the shared materials back and free the copies. */
  restore(): void {
    for (const [mesh, swap] of this.swaps) {
      if (mesh.material === swap.copy) mesh.material = swap.original;
      swap.copy.dispose();
    }
    this.swaps.clear();
    this.opacity = 1;
  }
}
