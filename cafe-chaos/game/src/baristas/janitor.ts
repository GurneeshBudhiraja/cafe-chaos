/**
 * The janitor: a look on the baristas' rig (models/18-barista/staff_build.py),
 * so it walks and wipes with the same clips (Walk, Wipe, Idle) and is one
 * draw call like them. Dressed so nobody mistakes it: a bright safety-blue
 * coverall with yellow reflective stripes, a white badge on the chest, a
 * yellow bandana, a mop slung across its back, a cleaning cloth in hand,
 * and a bucket set down beside it while it cleans (`setCleaning`).
 */

import type { Object3D } from '@iwsdk/core';
import { Barista, baristaLoaded, type StaffLook } from './barista.js';

/** True once the janitor's model has loaded (the Japanese café's, or a Canadian one: `birch`, `cedar`). */
export function janitorLoaded(look: StaffLook = 'janitor'): boolean {
  return baristaLoaded(look);
}

/** A janitor on stage, its bucket put away. */
export function makeJanitor(look: StaffLook = 'janitor'): Barista {
  const janitor = new Barista(look);
  janitor.root.name = look === 'janitor' ? 'Janitor' : `Janitor-${look}`;
  setCleaning(janitor, false);
  return janitor;
}

/** The bucket beside it while it cleans; folded away (its part collapsed) otherwise. */
export function setCleaning(janitor: Barista, on: boolean): void {
  const bucket: Object3D | undefined = janitor.root.getObjectByName('Bucket');
  bucket?.scale.setScalar(on ? 1 : 0.0001);
}
