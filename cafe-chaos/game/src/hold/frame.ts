/**
 * The hold frame: a thin, warm, rounded band lying on the table just
 * outside the café's base. It is invisible until a hand comes near
 * enough to take the café, glows a little then, and more while the café
 * is held, so the player can see where a pinch lands. Drawn colour-only
 * additive (see ../light/halo.ts for why), so it brightens the table and
 * never covers it.
 */

import { CustomBlending, Mesh, MeshBasicMaterial, OneFactor, Shape, ShapeGeometry, SrcAlphaFactor, ZeroFactor } from '@iwsdk/core';
import { BASE_SIZE_M } from '../cafe/layout.js';
import { FRAME } from './hold.js';

/** The frame, flat in the café's space (XZ) at its base, opacity 0. */
export function makeHoldFrame(): Mesh<ShapeGeometry, MeshBasicMaterial> {
  const outerW = BASE_SIZE_M.width / 2 - FRAME.inset;
  const outerD = BASE_SIZE_M.depth / 2 - FRAME.inset;
  const shape = roundedRect(outerW, outerD, FRAME.corner);
  shape.holes.push(roundedRect(outerW - FRAME.band, outerD - FRAME.band, Math.max(0.001, FRAME.corner - FRAME.band)));
  const geometry = new ShapeGeometry(shape, 6);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    color: FRAME.color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    blending: CustomBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });
  const frame = new Mesh(geometry, material);
  frame.name = 'HoldFrame';
  frame.position.y = 0.0015;
  frame.renderOrder = -5;
  frame.visible = false;
  return frame;
}

/** A rounded rectangle centred on the origin, half-sizes `hw` by `hd`, corner radius `r`. */
function roundedRect(hw: number, hd: number, r: number): Shape {
  const s = new Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}
