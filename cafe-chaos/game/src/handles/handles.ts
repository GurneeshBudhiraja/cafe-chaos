/**
 * The café's handles, in the manner of a Horizon OS window: a grab pill
 * lying on the table just outside the edge of the base that faces the
 * player (pinch it and drag to move the café), and a bracket at each
 * corner of the base (pinch one and pull it out or in to resize, swing it
 * round to turn). Always visible, lit in the café's paper-lantern cream,
 * brighter as a hand comes near and while held. They are low blocks
 * standing on the table rather than flat marks, so they still read when
 * the player looks across the table at a shallow angle, and they grow
 * with the café (within limits) so they stay in proportion to it.
 */

import { CustomBlending, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, OneFactor, Shape, ShapeGeometry, SrcAlphaFactor, ZeroFactor } from '@iwsdk/core';

/** The pill: its length, width and height (metres), how far outside the base's edge it lies. */
export const PILL = { length: 0.08, width: 0.016, height: 0.008, gap: 0.03 };
/** The corner brackets: arm length, thickness and height, how far outside the corner the vertex sits. */
export const BRACKET = { arm: 0.05, thick: 0.012, height: 0.014, gap: 0.012 };
/** The handles grow with the café's scale, but no smaller or larger than this much of their base size. */
export const GROW = { min: 0.8, max: 2 };
/** Just above the table so it never fights the base for depth. */
export const LIFT_M = 0.0025;
/** The handles' colours: the cream top, the slightly deeper cream of the sides, and the amber glow around it. */
export const CREAM = 0xf7e9d3;
export const CREAM_SIDE = 0xe3c9a4;
export const AMBER = 0xffb46a;
/** Brightness (opacity) at rest, with a hand near, and held; and the glow's share of it. */
export const SHOW = { rest: 0.8, near: 0.95, held: 1, glowShare: 0.45, fade: 10 };

/** How much the handles are scaled for a café at scale `s`. */
export function growFor(s: number): number {
  return Math.min(GROW.max, Math.max(GROW.min, s));
}
/** A pinch closing within this of a handle takes it (metres). */
export const REACH_M = 0.04;
/** A hand (its pinch point, open or closed) within this of a handle brightens it. */
export const NEAR_M = 0.12;
/**
 * The pill moves to the edge facing the player; it only changes edge once
 * the player is clearly past the diagonal (a fraction of the way), so it
 * does not flicker between two edges.
 */
export const SIDE_HYSTERESIS = 0.15;

export type Side = 'front' | 'back' | 'left' | 'right';
export type Corner = 0 | 1 | 2 | 3;
/** Corner signs (x, z) in café space: front-right, front-left, back-left, back-right. */
export const CORNER_SIGNS: readonly [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

export interface Handle {
  group: Group;
  /** The cream top and the sides of the block. */
  body: MeshBasicMaterial;
  side: MeshBasicMaterial;
  glow: MeshBasicMaterial;
  /** 0 to 1 brightness, eased each frame. */
  show: number;
}

/**
 * A low block standing on the table: the shape extruded up by `height`,
 * cream on top and a deeper cream on its sides, and beneath it, lying
 * flat, a larger faint amber glow.
 */
function standingHandle(shape: Shape, height: number, glowScale: number, name: string): Handle {
  // Extrude along +Z, then lay the shape flat so the extrusion runs up +Y with the base on the table.
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 8 });
  geometry.rotateX(-Math.PI / 2);
  const flat = new ShapeGeometry(shape, 8);
  flat.rotateX(-Math.PI / 2);
  const body = new MeshBasicMaterial({ color: CREAM, transparent: true, opacity: SHOW.rest, toneMapped: false });
  const side = new MeshBasicMaterial({ color: CREAM_SIDE, transparent: true, opacity: SHOW.rest, toneMapped: false });
  const glow = new MeshBasicMaterial({
    color: AMBER,
    transparent: true,
    opacity: SHOW.rest * SHOW.glowShare,
    depthWrite: false,
    toneMapped: false,
    blending: CustomBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });
  const group = new Group();
  group.name = name;
  // ExtrudeGeometry puts the caps in material group 0 and the sides in group 1.
  const bodyMesh = new Mesh(geometry, [body, side]);
  bodyMesh.renderOrder = 20;
  const glowMesh = new Mesh(flat, glow);
  glowMesh.scale.set(glowScale, 1, glowScale);
  glowMesh.position.y = -0.0005;
  glowMesh.renderOrder = 19;
  group.add(glowMesh, bodyMesh);
  return { group, body, side, glow, show: SHOW.rest };
}

/** The grab pill, lying along X. */
export function makePill(): Handle {
  return standingHandle(roundedRect(PILL.length / 2, PILL.width / 2, PILL.width / 2), PILL.height, 1.9, 'GrabPill');
}

/**
 * A corner bracket with its vertex at the origin and its arms along +X and
 * +Z (turned into place by the system): an L of two arms.
 *
 * The shape is drawn in XY and then laid flat by a quarter turn about X,
 * which maps the shape's -Y onto +Z; so the second arm is drawn along -Y
 * here to end up along +Z. (Drawn along +Y it would point the other way,
 * out from the corner instead of back along the edge.)
 */
export function makeBracket(): Handle {
  const a = BRACKET.arm;
  const t = BRACKET.thick;
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(a, 0);
  s.lineTo(a, -t);
  s.lineTo(t, -t);
  s.lineTo(t, -a);
  s.lineTo(0, -a);
  s.closePath();
  return standingHandle(s, BRACKET.height, 1.6, 'CornerBracket');
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
