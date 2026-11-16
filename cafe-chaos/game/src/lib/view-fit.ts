/**
 * How tall the headset's view is, from the headset itself: a narrow view
 * (Meta VR Glasses, about 70 by 66 degrees) gets a tighter layout, a wide one
 * (Quest 3 and 3S) keeps the game as designed.
 *
 * Meta: "use the per-eye view and projection data from your engine or
 * runtime" rather than hard-coded display values. So the view's height is
 * read from the first eye's projection in the headset view (three.js'
 * XR camera), once there is one; a view under `NARROW_BELOW_DEG` tall is
 * narrow. Recommended design area on the Glasses: 58 by 54 degrees.
 *
 * `?fov=narrow` (or `?fov=wide`) in the address decides it instead: to see
 * the Glasses' layout on a Quest, in the emulator and in the checks.
 */

import type { WebGLRenderer } from '@iwsdk/core';

/** A view shorter than this (degrees, one eye, top to bottom) is narrow. Quest 3 is about 96; Meta VR Glasses about 66. */
export const NARROW_BELOW_DEG = 80;

const forced: 'narrow' | 'wide' | null = (() => {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('fov');
  return v === 'narrow' || v === 'wide' ? v : null;
})();

let measured: number | null = null;

/** The view's height in degrees (one eye), once the headset view is up; null before. */
export function viewHeightDeg(renderer: WebGLRenderer): number | null {
  if (measured !== null) return measured;
  if (!renderer.xr.isPresenting) return null;
  const eye = renderer.xr.getCamera().cameras[0];
  const e5 = eye?.projectionMatrix.elements[5];
  if (!e5 || !Number.isFinite(e5)) return null;
  // Symmetric or not, 2 * atan(1 / m[5]) is close to the eye's full height (an off-centre view loses a degree or two).
  measured = (2 * Math.atan(1 / e5) * 180) / Math.PI;
  return measured;
}

/** True when the view is narrow (the Glasses, or `?fov=narrow`). False on a wide view, and until the headset view is up. */
export function narrowView(renderer: WebGLRenderer): boolean {
  if (forced) return forced === 'narrow';
  const h = viewHeightDeg(renderer);
  return h !== null && h < NARROW_BELOW_DEG;
}
