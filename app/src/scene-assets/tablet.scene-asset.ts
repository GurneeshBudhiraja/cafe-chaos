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
  CapsuleGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  PlaneGeometry,
} from '@iwsdk/core';
import { PAGE_ASPECT } from '../notes/note-model.js';
import { bevelBox } from './lib/hardsurface.js';
import {
  bodyMaterial,
  glowingClayMaterial,
  gripMaterial,
  satinLightMaterial,
  trimMaterial,
} from './notes-materials.js';
import { roundedRim } from './notes-shapes.js';
import { createPaperGrainTexture } from './paper-texture.js';
import { STYLUS_RADIUS_M } from './stylus.scene-asset.js';

/** Writing area size in meters. Height follows the shared page aspect ratio. */
export const SURFACE_WIDTH_M = 0.36;
export const SURFACE_HEIGHT_M = SURFACE_WIDTH_M / PAGE_ASPECT;

/** Runtime object name of the drawable mesh; the ink system looks for it. */
export const WRITING_SURFACE_NAME = 'WritingSurface';
/** Empty where a docked stylus's axis sits (its facet down on the rail). */
export const STYLUS_DOCK_NAME = 'StylusDock';

const BEZEL_M = 0.016;
const BODY_DEPTH_M = 0.009;
const CORNER_RADIUS_M = 0.02;
const RAIL_LENGTH_M = 0.17;
const RAIL_HEIGHT_M = 0.004;
const RAIL_DEPTH_M = 0.007;

/** Height of the tablet's top edge (the stylus rail's top) above the page centre. */
export const TABLET_TOP_M = SURFACE_HEIGHT_M / 2 + BEZEL_M + RAIL_HEIGHT_M;
/** Half the tablet's width, bezel included. */
export const TABLET_HALF_WIDTH_M = SURFACE_WIDTH_M / 2 + BEZEL_M;
/** How far the tablet's back sits behind the page (the body's depth). */
export const TABLET_BACK_M = BODY_DEPTH_M;

/**
 * The page: paper grain under a light clear coat, so the room's light
 * slides across it like a real tablet screen (the "screen reflection"),
 * while it stays matte enough to read as paper.
 */
const paperMaterial = new MeshPhysicalMaterial({
  color: 0xffffff,
  map: createPaperGrainTexture(),
  roughness: 0.88,
  clearcoat: 0.55,
  clearcoatRoughness: 0.18,
});

/**
 * Tablet contract: metres; the page faces +Z with its centre at the origin
 * (z = 0); the body sits behind it. The stylus rail runs along the top
 * edge, and `StylusDock` marks where a docked stylus's axis goes.
 */
function createTablet(): Group {
  const root = new Group();
  root.name = 'Tablet';
  const width = SURFACE_WIDTH_M + BEZEL_M * 2;
  const height = SURFACE_HEIGHT_M + BEZEL_M * 2;

  // Rounded, softly bevelled warm-dark slab; its front face is at z = 0.
  const body = new Mesh(bevelBox(width, height, BODY_DEPTH_M, 0.0025, CORNER_RADIUS_M, 6), bodyMaterial);
  body.name = 'TabletBody';
  body.position.z = -BODY_DEPTH_M / 2;
  root.add(body);

  // Soft-touch back panel, inset so the glossy shell wraps it.
  const back = new Mesh(
    bevelBox(width - 0.03, height - 0.03, 0.001, 0.0004, CORNER_RADIUS_M - 0.012, 4),
    gripMaterial,
  );
  back.name = 'TabletBack';
  back.position.z = -BODY_DEPTH_M - 0.0003;
  root.add(back);

  // A light satin rim around the front edge: keeps the dark slab's outline
  // readable in a dark room and on see-through glasses.
  const rim = new Mesh(roundedRim(width, height, CORNER_RADIUS_M, 0.0016, 0.0032), satinLightMaterial);
  rim.name = 'EdgeRim';
  rim.position.z = -0.0032 + 0.0002;
  root.add(rim);

  // A thin dark lip framing the page, so it sits in the slab like a screen.
  const lip = new Mesh(
    roundedRim(SURFACE_WIDTH_M + 0.003, SURFACE_HEIGHT_M + 0.003, 0.0035, 0.0018, 0.0006),
    trimMaterial,
  );
  lip.name = 'PageLip';
  lip.position.z = 0.0001;
  root.add(lip);

  // A tiny softly glowing status dot on the bottom bezel: findable in the dark.
  const dot = new Mesh(bevelBox(0.006, 0.0018, 0.0008, 0.0003, 0.0009, 3), glowingClayMaterial);
  dot.name = 'StatusLight';
  dot.position.set(0, -height / 2 + BEZEL_M / 2, 0.0002);
  root.add(dot);

  // The page itself: a plane facing +Z with its center at the tablet origin.
  const surface = new Mesh(new PlaneGeometry(SURFACE_WIDTH_M, SURFACE_HEIGHT_M), paperMaterial);
  surface.name = WRITING_SURFACE_NAME;
  surface.position.z = 0.0005;
  root.add(surface);

  // Stylus rail along the top edge, with a clay mark where the pen clicks in.
  const rail = new Group();
  rail.name = 'StylusRail';
  rail.position.set(0, height / 2 + RAIL_HEIGHT_M / 2 - 0.0008, -BODY_DEPTH_M / 2);
  const railBar = new Mesh(bevelBox(RAIL_LENGTH_M, RAIL_HEIGHT_M, RAIL_DEPTH_M, 0.0008, 0.0012, 3), satinLightMaterial);
  railBar.name = 'RailBar';
  rail.add(railBar);
  const mark = new Mesh(bevelBox(0.018, 0.0016, 0.0036, 0.0003, 0.0005, 2), glowingClayMaterial);
  mark.name = 'RailMark';
  mark.position.y = RAIL_HEIGHT_M / 2 - 0.0002;
  rail.add(mark);
  root.add(rail);

  const dock = new Object3D();
  dock.name = STYLUS_DOCK_NAME;
  dock.position.set(0, rail.position.y + RAIL_HEIGHT_M / 2 + STYLUS_RADIUS_M - 0.0003, rail.position.z);
  root.add(dock);

  return root;
}

function createTabletHandle(): Group {
  const root = new Group();
  root.name = 'TabletHandle';

  // A horizontal grip bar. Large enough to target with a ray or a hand.
  const grip = new Mesh(new CapsuleGeometry(0.012, 0.14, 4, 16), trimMaterial);
  grip.rotation.z = Math.PI / 2;
  grip.name = 'TabletHandleGrip';
  root.add(grip);

  return root;
}

export const tabletPrototype = createTablet();
export const tabletHandlePrototype = createTabletHandle();
