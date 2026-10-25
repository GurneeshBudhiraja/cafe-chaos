/**
 * Tiny tween runner for UI transitions (fades, pops, glows).
 *
 * Browser animation frames do not run inside an immersive session, so tweens
 * advance from the ECS frame loop: TweenSystem calls `step` every frame.
 * Starting a tween allocates its record once; stepping allocates nothing.
 */

import type { World } from '@iwsdk/core';

interface Tween {
  /** Seconds to wait before starting. */
  delay: number;
  duration: number;
  elapsed: number;
  update: (t: number) => void;
  done?: () => void;
  /** Tweens sharing a key replace each other (a newer fade cancels an older one). */
  key?: string;
}

export class Tweens {
  private active: Tween[] = [];

  /**
   * Run `update(t)` with t going 0..1 over `durationMs`, after `delayMs`.
   * `update(1)` always runs, then `done`.
   */
  play(
    durationMs: number,
    update: (t: number) => void,
    { delayMs = 0, done, key }: { delayMs?: number; done?: () => void; key?: string } = {},
  ): void {
    if (key) this.active = this.active.filter((tween) => tween.key !== key);
    this.active.push({
      delay: delayMs / 1000,
      duration: Math.max(durationMs / 1000, 1e-3),
      elapsed: 0,
      update,
      done,
      key,
    });
  }

  step(deltaSeconds: number): void {
    if (this.active.length === 0) return;
    let finished = false;
    for (const tween of this.active) {
      if (tween.delay > 0) {
        tween.delay -= deltaSeconds;
        continue;
      }
      tween.elapsed += deltaSeconds;
      const t = Math.min(1, tween.elapsed / tween.duration);
      tween.update(t);
      if (t >= 1) {
        tween.done?.();
        finished = true;
      }
    }
    if (finished) this.active = this.active.filter((tween) => tween.elapsed < tween.duration);
  }
}

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInCubic = (t: number): number => t * t * t;
/** Overshoots a little past 1 before settling: the "blip". */
export const easeOutBack = (t: number): number => {
  const c = 1.9;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
/** Rises to 1 at the middle, back to 0 at the end: a pulse. */
export const pulse = (t: number): number => Math.sin(Math.PI * t);

const KEY = 'metaNotes.tweens';

export function getTweens(world: World): Tweens {
  let tweens = world.globals[KEY];
  if (!(tweens instanceof Tweens)) {
    tweens = new Tweens();
    world.globals[KEY] = tweens;
  }
  return tweens as Tweens;
}
