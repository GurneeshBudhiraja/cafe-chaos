/**
 * The 3D object for one sticky note: its paper (the sticky-note model of
 * its kind) and, just in front, the writing area the pen inks on.
 *
 * Sticky notes are shown 1.4 times their real size (a 7.6 cm square becomes
 * about 10.6 cm): hand tracking needs a bit more room to write than a real
 * pen does. The writing area is a flat, unseen plane named like the
 * tablet's page (WRITING_SURFACE_NAME), so InkSystem treats it the same way.
 *
 * Layout: metres; the note faces +Z with its back at z = 0 (the side that
 * sticks to a wall); origin at the centre; top edge +Y.
 */

import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from '@iwsdk/core';
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
  const paper = STICKY_PROTOTYPES[kind].clone();
  paper.name = 'Paper';
  paper.scale.setScalar(STICKY_SCALE);
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

/** Free a sticky note object's own geometry (the paper's is shared with its model). */
export function disposeStickyObject(root: Group): void {
  const area = root.getObjectByName(WRITING_SURFACE_NAME);
  if (area instanceof Mesh) area.geometry.dispose();
  root.removeFromParent();
}
