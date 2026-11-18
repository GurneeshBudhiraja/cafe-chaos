/**
 * The café's events (docs/CANADA-CHALLENGES.md): states of the café that
 * come and go during a run, one at a time. Only the Canadian café has any
 * so far: the snowstorm, always STORM.at of the way into level STORM.level
 * (the first five minutes' moment), then every `stormEvery` levels after
 * that on the day's forecast.
 *
 * Pure timing: the game (systems/game-system.ts) asks it each frame of a
 * run and acts on what starts and ends.
 */

import { STORM, type Forecast } from './rules.js';

export type EventChange = 'stormStart' | 'stormEnd' | null;

export class CafeEvents {
  /** Seconds left of the storm blowing now (0: none). */
  stormLeft = 0;
  /** The last level a storm blew in (one a level at most). */
  private stormedLevel = 0;

  get storming(): boolean {
    return this.stormLeft > 0;
  }

  /** Does a storm come in `level` on this forecast? */
  static stormLevel(level: number, forecast: Forecast | null): boolean {
    if (level === STORM.level) return true;
    const every = forecast?.stormEvery ?? 0;
    return every > 0 && level > STORM.level && (level - STORM.level) % every === 0;
  }

  /**
   * One frame of a run: `progress` is how far into the level (0 to 1).
   * Says when a storm starts or ends.
   */
  update(delta: number, level: number, progress: number, forecast: Forecast | null): EventChange {
    if (this.stormLeft > 0) {
      this.stormLeft -= delta;
      if (this.stormLeft <= 0) {
        this.stormLeft = 0;
        return 'stormEnd';
      }
      return null;
    }
    if (this.stormedLevel !== level && progress >= STORM.at && CafeEvents.stormLevel(level, forecast)) {
      this.stormedLevel = level;
      this.stormLeft = level === STORM.level ? STORM.seconds : forecast?.stormSeconds || STORM.seconds;
      return 'stormStart';
    }
    return null;
  }

  /** Calm again, at once (the café left, or a fresh run). */
  reset(): void {
    this.stormLeft = 0;
  }
}
