/**
 * ShopSystem: hiring. The café opens with one server; each further one
 * (up to all three baristas) is hired with coins from the bank, at a price
 * that rises with each hire (game/rules.ts HIRE_PRICES), and stays hired;
 * and the tables, bought one at a time at a rising price (TABLE_PRICES).
 *
 * It has no objects of its own: the shop card (the bar's Shop button)
 * shows the baristas and their prices, and its HIRE calls `hire()`. A
 * hire the bank cannot pay for is refused (counted, so the sound can say
 * no).
 * The new server appears behind the counter and waves (BaristaSystem).
 */

import { createSystem } from '@iwsdk/core';
import { HIRE_PRICES, JANITOR_PRICE, MAX_STAFF, START_TABLES, STARTING_STAFF, tablePrice } from '../game/rules.js';
import { BaristaSystem } from './barista-system.js';
import { ScoreSystem } from './score-system.js';

export class ShopSystem extends createSystem({}) {
  /** Servers hired beyond the first. */
  hires = 0;
  /** Hires made and hires refused this session (for the sounds and the checks). */
  purchases = 0;
  refused = 0;
  /** Called after each hire or table bought (the game saves). */
  readonly bought: (() => void)[] = [];
  /** The tables open (indices into the café's pieces), the starting ones included. */
  tables: number[] = [...START_TABLES];
  /** Tables bought this session (for the sounds and the checks). */
  tablesBought = 0;
  /** The janitor (one only): hired or not. */
  janitor = false;
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

  /** The café as it was saved: this many servers already hired, these tables open (nothing is spent). */
  restore(hires: number, tables: readonly number[] = START_TABLES, janitor = false): void {
    this.hires = Math.max(0, Math.min(HIRE_PRICES.length, Math.floor(hires)));
    this.baristas.staffSize = this.staff;
    this.janitor = janitor;
    this.baristas.janitorHired = janitor;
    // Staff no longer on the books (a fresh start) leave at once.
    this.baristas.dismiss();
    this.tables = [...new Set([...START_TABLES, ...tables.filter((t) => Number.isInteger(t) && t >= 0 && t < 32)])];
  }

  /** What the janitor costs; null once hired. */
  get janitorPrice(): number | null {
    return this.janitor ? null : JANITOR_PRICE;
  }

  /** Hire the janitor; false (and counted as refused) if hired already or the bank cannot pay. */
  hireJanitor(): boolean {
    if (this.janitor || !this.score.spend(JANITOR_PRICE)) {
      this.refused++;
      return false;
    }
    this.janitor = true;
    this.purchases++;
    this.baristas.janitorHired = true;
    for (const done of this.bought) done();
    return true;
  }

  /** How many tables have been bought (the starting ones are not bought). */
  get tablesOwned(): number {
    return Math.max(0, this.tables.length - START_TABLES.length);
  }

  /** What the next table costs. */
  get tablePrice(): number {
    return tablePrice(this.tablesOwned);
  }

  /** Can the bank pay for the next table? */
  get tableAffordable(): boolean {
    return this.score.bank >= this.tablePrice;
  }

  /** Buy the table at `index` (a piece of the café); false (and counted as refused) if it is open already or the bank cannot pay. */
  buyTable(index: number): boolean {
    if (this.tables.includes(index) || !this.score.spend(this.tablePrice)) {
      this.refused++;
      return false;
    }
    this.tables.push(index);
    this.tablesBought++;
    this.purchases++;
    for (const done of this.bought) done();
    return true;
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
