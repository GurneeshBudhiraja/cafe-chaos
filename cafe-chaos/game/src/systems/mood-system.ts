/**
 * MoodSystem: keeps the night around the café. It holds the passthrough
 * dimmer on the player's head and fades it in once the café has arrived
 * on the table (and out again when the session ends), brings the café's
 * lamps up as the room goes to dusk, and lets the lanterns breathe: a
 * slow, slight flicker so the light feels alive. Outside XR (the desktop
 * preview) the lamps are simply on and nothing is dimmed.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import type { CafeLights } from '../light/cafe-lights.js';
import { PassthroughDimmer } from '../light/dimmer.js';
import { BREATH, DIM_FADE_SECONDS, DIM_LEVEL, LAMPS, LAMPS_UP_DELAY, LAMPS_UP_SECONDS } from '../light/mood.js';
import { CafeSystem } from './cafe-system.js';

export class MoodSystem extends createSystem({}) {
  readonly dimmer = new PassthroughDimmer();
  /** The café's lights, once set up (see index.ts). */
  lights: CafeLights | null = null;
  /** How far the lamps have come up, 0 to 1. */
  lampsUp = 1;
  private sinceDusk = -1;
  private time = 0;
  private readonly head = new Vector3();

  init(): void {
    this.world.createTransformEntity(this.dimmer.mesh);
  }

  update(frameDelta: number): void {
    const cafe = this.world.getSystem(CafeSystem);
    const delta = frameDelta * (cafe?.timeScale ?? 1);
    this.time += delta;
    const presenting = this.world.renderer.xr.isPresenting;
    const night = presenting && !!cafe?.placed;

    // The room dims once the café is down, and clears (faster) when it is gone.
    const target = night ? DIM_LEVEL : 0;
    const step = (DIM_LEVEL / DIM_FADE_SECONDS) * delta;
    const level = this.dimmer.level;
    this.dimmer.level = level < target ? Math.min(target, level + step) : Math.max(target, level - step * 2);
    this.player.head.getWorldPosition(this.head);
    this.dimmer.mesh.position.copy(this.head);

    // The lamps come up a moment after the dusk begins; outside XR they are on.
    if (night) {
      this.sinceDusk = this.sinceDusk < 0 ? 0 : this.sinceDusk + delta;
      this.lampsUp = ease(Math.min(1, Math.max(0, (this.sinceDusk - LAMPS_UP_DELAY) / LAMPS_UP_SECONDS)));
    } else {
      this.sinceDusk = -1;
      this.lampsUp = presenting ? 0 : 1;
    }
    this.light();
  }

  /** Apply the lamps' level and the lanterns' breath to the lights and halos. */
  private light(): void {
    if (!this.lights) return;
    const { lamps, halos } = this.lights;
    lamps.forEach((lamp, i) => {
      const spec = LAMPS[i];
      // Each lantern breathes on its own phase; the gate lamps and the room light hold steady.
      const breath = spec.halo >= 0.1 ? 1 + BREATH.depth * Math.sin(this.time * BREATH.rate * Math.PI * 2 + i * 1.7) : 1;
      lamp.intensity = spec.intensity * this.lampsUp * breath;
      const halo = halos[i];
      if (halo) halo.material.opacity = spec.haloOpacity * this.lampsUp * breath;
    });
  }
}

/** Ease in and out (smoothstep). */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}
