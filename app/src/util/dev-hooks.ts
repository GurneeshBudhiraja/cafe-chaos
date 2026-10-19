/**
 * Development-only hooks for automated checks (for example
 * scripts/smoke-camera.mjs). Exposes the IWSDK world on `window.__metaNotes`
 * so scripts can locate UI elements in 3D instead of hard-coding pixels.
 * Nothing is exposed in production builds.
 */

import type { World } from '@iwsdk/core';

export function installDevHooks(world: World): void {
  if (!import.meta.env.DEV) return;
  (window as unknown as { __metaNotes: unknown }).__metaNotes = { world };
}
