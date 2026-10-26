/**
 * Sticky notes, in a few personalities so a wall of them has variety:
 *
 * - classic: the 76 mm butter-yellow square everyone knows, its loose
 *   bottom edge curling gently off the wall;
 * - formal: a stiff warm-white index card (102 x 76 mm) with faint rules
 *   and a clay header line, for agendas and references;
 * - fun: rounded pastel squares (mint, blush, sky) with a folded dog-ear.
 *
 * Contract (all variants): metres; the note faces +Z, its back is the
 * contact plane at z = 0, origin at the centre of the back, top edge +Y.
 * Writing goes on the front face; `WriteArea` marks its centre.
 */

import {
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
} from '@iwsdk/core';
import { bevelBox } from './lib/hardsurface.js';
import { clayMaterial } from './notes-materials.js';

const paper = (color: number) =>
  new MeshStandardMaterial({ color, roughness: 0.86, metalness: 0, side: DoubleSide });

/** Muted, warm versions of the familiar colours (they sit with the clay theme). */
export const STICKY_COLOURS = {
  butter: 0xf3dc7a,
  mint: 0xb5dcc4,
  blush: 0xf1bfc8,
  sky: 0xb4d2ea,
} as const;

function writeArea(root: Group, z: number): void {
  const anchor = new Object3D();
  anchor.name = 'WriteArea';
  anchor.position.z = z;
  root.add(anchor);
}

/** The classic square: glued along the top, curling a little at the bottom. */
function createClassicSticky(): Group {
  const root = new Group();
  root.name = 'StickyClassic';
  const size = 0.076;
  const geometry = new PlaneGeometry(size, size, 1, 16);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    // Free below the glue strip (the top fifth): lift grows towards the bottom.
    const t = Math.min(1, Math.max(0, (size * 0.3 - y) / (size * 0.8)));
    position.setZ(i, 0.0004 + 0.007 * t * t * t);
  }
  geometry.computeVertexNormals();
  const sheet = new Mesh(geometry, paper(STICKY_COLOURS.butter));
  sheet.name = 'Sheet';
  root.add(sheet);
  writeArea(root, 0.001);
  return root;
}

/** The formal index card: stiff, flat, ruled, with a clay header line. */
function createFormalCard(): Group {
  const root = new Group();
  root.name = 'StickyFormal';
  const width = 0.102;
  const height = 0.076;
  const thickness = 0.0007;
  const card = new Mesh(bevelBox(width, height, thickness, 0.0002, 0.0015, 2), paper(0xf7f2ea));
  card.name = 'Card';
  card.position.z = thickness / 2;
  root.add(card);

  const rules = new Group();
  rules.name = 'Rules';
  const ruleMaterial = new MeshStandardMaterial({ color: 0xb9cbe0, roughness: 0.9 });
  const ruleGeometry = new PlaneGeometry(width - 0.012, 0.0005);
  for (let i = 0; i < 6; i++) {
    const rule = new Mesh(ruleGeometry, ruleMaterial);
    rule.name = `Rule${i}`;
    rule.position.set(0, height / 2 - 0.022 - i * 0.0095, thickness + 0.0001);
    rules.add(rule);
  }
  const header = new Mesh(new PlaneGeometry(width - 0.012, 0.0009), clayMaterial);
  header.name = 'HeaderRule';
  header.position.set(0, height / 2 - 0.013, thickness + 0.0001);
  rules.add(header);
  root.add(rules);
  writeArea(root, thickness + 0.0002);
  return root;
}

/** A rounded pastel square with its bottom-right corner folded over. */
function createFunSticky(name: string, colour: number): Group {
  const root = new Group();
  root.name = name;
  const s = 0.076;
  const h = s / 2;
  const r = 0.008;
  const fold = 0.016;
  // Outline: rounded corners, with the folded corner cut on a diagonal.
  const outline = new Shape();
  outline.moveTo(-h + r, -h);
  outline.lineTo(h - fold, -h);
  outline.lineTo(h, -h + fold);
  outline.lineTo(h, h - r);
  outline.quadraticCurveTo(h, h, h - r, h);
  outline.lineTo(-h + r, h);
  outline.quadraticCurveTo(-h, h, -h, h - r);
  outline.lineTo(-h, -h + r);
  outline.quadraticCurveTo(-h, -h, -h + r, -h);
  const sheet = new Mesh(new ShapeGeometry(outline, 12), paper(colour));
  sheet.name = 'Sheet';
  sheet.position.z = 0.0004;
  root.add(sheet);

  // The folded-over corner: the paper's back, a shade darker, lying on top.
  const flapShape = new Shape();
  flapShape.moveTo(h - fold, -h);
  flapShape.lineTo(h, -h + fold);
  flapShape.lineTo(h - fold, -h + fold);
  flapShape.closePath();
  const back = new MeshStandardMaterial({ color: colour, roughness: 0.9, side: DoubleSide });
  back.color.multiplyScalar(0.86);
  const flap = new Mesh(new ShapeGeometry(flapShape), back);
  flap.name = 'DogEar';
  flap.position.z = 0.0008;
  root.add(flap);
  writeArea(root, 0.001);
  return root;
}

export const stickyClassicPrototype = createClassicSticky();
export const stickyFormalPrototype = createFormalCard();
export const stickyMintPrototype = createFunSticky('StickyMint', STICKY_COLOURS.mint);
export const stickyBlushPrototype = createFunSticky('StickyBlush', STICKY_COLOURS.blush);
export const stickySkyPrototype = createFunSticky('StickySky', STICKY_COLOURS.sky);
