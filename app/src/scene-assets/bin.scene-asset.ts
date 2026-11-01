/**
 * The bin sticky notes are thrown into: a small round pedal-bin shape, warm
 * dark with a light satin rim (so it stays findable in a dim room) and the
 * clay accent band, with a lid hinged at the back that swings open when a
 * carried sticky note is over it.
 *
 * Contract: metres; origin at the centre of the bottom; the opening faces
 * +Y; the front faces +Z (toward the viewer); 10 cm across, 11 cm tall.
 * Named parts: Body, Inside, Floor, Rim, Band, LidHinge (a group on the
 * back edge of the rim: rotating it about X by -BIN_LID_OPEN_RAD opens the
 * lid), and in it Lid, LidRim and LidHandle (a tab at the lid's front).
 */

import { CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, TorusGeometry } from '@iwsdk/core';
import { bevelBox } from './lib/hardsurface.js';
import { bodyMaterial, glowingClayMaterial, satinLightMaterial } from './notes-materials.js';

export const BIN_RADIUS_M = 0.05;
export const BIN_HEIGHT_M = 0.11;
/** How far the lid swings open (radians). */
export const BIN_LID_OPEN_RAD = (70 * Math.PI) / 180;

const insideMaterial = new MeshStandardMaterial({ color: 0x15110e, roughness: 0.9, side: DoubleSide });

function createBin(): Group {
  const root = new Group();
  root.name = 'Bin';
  // Body: slightly tapered, open at the top (no top cap).
  const body = new Mesh(new CylinderGeometry(BIN_RADIUS_M, BIN_RADIUS_M * 0.86, BIN_HEIGHT_M, 48, 1, true), bodyMaterial);
  body.name = 'Body';
  body.position.y = BIN_HEIGHT_M / 2;
  root.add(body);
  const inside = new Mesh(new CylinderGeometry(BIN_RADIUS_M * 0.985, BIN_RADIUS_M * 0.85, BIN_HEIGHT_M, 48, 1, true), insideMaterial);
  inside.name = 'Inside';
  inside.position.y = BIN_HEIGHT_M / 2;
  root.add(inside);
  const floor = new Mesh(new CylinderGeometry(BIN_RADIUS_M * 0.86, BIN_RADIUS_M * 0.86, 0.003, 48), bodyMaterial);
  floor.name = 'Floor';
  floor.position.y = 0.0015;
  root.add(floor);

  // A light rim round the top, and the clay band just below it.
  const rim = new Mesh(new TorusGeometry(BIN_RADIUS_M, 0.0028, 12, 64), satinLightMaterial);
  rim.name = 'Rim';
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BIN_HEIGHT_M;
  root.add(rim);
  const band = new Mesh(new CylinderGeometry(BIN_RADIUS_M * 1.004, BIN_RADIUS_M * 0.99, 0.008, 48, 1, true), glowingClayMaterial);
  band.name = 'Band';
  band.position.y = BIN_HEIGHT_M - 0.012;
  root.add(band);

  // The lid, hinged on the back edge of the rim.
  const hinge = new Group();
  hinge.name = 'LidHinge';
  hinge.position.set(0, BIN_HEIGHT_M + 0.003, -BIN_RADIUS_M);
  const lid = new Mesh(new CylinderGeometry(BIN_RADIUS_M * 1.04, BIN_RADIUS_M * 1.04, 0.006, 48), bodyMaterial);
  lid.name = 'Lid';
  lid.position.set(0, 0.003, BIN_RADIUS_M);
  hinge.add(lid);
  const lidRim = new Mesh(new TorusGeometry(BIN_RADIUS_M * 1.04, 0.0018, 10, 64), satinLightMaterial);
  lidRim.name = 'LidRim';
  lidRim.rotation.x = Math.PI / 2;
  lidRim.position.set(0, 0.003, BIN_RADIUS_M);
  hinge.add(lidRim);
  const handle = new Mesh(bevelBox(0.03, 0.007, 0.01, 0.0015, 0.003, 2), satinLightMaterial);
  handle.name = 'LidHandle';
  handle.position.set(0, 0.005, BIN_RADIUS_M * 1.95);
  hinge.add(handle);
  root.add(hinge);
  return root;
}

export const binPrototype = createBin();
