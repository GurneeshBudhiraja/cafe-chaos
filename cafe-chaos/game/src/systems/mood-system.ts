/**
 * MoodSystem: keeps the night around the café. It holds the passthrough
 * dimmer on the player's head and fades it in once the café has arrived
 * on the table (and out again when the session ends), brings the café's
 * lamps up as the room goes to dusk, and lets the lanterns breathe: a
 * slow, slight flicker so the light feels alive. Outside XR (the desktop
 * preview) the lamps are simply on and nothing is dimmed.
 */

import { createSystem, PointLight, Vector3, type Object3D, type Sprite } from '@iwsdk/core';
import { makeHalo } from '../light/halo.js';
import { lightAddition, type CafeLights } from '../light/cafe-lights.js';
import { PassthroughDimmer } from '../light/dimmer.js';
import { fitSpill } from '../light/spill.js';
import { ANNEX_LAMP, ANNEX_LANTERNS_X, ANNEX_LIGHT, BREATH, DAY, DIM_FADE_SECONDS, DIM_LEVEL, ENVIRONMENT_INTENSITY, FILL, HALOS, LAMPS, LAMPS_UP_DELAY, LAMPS_UP_SECONDS, MOON, ROOM_LAMP } from '../light/mood.js';
import { isCanada } from '../cafe/style.js';
import { CafeSystem } from './cafe-system.js';

/** How much the café's lamps go down while the game is paused. */
const PAUSE_DIM = 0.45;
/** How often the light spill is checked against the real table (seconds). */
const SPILL_REFIT_S = 0.2;

export class MoodSystem extends createSystem({}) {
  readonly dimmer = new PassthroughDimmer();
  /** The café's lights, once set up (see index.ts). */
  lights: CafeLights | null = null;
  /** How far the lamps have come up, 0 to 1. */
  lampsUp = 1;
  private sinceDusk = -1;
  private time = 0;
  private sinceFit = Infinity;
  private fitKey = '';
  private readonly outline: { x: number; z: number }[] = [];
  /** 0 to 1: how far the lamps are turned down for a pause (the café is still while paused). */
  paused = 0;
  private placement = 0;
  private readonly head = new Vector3();
  /** The annex whose furniture has been lit (see `growLight`). */
  private litAnnex: object | null = null;
  /** How far the light has grown with the annex, 0 to 1. */
  private grown = 0;
  /** The annex lanterns' lights and halos (made when the annex opens). */
  readonly annexLamps: PointLight[] = [];
  private readonly annexHalos: Sprite[] = [];

  init(): void {
    this.world.createTransformEntity(this.dimmer.mesh);
  }

