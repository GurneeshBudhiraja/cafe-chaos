/**
 * The 3D object for one sticky note: its paper and, just in front, the
 * writing area the pen inks on.
 *
 * The paper is the realistic sticky note made in Blender (`sticky-note`:
 * paper fibres, a soft edge, the adhesive strip on its back), tinted for
 * each kind; its curl is flattened so ink never hides under a lifted
 * corner. The index card keeps its code-built model (a different shape),
 * as does any kind if the model is missing.
 *
 * Sticky notes are shown 1.4 times their real size (a 7.6 cm square becomes
 * about 10.6 cm): hand tracking needs a bit more room to write than a real
 * pen does. The writing area is a flat, unseen plane named like the
 * tablet's page (WRITING_SURFACE_NAME), so InkSystem treats it the same way.
 *
 * Layout: metres; the note faces +Z with its back at z = 0 (the side that
 * sticks to a wall); origin at the centre; top edge +Y.
 */

import {
  AssetManager,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type MeshStandardMaterial,
  type Object3D,
} from '@iwsdk/core';
import { STICKY_COLOURS } from '../scene-assets/sticky-notes.scene-asset.js';
import { STICKY_PROTOTYPES } from '../scene-assets/sticky-pad.scene-asset.js';
import { WRITING_SURFACE_NAME } from '../scene-assets/tablet.scene-asset.js';
import type { StickyKind } from './sticky-model.js';

/** Sticky notes in the room, relative to the real thing. */
export const STICKY_SCALE = 1.4;
/** Each kind's paper and writing area (metres, at real size, inside a small margin). */
const PAPER_M: Record<StickyKind, [number, number]> = {
  classic: [0.076, 0.076],
  mint: [0.076, 0.076],
  blush: [0.076, 0.076],
  sky: [0.076, 0.076],
  formal: [0.102, 0.076],
};
const MARGIN_M = 0.005;
/** The model's curl (up to 8 mm off its surface) is pressed this flat. */
const CURL_FLATTEN = 0.2;
/** Paper tints for the model, by kind (the model itself is the classic butter yellow). */
const TINTS: Partial<Record<StickyKind, number>> = {
  mint: STICKY_COLOURS.mint,
  blush: STICKY_COLOURS.blush,
  sky: STICKY_COLOURS.sky,
};
/** The model's paper materials: the face and back, and the slightly darker edge. */
const PAPER_MATERIAL = 'NotePaper';
const EDGE_MATERIAL = 'NoteEdgePaper';
/** The edge paper is this much darker than the face. */
const EDGE_SHADE = 0.85;
/** The writing area sits this far in front of the paper's back (real size, metres): over the paper's face. */
const WRITE_DEPTH_M = 0.0015;

/** Not drawn, but there: the pen and rays find it; the ink draws on it. */
const unseen = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/** The sticky note's size in the room (metres): width and height. */
export function stickySize(kind: StickyKind): [number, number] {
  const [w, h] = PAPER_M[kind];
  return [w * STICKY_SCALE, h * STICKY_SCALE];
}

/** A sticky note of `kind`, named `Sticky:<id>`. */
export function createStickyObject(kind: StickyKind, id: string): Group {
  const root = new Group();
  root.name = `Sticky:${id}`;
  const paper = createStickyPaper(kind);
  paper.name = 'Paper';
  paper.scale.x *= STICKY_SCALE;
  paper.scale.y *= STICKY_SCALE;
  paper.scale.z *= STICKY_SCALE;
  root.add(paper);

  const [w, h] = PAPER_M[kind];
  const area = new Mesh(
    new PlaneGeometry((w - MARGIN_M * 2) * STICKY_SCALE, (h - MARGIN_M * 2) * STICKY_SCALE),
    unseen,
  );
  area.name = WRITING_SURFACE_NAME;
  area.position.z = WRITE_DEPTH_M * STICKY_SCALE;
  root.add(area);
  return root;
}

/** Free a sticky note object's own geometry and tinted paper (the model's own are shared). */
export function disposeStickyObject(root: Group): void {
  const area = root.getObjectByName(WRITING_SURFACE_NAME);
  if (area instanceof Mesh) area.geometry.dispose();
  root.traverse((object) => {
    if (object instanceof Mesh && (object.material as MeshStandardMaterial).userData.tintedCopy) {
      (object.material as MeshStandardMaterial).dispose();
    }
  });
  root.removeFromParent();
}

/**
 * A sticky note's paper at real size (back at z = 0, facing +Z): the
 * Blender model, tinted for its kind and its curl flattened, or the
 * code-built model (the index card, or when the model is missing).
 */
export function createStickyPaper(kind: StickyKind): Object3D {
  const model = kind === 'formal' ? undefined : AssetManager.getGLTF('sticky-note')?.scene;
  if (!model) return STICKY_PROTOTYPES[kind].clone();
  model.scale.z = CURL_FLATTEN;
  const tint = TINTS[kind];
  if (tint === undefined) return model;
  // Each copy gets its own tinted paper (materials are shared between copies).
  // The tint replaces the model's yellow colour picture; its fibre relief stays.
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const material = object.material as MeshStandardMaterial;
    if (material.name !== PAPER_MATERIAL && material.name !== EDGE_MATERIAL) return;
    const tinted = material.clone();
    tinted.userData.tintedCopy = true;
    tinted.map = null;
    tinted.color.set(tint);
    if (material.name === EDGE_MATERIAL) tinted.color.multiplyScalar(EDGE_SHADE);
    object.material = tinted;
  });
  return model;
}
