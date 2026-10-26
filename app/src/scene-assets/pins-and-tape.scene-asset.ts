/**
 * Ways to hold a note up: a push pin and a strip of washi tape.
 *
 * Push pin: a clay head (flanged base, waisted grip, rounded cap, the shape
 * your fingers know) on a brushed metal needle. Contract: metres; the
 * needle points -Z into the surface, the contact plane is z = 0 (the
 * flange's underside), origin on the axis there. Parts: Head, Needle.
 *
 * Washi tape: a translucent paper strip with torn zigzag ends and a soft
 * stripe, for a lighter, crafty look. Contract: lies flat facing +Z on the
 * contact plane z = 0, centred on its origin, 64 x 16 mm.
 */

import {
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
} from '@iwsdk/core';
import { clayMaterial, metalMaterial } from './notes-materials.js';

function createPushPin(): Group {
  const root = new Group();
  root.name = 'PushPin';
  // Profile [radius, height] from the contact plane up.
  const profile = [
    [0, 0], [0.0052, 0], [0.0056, 0.0006], [0.0052, 0.0014], [0.0028, 0.0024],
    [0.0024, 0.0050], [0.0028, 0.0068], [0.0042, 0.0080], [0.0046, 0.0094],
    [0.0040, 0.0108], [0.0024, 0.0118], [0, 0.0121],
  ].map(([r, y]) => new Vector2(r, y));
  const headGeometry = new LatheGeometry(profile, 40);
  headGeometry.rotateX(Math.PI / 2); // Lathe axis +Y becomes +Z.
  headGeometry.computeVertexNormals();
  const head = new Mesh(headGeometry, clayMaterial);
  head.name = 'Head';
  root.add(head);

  const needleGeometry = new CylinderGeometry(0.0005, 0.00015, 0.009, 12);
  needleGeometry.rotateX(Math.PI / 2);
  const needle = new Mesh(needleGeometry, metalMaterial);
  needle.name = 'Needle';
  needle.position.z = -0.0045;
  root.add(needle);
  return root;
}

const washiMaterial = new MeshStandardMaterial({
  color: 0xe7b9a3,
  roughness: 0.9,
  transparent: true,
  opacity: 0.78,
  side: DoubleSide,
});
const washiStripeMaterial = new MeshStandardMaterial({
  color: 0xd4704f,
  roughness: 0.9,
  transparent: true,
  opacity: 0.55,
  side: DoubleSide,
});

/** A strip outline with zigzag (torn) short ends. */
function tornStrip(length: number, width: number, teeth: number): Shape {
  const shape = new Shape();
  const hl = length / 2;
  const hw = width / 2;
  const step = width / teeth;
  shape.moveTo(-hl, -hw);
  shape.lineTo(hl, -hw);
  for (let i = 1; i <= teeth; i++) shape.lineTo(hl + (i % 2 ? 0.0012 : 0), -hw + i * step);
  shape.lineTo(-hl, hw);
  for (let i = 1; i <= teeth; i++) shape.lineTo(-hl - (i % 2 ? 0.0012 : 0), hw - i * step);
  shape.closePath();
  return shape;
}

function createWashiTape(): Group {
  const root = new Group();
  root.name = 'WashiTape';
  const strip = new Mesh(new ShapeGeometry(tornStrip(0.064, 0.016, 8)), washiMaterial);
  strip.name = 'Strip';
  strip.position.z = 0.0002;
  root.add(strip);
  const stripe = new Mesh(new ShapeGeometry(tornStrip(0.0635, 0.004, 2)), washiStripeMaterial);
  stripe.name = 'Stripe';
  stripe.position.z = 0.0003;
  root.add(stripe);
  return root;
}

export const pushPinPrototype = createPushPin();
export const washiTapePrototype = createWashiTape();
