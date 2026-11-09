/**
 * MoodSystem: keeps the night around the café. It holds the passthrough
 * dimmer on the player's head and fades it in once the café has arrived
 * on the table (and out again when the session ends), so the room goes
 * to dusk as the café's lamps come up.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { PassthroughDimmer } from '../light/dimmer.js';
import { DIM_FADE_SECONDS, DIM_LEVEL } from '../light/mood.js';
import { CafeSystem } from './cafe-system.js';

export class MoodSystem extends createSystem({}) {
  readonly dimmer = new PassthroughDimmer();
  private readonly head = new Vector3();

  init(): void {
    this.world.createTransformEntity(this.dimmer.mesh);
  }

  update(delta: number): void {
    const cafe = this.world.getSystem(CafeSystem);
    const presenting = this.world.renderer.xr.isPresenting;
    const target = presenting && cafe?.placed ? DIM_LEVEL : 0;
    const step = (DIM_LEVEL / DIM_FADE_SECONDS) * delta;
    const level = this.dimmer.level;
    this.dimmer.level = level < target ? Math.min(target, level + step) : Math.max(target, level - step * 2);
    this.player.head.getWorldPosition(this.head);
    this.dimmer.mesh.position.copy(this.head);
  }
}