  update(frameDelta: number): void {
    const cafe = this.world.getSystem(CafeSystem);
    const delta = frameDelta * (cafe?.timeScale ?? 1);
    this.time += delta;
    const presenting = this.world.renderer.xr.isPresenting;
    // The Canadian café is a sunny day: no dimming, no lamps (light/mood.ts DAY).
    const day = isCanada();
    if (day !== this.day) this.setDay(day);
    const night = presenting && !!cafe?.placed && !day;

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
      this.lampsUp = presenting || day ? 0 : 1;
    }
    this.growLight(cafe);
    // Paused (the café's clock stopped): the lamps go down a little, so the pause is plain to see; eased on real time.
    const pausedNow = cafe?.timeScale === 0 ? 1 : 0;
    this.paused += (pausedNow - this.paused) * Math.min(1, frameDelta * 4);
    this.fitSpill(cafe, frameDelta);
    this.light();
  }

  /** The day (the Canadian café) or the night (the Japanese café): the sun or the moon, the fill, the house light and the spill. */
  private day = false;
  private setDay(day: boolean): void {
    const lights = this.lights;
    if (!lights) return;
    this.day = day;
    const sun = day ? DAY.sun : MOON;
    lights.moon.color.set(sun.color);
    lights.moon.intensity = sun.intensity;
    lights.moon.position.set(sun.position[0], sun.position[1], sun.position[2]);
    lights.house.visible = !day;
    lights.spill.visible = !day;
    this.fitKey = '';
    if (lights.fill) {
      const fill = day ? DAY.fill : FILL;
      lights.fill.color.set(fill.sky);
      lights.fill.groundColor.set(fill.ground);
      lights.fill.intensity = fill.intensity;
    }
    this.world.scene.environmentIntensity = day ? DAY.environment : ENVIRONMENT_INTENSITY;
  }

  /**
   * Keep the light spill to the real table (see light/spill.ts): re-cut when
   * the café or the table has moved, a few times a second at most.
   */
  private fitSpill(cafe: CafeSystem | undefined, frameDelta: number): void {
    const spill = this.lights?.spill;
    // By day (the Canadian café) there is no lamp light to spill.
    if (!spill || !cafe || this.day) return;
    this.sinceFit += frameDelta;
    if (this.sinceFit < SPILL_REFIT_S) return;
    this.sinceFit = 0;
    const on = cafe.tableOutline(this.outline);
    const key = on ? this.outline.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`).join(';') : 'none';
    if (key === this.fitKey) return;
    this.fitKey = key;
    fitSpill(spill, on ? this.outline : null);
  }

  /** The light follows the café as it grows: the annex lit like the rest, and the room light and house light moved over it. */
  private growLight(cafe: CafeSystem | undefined): void {
    const lights = this.lights;
    const annex = cafe?.annex ?? null;
    if (!lights) return;
    if (annex && this.litAnnex !== annex) {
      this.litAnnex = annex;
      lightAddition(annex.root);
      this.lightLanterns(annex.root);
    }
    const grown = annex ? ease(Math.min(1, annex.rising)) : 0;
    if (grown === this.grown) return;
    this.grown = grown;
    const room = lights.lamps[ROOM_LAMP];
    const from = LAMPS[ROOM_LAMP];
    const to = ANNEX_LIGHT.room;
    room.position.set(...mix(from.position, to.position, grown));
    room.distance = from.distance + (to.distance - from.distance) * grown;
  }

  /** A warm light and a halo at each of the annex's lanterns; they rise with the annex (they are its children). */
  private lightLanterns(root: Object3D): void {
    for (const x of ANNEX_LANTERNS_X) {
      const light = new PointLight(ANNEX_LAMP.color, 0, ANNEX_LAMP.distance, 2);
      light.name = 'AnnexLamp';
      light.position.set(x, ANNEX_LAMP.y, ANNEX_LAMP.z);
      const halo = makeHalo(ANNEX_LAMP.halo.size, ANNEX_LAMP.color, 0);
      halo.position.set(x, ANNEX_LAMP.y + 0.006, ANNEX_LAMP.z);
      root.add(light, halo);
      this.annexLamps.push(light);
      this.annexHalos.push(halo);
    }
  }

  /** Apply the lamps' level and the lanterns' breath to the lights and halos. */
  private light(): void {
    if (!this.lights) return;
    const { lamps, halos } = this.lights;
    // Each lantern breathes on its own phase; the gate lamps and the room light hold steady.
    const dim = 1 - PAUSE_DIM * this.paused;
    const breath = (breathes: boolean, phase: number): number => dim * (breathes ? 1 + BREATH.depth * Math.sin(this.time * BREATH.rate * Math.PI * 2 + phase * 1.7) : 1);
    lamps.forEach((lamp, i) => {
      const grow = i === ROOM_LAMP ? 1 + (ANNEX_LIGHT.room.strength - 1) * this.grown : 1;
      lamp.intensity = LAMPS[i].intensity * grow * this.lampsUp * breath(LAMPS[i].breathes, i);
    });
    halos.forEach((halo, i) => {
      halo.material.opacity = HALOS[i].opacity * this.lampsUp * breath(HALOS[i].breathes, i);
    });
    // The annex's lanterns breathe as the main room's do, out of step with them, and come up as it rises.
    this.annexLamps.forEach((lamp, i) => {
      const b = breath(true, LAMPS.length + i);
      lamp.intensity = ANNEX_LAMP.intensity * this.grown * this.lampsUp * b;
      this.annexHalos[i].material.opacity = ANNEX_LAMP.halo.opacity * this.grown * this.lampsUp * b;
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
