/**
 * TweenSystem: advances UI tweens (src/ui/tweens.ts) once per frame, in and
 * out of immersive sessions.
 */

import { createSystem } from '@iwsdk/core';
import { getTweens, type Tweens } from '../ui/tweens.js';

export class TweenSystem extends createSystem({}) {
  private tweens!: Tweens;

  init(): void {
    this.tweens = getTweens(this.world);
  }

  update(delta: number): void {
    this.tweens.step(delta);
  }
}
