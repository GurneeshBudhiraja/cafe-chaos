/**
 * Shared materials for Meta Notes' physical objects (stylus, tablet, tool
 * wheel, sticky notes, pins). They carry the app theme into 3D: warm smoked
 * dark bodies, warm white paper, and the one clay accent (#d4704f) on the
 * part that matters most (a stylus band, a pin head, the active tool).
 *
 * Prototypes share these instances; never mutate them after registration.
 */

import { MeshStandardMaterial } from '@iwsdk/core';

/** Glossy warm dark ceramic-like body (stylus barrel, tablet shell). */
export const bodyMaterial = new MeshStandardMaterial({
  color: 0x2a2420,
  roughness: 0.32,
  metalness: 0.08,
});

/** Soft-touch matte for grips and backs. */
export const gripMaterial = new MeshStandardMaterial({
  color: 0x1f1b18,
  roughness: 0.82,
  metalness: 0,
});

/** A slightly lighter warm dark for seams, rails and facets. */
export const trimMaterial = new MeshStandardMaterial({
  color: 0x3d352f,
  roughness: 0.45,
  metalness: 0.25,
});

/** The clay accent, a little satin. */
export const clayMaterial = new MeshStandardMaterial({
  color: 0xd4704f,
  roughness: 0.42,
  metalness: 0.15,
});

/** Warm white for nibs, paper edges and soft parts. */
export const paperWhiteMaterial = new MeshStandardMaterial({
  color: 0xf4eee4,
  roughness: 0.7,
  metalness: 0,
});

/** Brushed warm metal (pin needles, clips). */
export const metalMaterial = new MeshStandardMaterial({
  color: 0xb9b2a8,
  roughness: 0.3,
  metalness: 0.9,
});
