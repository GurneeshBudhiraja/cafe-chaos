/**
 * ShopSystem: hiring. The café opens with one server; each further one
 * (up to all three baristas) is hired with coins from the bank, at a price
 * that rises with each hire (game/rules.ts HIRE_PRICES), and stays hired.
 *
 * It has no objects of its own: the shop card (the bar's Shop button)
 * shows the baristas and their prices, and its HIRE calls `hire()`. A
 * hire the bank cannot pay for is refused (counted, so the sound can say
 * no).
 * The new server appears behind the counter and waves (BaristaSystem).
 */

import { createSystem } from '@iwsdk/core';
import { HIRE_PRICES, MAX_STAFF, STARTING_STAFF } from '../game/rules.js';
import { BaristaSystem } from './barista-system.js';
import { ScoreSystem } from './score-system.js';

export class ShopSystem extends createSystem({}) {
  /** Servers hired beyond the first. */
  hires = 0;
  /** Hires made and hires refused this session (for the sounds and the checks). */
  purchases = 0;
  refused = 0;
  /** Called after each hire (the game saves). */
  readonly bought: (() => void)[] = [];
  private baristas!: BaristaSystem;
  private score!: ScoreSystem;

  init(): void {
    this.baristas = this.world.getSystem(BaristaSystem)!;
    this.score = this.world.getSystem(ScoreSystem)!;
  }

  /** How many servers the café has. */
  get staff(): number {
    return STARTING_STAFF + this.hires;
  }

  /** What the next server costs; null when all three are hired. */
  get price(): number | null {
    return this.hires < HIRE_PRICES.length ? HIRE_PRICES[this.hires] : null;
  }

  /** Can the bank pay for the next server? */
  get affordable(): boolean {
    const price = this.price;
    return price !== null && this.score.bank >= price;
  }

  /** The café as it was saved: this many servers already hired (nothing is spent). */
  restore(hires: number): void {
    this.hires = Math.max(0, Math.min(HIRE_PRICES.length, Math.floor(hires)));
    this.baristas.staffSize = this.staff;
  }

  /** Hire the next server; false (and counted as refused) if all are hired or the bank cannot pay. */
  hire(): boolean {
    const price = this.price;
    if (price === null || !this.score.spend(price)) {
      this.refused++;
      return false;
    }
    this.hires++;
    this.purchases++;
    this.baristas.staffSize = Math.min(MAX_STAFF, this.staff);
    for (const done of this.bought) done();
    return true;
  }
}
