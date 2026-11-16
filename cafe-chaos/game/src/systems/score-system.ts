/**
 * ScoreSystem: how the evening is going, kept and shown.
 *
 * - The café's happiness (0 to 100, starting full). A guest who ate and
 *   left lifts it, by more the more it paid; a guest who gave up in the
 *   line, or stormed out of its seat before its food came, knocks it
 *   down. At 0 the level starts again (GameSystem).
 * - Money. A guest who ate pays once, as it gets down from its chair: 1
 *   to 10 coins, by how quickly it was seated and how many of its wishes
 *   its seat met (game/rules.ts PAY). One who leaves unhappy costs no
 *   coins, only happiness. Coins go into the bank, which the shop spends.
 * - Thumbs. Each happy guest leaves a thumbs up over its head with its
 *   coins; each unhappy one a thumbs down. Both are counted.
 *
 * The numbers are shown on the scoreboard (StripSystem).
 *
 * Scoring only counts while `running` (a run); the first run's teaching
 * and the title screen keep it still.
 */

import { createSystem } from '@iwsdk/core';
import { HAPPINESS, HURRY, LOSSES, PAY, payFor } from '../game/rules.js';
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
  /** Wishes met by guests who paid, this run. */
  wishesGranted = 0;
  /** The level, and guests served in it of the number that passes it (GameSystem keeps them); shown on the board. */
  level = 1;
  levelServed = 0;
  levelGoal = 1;
  /** True during a shift: outcomes count. */
  running = false;
  /** Every scored outcome this shift, in order (for the checks). */
  readonly log: { kind: Outcome['kind']; share: number; coins: number; happiness: number; wishes?: Outcome['wishes'] }[] = [];
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

  /** Coins given outright (a level's bonus): into the bank and the takings. */
  award(coins: number): void {
    this.earn(coins);
  }

  /** The café's happiness back to full (a new level, or a level begun again). */
  refill(): void {
    this.happiness = HAPPINESS.start;
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
      // One payment, by how quickly it was seated and the share of its wishes its seat met (game/rules.ts PAY).
      const { met, of } = outcome.wishes;
      const coins = Math.round(payFor(outcome.share, met, of) * (outcome.hurried ? HURRY.pay : 1));
      const happiness = Math.round(coins * PAY.happiness);
      this.earn(coins);
      this.cheer(happiness);
      this.up++;
      this.servedGuests++;
      this.wishesGranted += met;
      popups.show('up', outcome.at);
      popups.coins(coins, outcome.at.clone().setY(outcome.at.y + 0.018));
      this.log.push({ kind: outcome.kind, share: outcome.share, coins, happiness, wishes: outcome.wishes });
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
