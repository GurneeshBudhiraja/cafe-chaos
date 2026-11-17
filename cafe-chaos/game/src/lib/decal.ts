/**
 * Flat things laid on other surfaces (a guest's shadow blob on the floor,
 * a mess on a table, the seat glow's disc) must never fight the surface
 * under them for the depth test: where two surfaces are at (nearly) the
 * same depth the headset draws one or the other from frame to frame, and
 * it flickers, the more so the more of them there are (a crowded café; the
 * owner's playtest). So each is lifted a little off its surface and its
 * material asks the GPU to count it a touch nearer than it is
 * (polygonOffset), whatever depth buffer the headset gives. The camera's
 * near plane (iwsdk.config.json) is 3 cm, not 5 mm: the depth test is
 * finer the further out it starts.
 */

import type { Material } from '@iwsdk/core';

/** How much nearer a laid-on surface is counted (GPU depth offset: slope factor and constant units). */
export const DECAL = { factor: -2, units: -4 };

/** Make `material` win the depth test against the surface it lies on. Returns it. */
export function laidOn<T extends Material>(material: T): T {
  material.polygonOffset = true;
  material.polygonOffsetFactor = DECAL.factor;
  material.polygonOffsetUnits = DECAL.units;
  return material;
}
