/**
 * The café's handles, in the manner of a Horizon OS window: a grab pill
 * lying on the table just outside the edge of the base that faces the
 * player (pinch it and drag to move the café), and a bracket at each
 * corner of the base (pinch one and pull it out or in to resize, swing it
 * round to turn). Always visible, softly lit in the café's paper-lantern
 * cream, brighter as a hand comes near and while held. They keep their
 * own size whatever size the café is.
 */

import { CustomBlending, Group, Mesh, MeshBasicMaterial, OneFactor, Shape, ShapeGeometry, SrcAlphaFactor, ZeroFactor } from '@iwsdk/core';

/** The pill: its length and width (metres), how far outside the base's edge it lies. */
export const PILL = { length: 0.075, width: 0.013, gap: 0.03 };
/** The corner brackets: arm length and thickness, how far outside the corner the vertex sits. */
export const BRACKET = { arm: 0.034, thick: 0.008, gap: 0.012 };
/** Just above the table so it never fights the base for depth. */
export const LIFT_M = 0.0025;
/** The handles' colours: the cream body and the amber glow around it. */
export const CREAM = 0xf7e9d3;
export const AMBER = 0xffb46a;
/** Brightness (opacity) at rest, with a hand near, and held; and the glow's share of it. */
export const SHOW = { rest: 0.5, near: 0.85, held: 1, glowShare: 0.45, fade: 10 };
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
  body: MeshBasicMaterial;
  glow: MeshBasicMaterial;
  /** 0 to 1 brightness, eased each frame. */
  show: number;
}

/** A flat shape lying in XZ: the cream body and, beneath it, a larger faint amber glow. */
function flatHandle(shape: Shape, glowScale: number, name: string): Handle {
  const geometry = new ShapeGeometry(shape, 8);
  geometry.rotateX(-Math.PI / 2);
  const body = new MeshBasicMaterial({ color: CREAM, transparent: true, opacity: SHOW.rest, depthWrite: false, toneMapped: false });
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
  const bodyMesh = new Mesh(geometry, body);
  bodyMesh.renderOrder = 20;
  const glowMesh = new Mesh(geometry, glow);
  glowMesh.scale.set(glowScale, 1, glowScale);
  glowMesh.position.y = -0.0005;
  glowMesh.renderOrder = 19;
  group.add(glowMesh, bodyMesh);
  return { group, body, glow, show: SHOW.rest };
}

/** The grab pill, lying along X. */
export function makePill(): Handle {
  return flatHandle(roundedRect(PILL.length / 2, PILL.width / 2, PILL.width / 2), 1.9, 'GrabPill');
}

/**
 * A corner bracket with its vertex at the origin and its arms along +X and
 * +Z (turned into place by the system): an L of two arms.
 */
export function makeBracket(): Handle {
  const a = BRACKET.arm;
  const t = BRACKET.thick;
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(a, 0);
  s.lineTo(a, t);
  s.lineTo(t, t);
  s.lineTo(t, a);
  s.lineTo(0, a);
  s.closePath();
  return flatHandle(s, 1.6, 'CornerBracket');
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
