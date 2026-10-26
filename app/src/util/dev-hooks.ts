/**
 * Development-only hooks for automated checks (scripts/*.mjs and the IWSDK
 * CLI). Exposes app objects on `window.__metaNotes` so scripts can locate UI
 * elements in 3D and inspect or fail note storage on purpose, plus a demo
 * helper for recordings. Nothing is exposed in production builds.
 */

import {
  BackSide,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  type World,
} from '@iwsdk/core';
import type { NoteSession } from '../notes/note-session.js';
import type { SimulatedFailureStore } from '../notes/note-store.js';
import { getHomeMode } from '../ui/home-mode.js';
import { getTweens } from '../ui/tweens.js';

export interface DevHooks {
  world: World;
  session: NoteSession;
  store: SimulatedFailureStore;
}

interface DemoHooks {
  /**
   * Recording only: wrap the viewer in a 360-degree photo (equirectangular
   * image URL, data URLs work) so videos can show the app outdoors. IWER only
   * emulates indoor rooms; on a headset, real passthrough is the backdrop.
   */
  showPanorama(url: string, yawDeg?: number): Promise<void>;
  /** Recording only: scale UI animation time (see Tweens.timeScale). */
  setAnimationSpeed(scale: number): void;
  /** Recording only: bring the home back in front of the head (a recenter). */
  recenterHome(): void;
}

export function installDevHooks(hooks: DevHooks): void {
  if (!import.meta.env.DEV) return;
  const demo: DemoHooks = {
    async showPanorama(url, yawDeg = 0) {
      const texture = await new TextureLoader().loadAsync(url);
      texture.colorSpace = SRGBColorSpace;
      const sphere = new Mesh(
        new SphereGeometry(40, 64, 32),
        new MeshBasicMaterial({ map: texture, side: BackSide, depthWrite: false }),
      );
      sphere.name = 'DemoPanorama';
      sphere.renderOrder = -10;
      sphere.rotation.y = (yawDeg * Math.PI) / 180;
      hooks.world.scene.add(sphere);
    },
    setAnimationSpeed(scale) {
      getTweens(hooks.world).timeScale = scale;
    },
    recenterHome() {
      getHomeMode(hooks.world).requestRecenter();
    },
  };
  (window as unknown as { __metaNotes: DevHooks & { demo: DemoHooks } }).__metaNotes = {
    ...hooks,
    demo,
  };
}
