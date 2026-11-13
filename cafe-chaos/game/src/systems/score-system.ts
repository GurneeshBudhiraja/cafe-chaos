/**
 * ScoreSystem: how the evening is going, kept and shown.
 *
 * - The café's happiness (0 to 100, starting full). A guest who ate and
 *   left lifts it, by more the sooner it was seated; a guest who gave up
 *   in the line, or stormed out of its seat before its food came, knocks
 *   it down. At 0 the café closes early (GameSystem ends the shift).
 * - Money. A guest who ate pays as it gets down from its chair: more if
 *   it was taken from the gate and seated in the first quarter of its
 *   patience, less if it was seated at the last moment
 *   (game/rules.ts PAY_TIERS). One who leaves unhappy costs no coins,
 *   only happiness.
 *   The shift's takings go into the bank, which the shop spends.
 * - Thumbs. Each happy guest leaves a thumbs up over its head with its
 *   coins; each unhappy one a thumbs down. Both are counted.
 *
 * The numbers are shown on the scoreboard (StripSystem).
 *
 * Scoring only counts while `running` (a run); the first run's teaching
 * and the title screen keep it still.
 */

import { createSystem } from '@iwsdk/core';
import { HAPPINESS, LOSSES, PAY_TIERS, WISH } from '../game/rules.js';
import { GuestSystem, type Outcome } from './guest-system.js';

export class ScoreSystem extends createSystem({}) {
  /** The café's happiness, 0 to HAPPINESS.max. */
  happiness = HAPPINESS.start;
  /** Coins in the bank (spent in the shop), and coins taken this shift. */
  bank = 0;
  takings = 0;
  /** Thumbs up and down this shift, and guests who ate. */
  up = 0;
  down = 0;
  servedGuests = 0;
  /** Guests who left with their wish granted, this run. */
  wishesGranted = 0;
  /** Seconds the café has been open this run (GameSystem keeps it); shown on the board. */
  clock = 0;
  /** True during a shift: outcomes count. */
  running = false;
  /** Every scored outcome this shift, in order (for the checks). */
  readonly log: { kind: Outcome['kind']; share: number; coins: number; happiness: number; tier?: string; wish?: Outcome['wish'] }[] = [];
  private guests!: GuestSystem;

  init(): void {
    this.guests = this.world.getSystem(GuestSystem)!;
    this.guests.outcomes.push((outcome) => this.score(outcome));
  }

  /** A fresh run: happiness full, nothing taken yet. */
  startRun(): void {
    this.happiness = HAPPINESS.start;
    this.takings = 0;
    this.up = 0;
    this.down = 0;
    this.servedGuests = 0;
    this.wishesGranted = 0;
    this.log.length = 0;
    this.running = true;
  }

  /** Spend from the bank; false (and nothing spent) if there is not enough. */
  spend(price: number): boolean {
    if (this.bank < price) return false;
    this.bank -= price;
    return true;
  }

  /** How a visit ended: pay, thumbs and happiness. */
  score(outcome: Outcome): void {
    if (!this.running) return;
    const popups = this.guests.popups;
    if (outcome.kind === 'paid') {
      // By how quickly it was seated; a wish ignored pays one step down, a wish granted adds to the tip.
      let step = PAY_TIERS.findIndex((t) => outcome.share <= t.upTo);
      if (step < 0) step = PAY_TIERS.length - 1;
      if (outcome.wish === 'unmet') step = Math.min(PAY_TIERS.length - 1, step + 1);
      const tier = PAY_TIERS[step];
      const granted = outcome.wish === 'met';
      const coins = tier.coins + (granted ? WISH.coins : 0);
      const happiness = tier.happiness + (granted ? WISH.happiness : 0);
      this.earn(coins);
      this.cheer(happiness);
      this.up++;
      this.servedGuests++;
      if (granted) this.wishesGranted++;
      popups.show('up', outcome.at);
      popups.coins(coins, outcome.at.clone().setY(outcome.at.y + 0.018));
      this.log.push({ kind: outcome.kind, share: outcome.share, coins, happiness, tier: tier.name, wish: outcome.wish });
      return;
    }
    // An unhappy guest costs happiness only; the bank and the night's takings are never touched.
    const loss = LOSSES[outcome.kind];
    this.cheer(-loss.happiness);
    this.down++;
    popups.show('down', outcome.at);
    this.log.push({ kind: outcome.kind, share: outcome.share, coins: 0, happiness: -loss.happiness });
  }

  private earn(coins: number): void {
    this.bank = Math.max(0, this.bank + coins);
    this.takings += coins;
  }

  private cheer(amount: number): void {
    this.happiness = Math.max(0, Math.min(HAPPINESS.max, this.happiness + amount));
  }
}
