/**
 * MoodSystem: keeps the night around the café. It holds the passthrough
 * dimmer on the player's head and fades it in once the café has arrived
 * on the table (and out again when the session ends), brings the café's
 * lamps up as the room goes to dusk, and lets the lanterns breathe: a
 * slow, slight flicker so the light feels alive. Outside XR (the desktop
 * preview) the lamps are simply on and nothing is dimmed.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { lightAddition, type CafeLights } from '../light/cafe-lights.js';
import { PassthroughDimmer } from '../light/dimmer.js';
import { ANNEX_LIGHT, BREATH, DIM_FADE_SECONDS, DIM_LEVEL, HALOS, HOUSE, LAMPS, LAMPS_UP_DELAY, LAMPS_UP_SECONDS, ROOM_LAMP } from '../light/mood.js';
import { CafeSystem } from './cafe-system.js';

export class MoodSystem extends createSystem({}) {
  readonly dimmer = new PassthroughDimmer();
  /** The café's lights, once set up (see index.ts). */
  lights: CafeLights | null = null;
  /** How far the lamps have come up, 0 to 1. */
  lampsUp = 1;
  private sinceDusk = -1;
  private time = 0;
  private placement = 0;
  private readonly head = new Vector3();
  /** The annex whose furniture has been lit (see `growLight`). */
  private litAnnex: object | null = null;
  /** How far the light has grown with the annex, 0 to 1. */
  private grown = 0;

  init(): void {
    this.world.createTransformEntity(this.dimmer.mesh);
  }

  update(frameDelta: number): void {
    const cafe = this.world.getSystem(CafeSystem);
    const delta = frameDelta * (cafe?.timeScale ?? 1);
    this.time += delta;
    const presenting = this.world.renderer.xr.isPresenting;
    const night = presenting && !!cafe?.placed;

    // A new placement is a new arrival: the night comes in from clear again.
    if (cafe && cafe.placements !== this.placement) {
      this.placement = cafe.placements;
      this.dimmer.level = 0;
      this.sinceDusk = -1;
    }

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
    this.growLight(cafe);
    this.light();
  }

  /** The light follows the café as it grows: the annex lit like the rest, and the room light and house light moved over it. */
  private growLight(cafe: CafeSystem | undefined): void {
    const lights = this.lights;
    const annex = cafe?.annex ?? null;
    if (!lights) return;
    if (annex && this.litAnnex !== annex) {
      this.litAnnex = annex;
      lightAddition(annex.root);
    }
    const grown = annex ? ease(Math.min(1, annex.rising)) : 0;
    if (grown === this.grown) return;
    this.grown = grown;
    const room = lights.lamps[ROOM_LAMP];
    const from = LAMPS[ROOM_LAMP];
    const to = ANNEX_LIGHT.room;
    room.position.set(...mix(from.position, to.position, grown));
    room.distance = from.distance + (to.distance - from.distance) * grown;
    lights.house.position.set(...mix(HOUSE.position, ANNEX_LIGHT.house.position, grown));
    lights.house.target.position.set(...mix(HOUSE.target, ANNEX_LIGHT.house.target, grown));
    lights.house.target.updateMatrixWorld();
  }

  /** Apply the lamps' level and the lanterns' breath to the lights and halos. */
  private light(): void {
    if (!this.lights) return;
    const { lamps, halos } = this.lights;
    // Each lantern breathes on its own phase; the gate lamps and the room light hold steady.
    const breath = (breathes: boolean, phase: number): number => (breathes ? 1 + BREATH.depth * Math.sin(this.time * BREATH.rate * Math.PI * 2 + phase * 1.7) : 1);
    lamps.forEach((lamp, i) => {
      const grow = i === ROOM_LAMP ? 1 + (ANNEX_LIGHT.room.strength - 1) * this.grown : 1;
      lamp.intensity = LAMPS[i].intensity * grow * this.lampsUp * breath(LAMPS[i].breathes, i);
    });
    halos.forEach((halo, i) => {
      halo.material.opacity = HALOS[i].opacity * this.lampsUp * breath(HALOS[i].breathes, i);
    });
  }
}

/** Between two points, `t` of the way. */
function mix(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Ease in and out (smoothstep). */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}
