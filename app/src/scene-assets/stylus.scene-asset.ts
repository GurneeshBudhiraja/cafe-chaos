/**
 * Stylus: the pen for writing on the tablet. Slimmer than Logitech's MX Ink
 * (164 mm x 18 mm) and closer to a real pencil, so it reads as a writing
 * tool rather than a controller: 155 mm long, 11.6 mm across.
 *
 * Built from revolved profiles (lathes), tail to nib: a rounded end cap, a
 * glossy barrel with a flat magnetic facet along one side (it docks against
 * the tablet's top rail, Apple Pencil style), a matte grip, the clay band
 * (the app's accent, where the eye lands), a tapered cone and a soft nib.
 *
 * Light on purpose: a warm white ceramic body stays visible in a dark
 * room's passthrough and on see-through glasses, where dark colours render
 * as transparent. The clay band glows softly so the pen can be found in
 * the dark, and the nib is graphite so you see where ink lands on paper.
 *
 * Contract: metres; long axis +X with the nib at +X; origin at the
 * middle of the length on the axis; the docking facet faces -Y. Named
 * parts: Barrel, Grip, Band, Cone, Nib, TailCap, DockFacet, and the anchor
 * `NibTip` (an empty at the writing point).
 */

import { BufferGeometry, Group, LatheGeometry, Mesh, Object3D, Vector2 } from '@iwsdk/core';
import { bevelBox } from './lib/hardsurface.js';
import {
  ceramicMaterial,
  glowingClayMaterial,
  graphiteMaterial,
  lightGripMaterial,
} from './notes-materials.js';

export const STYLUS_LENGTH_M = 0.155;
export const STYLUS_RADIUS_M = 0.0058;
const SEGMENTS = 48;
const HALF = STYLUS_LENGTH_M / 2;

/** Revolve `[radius, alongFromTail]` points into a mesh along +X. */
function revolve(points: Array<[number, number]>): BufferGeometry {
  const profile = points.map(([r, y]) => new Vector2(r, y - HALF));
  const geometry = new LatheGeometry(profile, SEGMENTS);
  // Lathe revolves around +Y; lay it along +X (nib forward).
  geometry.rotateZ(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function part(name: string, geometry: BufferGeometry, material = ceramicMaterial): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

function createStylus(): Group {
  const root = new Group();
  root.name = 'Stylus';
  const R = STYLUS_RADIUS_M;

  // Rounded tail cap, closed at the very end.
  root.add(part('TailCap', revolve([
    [0, 0], [0.0022, 0.0002], [0.0038, 0.0008], [0.0050, 0.0020], [0.0056, 0.0034], [R, 0.0050],
  ]), lightGripMaterial));
  // Glossy barrel.
  root.add(part('Barrel', revolve([[R, 0.0050], [R, 0.0880]])));
  // Matte grip, a hair slimmer, with soft shoulders.
  root.add(part('Grip', revolve([
    [R, 0.0880], [R - 0.0002, 0.0895], [R - 0.0002, 0.1105], [R, 0.1120],
  ]), lightGripMaterial));
  // Clay band, very slightly proud of the barrel.
  root.add(part('Band', revolve([
    [R, 0.1120], [R + 0.0002, 0.1126], [R + 0.0002, 0.1174], [R, 0.1180],
  ]), glowingClayMaterial));
  // Tapered cone to the nib.
  root.add(part('Cone', revolve([
    [R, 0.1180], [R - 0.0004, 0.1240], [0.0042, 0.1350], [0.0028, 0.1455], [0.0018, 0.1500],
  ])));
  // Soft rounded nib.
  root.add(part('Nib', revolve([
    [0.0018, 0.1500], [0.0016, 0.1530], [0.0011, 0.1542], [0.0005, 0.1548], [0, STYLUS_LENGTH_M],
  ]), graphiteMaterial));

  // Flat magnetic facet along the barrel's underside (-Y), slightly inset so
  // it reads as a machined flat rather than a stuck-on strip.
  const facet = part('DockFacet', bevelBox(0.07, 0.0008, 0.0046, 0.0002), lightGripMaterial);
  facet.position.set(-0.018, -R + 0.0003, 0);
  root.add(facet);

  // The writing point, for the ink system and docking maths.
  const tip = new Object3D();
  tip.name = 'NibTip';
  tip.position.x = HALF;
  root.add(tip);

  return root;
}

export const stylusPrototype = createStylus();
