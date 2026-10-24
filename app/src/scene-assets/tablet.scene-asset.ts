/**
 * Procedural writing tablet and its separate movement handle.
 *
 * These are parentless prototypes registered in `src/assets.ts`. IWSDK clones
 * the hierarchy for each scene placement but shares geometry and materials, so
 * nothing here may be mutated after registration.
 *
 * The tablet and the handle are deliberately separate assets (and separate
 * scene entities). Writing happens on the tablet; moving happens only through
 * the handle. That keeps ink gestures and movement gestures from conflicting.
 */

import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from '@iwsdk/core';
import { PAGE_ASPECT } from '../notes/note-model.js';

/** Writing area size in meters. Height follows the shared page aspect ratio. */
export const SURFACE_WIDTH_M = 0.36;
export const SURFACE_HEIGHT_M = SURFACE_WIDTH_M / PAGE_ASPECT;

/** Runtime object name of the drawable mesh; the ink system looks for it. */
export const WRITING_SURFACE_NAME = 'WritingSurface';

const BEZEL_M = 0.018;
const BODY_DEPTH_M = 0.012;

function createTablet(): Group {
  const root = new Group();
  root.name = 'Tablet';

  // Dark body slightly larger than the page, so the page reads as a screen.
  const body = new Mesh(
    new BoxGeometry(
      SURFACE_WIDTH_M + BEZEL_M * 2,
      SURFACE_HEIGHT_M + BEZEL_M * 2,
      BODY_DEPTH_M,
    ),
    new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 }),
  );
  body.name = 'TabletBody';
  // Put the body behind the origin so the page sits exactly at z = 0+.
  body.position.z = -BODY_DEPTH_M / 2;
  root.add(body);

  // The page itself: a plane facing +Z with its center at the tablet origin.
  const surface = new Mesh(
    new PlaneGeometry(SURFACE_WIDTH_M, SURFACE_HEIGHT_M),
    new MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.9 }),
  );
  surface.name = WRITING_SURFACE_NAME;
  surface.position.z = 0.0005;
  root.add(surface);

  return root;
}

function createTabletHandle(): Group {
  const root = new Group();
  root.name = 'TabletHandle';

  // A horizontal grip bar. Large enough to target with a ray or a hand.
  const grip = new Mesh(
    new CapsuleGeometry(0.014, 0.14, 4, 12),
    new MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.4 }),
  );
  grip.rotation.z = Math.PI / 2;
  grip.name = 'TabletHandleGrip';
  root.add(grip);

  return root;
}

export const tabletPrototype = createTablet();
export const tabletHandlePrototype = createTabletHandle();
