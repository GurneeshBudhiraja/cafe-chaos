/**
 * An apple half, made when a knife cuts the apple: half of the skin plus a
 * flat face of flesh (cream, with the core and two seeds).
 *
 * Frame: the same as the whole apple's (origin at its centre, stem +Y). The
 * half lies on the +X side; its cut face is the x = 0 plane, facing -X.
 * Runtime only (it paints a canvas).
 */

import {
  BufferAttribute,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import {
  APPLE_PROFILE,
  APPLE_RADIUS,
  appleSkin,
  createAppleSkinGeometry,
  createStemAndLeaf,
} from '../scene-assets/kitchen.scene-asset.js';

let fleshMaterial: MeshStandardMaterial | null = null;

/** The cut face's look: juicy cream flesh, a faint core outline and two seeds. */
function getFleshMaterial(): MeshStandardMaterial {
  if (fleshMaterial) return fleshMaterial;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  // Flesh: cream, a little greener towards the skin.
  const flesh = ctx.createRadialGradient(c, c, 4, c, c, c);
  flesh.addColorStop(0, '#fbf3d6');
  flesh.addColorStop(0.75, '#f4e7b8');
  flesh.addColorStop(0.97, '#e6d79a');
  flesh.addColorStop(1, '#9d1b1d');
  ctx.fillStyle = flesh;
  ctx.fillRect(0, 0, size, size);
  // The core: a soft oval of slightly darker, fibrous flesh.
  ctx.strokeStyle = 'rgba(190, 165, 95, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(c, c + 4, 30, 44, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(225, 205, 140, 0.45)';
  ctx.fill();
  // The stem's channel and the blossom end.
  ctx.strokeStyle = 'rgba(150, 120, 60, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c, c - 44);
  ctx.lineTo(c, c - 92);
  ctx.moveTo(c, c + 48);
  ctx.lineTo(c, c + 86);
  ctx.stroke();
  // Two seeds, teardrop shaped, in the core.
  for (const dx of [-11, 11]) {
    ctx.save();
    ctx.translate(c + dx, c + 2);
    ctx.rotate(dx < 0 ? -0.25 : 0.25);
    const seed = ctx.createLinearGradient(0, -14, 0, 14);
    seed.addColorStop(0, '#3d2212');
    seed.addColorStop(1, '#6b3b1c');
    ctx.fillStyle = seed;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.quadraticCurveTo(9, 2, 0, 14);
    ctx.quadraticCurveTo(-9, 2, 0, -15);
    ctx.fill();
    ctx.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  fleshMaterial = new MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0 });
  return fleshMaterial;
}

/** The flat cut face: the apple's outline, in the x = 0 plane, facing -X. */
function createCutFace(): Mesh {
  const shape = new Shape();
  const [first, ...rest] = APPLE_PROFILE;
  shape.moveTo(first[0], first[1]);
  for (const [r, y] of rest) shape.lineTo(r, y);
  for (const [r, y] of [...APPLE_PROFILE].reverse().slice(1)) shape.lineTo(-r, y);
  const geometry = new ShapeGeometry(shape, 1);
  // UVs: the outline's box onto the texture (centre to centre).
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  const span = APPLE_RADIUS * 2.05;
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / span + 0.5;
    uv[i * 2 + 1] = position.getY(i) / span + 0.5;
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  // The shape lies in XY facing +Z: turn it to the x = 0 plane, facing -X.
  geometry.rotateY(-Math.PI / 2);
  const face = new Mesh(geometry, getFleshMaterial());
  face.name = 'CutFace';
  return face;
}

/** One half of the apple (the +X side). `withStem`: this half keeps the stem and leaf. */
export function createAppleHalf(withStem: boolean): Group {
  const half = new Group();
  half.name = 'AppleHalf';
  const skin = new Mesh(createAppleSkinGeometry(0, Math.PI), appleSkin);
  skin.name = 'Skin';
  half.add(skin, createCutFace());
  if (withStem) half.add(createStemAndLeaf());
  half.traverse((object) => (object.castShadow = true));
  return half;
}
