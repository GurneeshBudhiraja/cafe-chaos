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
 *   (game/rules.ts PAY_TIERS). One who leaves unhappy costs a few coins.
 *   The shift's takings go into the bank, which the shop spends.
 * - Thumbs. Each happy guest leaves a thumbs up over its head with its
 *   coins; each unhappy one a thumbs down. Both are counted.
 *
 * The scoreboard is a small paper card standing over the back of the café
 * (it faces the player): the happiness meter with its face, the bank and
 * the shift's takings, the shift clock, and the thumbs.
 *
 * Scoring only counts while `running` (a shift); the walkthrough and the
 * title screen keep it still.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { HAPPINESS, LOSSES, PAY_TIERS } from '../game/rules.js';
import { coin, INK, moodColour, moodFace, Panel, roundRect, write } from '../ui/panel.js';
import { CafeSystem } from './cafe-system.js';
import { GuestSystem, type Outcome } from './guest-system.js';

/** The scoreboard's size and where it stands (café space, metres). */
const BOARD = { width: 0.24, height: 0.062, position: [0.1, 0.27, -0.2] as const };

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
  /** Seconds left in the shift (GameSystem keeps it); shown on the board. */
  clock = 0;
  /** True during a shift: outcomes count. */
  running = false;
  /** Every scored outcome this shift, in order (for the checks). */
  readonly log: { kind: Outcome['kind']; share: number; coins: number; happiness: number; tier?: string }[] = [];
  readonly board = new Panel('Scoreboard', BOARD.width, BOARD.height);
  private guests!: GuestSystem;
  private cafe!: CafeSystem;
  private readonly head = new Vector3();
  /** What the board last showed, so it is drawn again only when something changes. */
  private shown = '';

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.guests = this.world.getSystem(GuestSystem)!;
    this.guests.outcomes.push((outcome) => this.score(outcome));
    this.board.mesh.position.set(...BOARD.position);
    this.cafe.cafe.add(this.board.mesh);
    this.board.set((ctx, w, h) => this.drawBoard(ctx, w, h));
  }

  /** A fresh shift: happiness full, nothing taken yet. */
  startShift(): void {
    this.happiness = HAPPINESS.start;
    this.takings = 0;
    this.up = 0;
    this.down = 0;
    this.servedGuests = 0;
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
      const tier = PAY_TIERS.find((t) => outcome.share <= t.upTo) ?? PAY_TIERS[PAY_TIERS.length - 1];
      this.earn(tier.coins);
      this.cheer(tier.happiness);
      this.up++;
      this.servedGuests++;
      popups.show('up', outcome.at);
      popups.coins(tier.coins, outcome.at.clone().setY(outcome.at.y + 0.018));
      this.log.push({ kind: outcome.kind, share: outcome.share, coins: tier.coins, happiness: tier.happiness, tier: tier.name });
      return;
    }
    const loss = LOSSES[outcome.kind];
    const coins = Math.min(loss.coins, this.bank);
    this.earn(-coins);
    this.cheer(-loss.happiness);
    this.down++;
    popups.show('down', outcome.at);
    if (coins > 0) popups.coins(-coins, outcome.at.clone().setY(outcome.at.y + 0.018));
    this.log.push({ kind: outcome.kind, share: outcome.share, coins: -coins, happiness: -loss.happiness });
  }

  update(delta: number): void {
    const board = this.board;
    this.player.head.getWorldPosition(this.head);
    if (!board.update(delta, this.head)) return;
    // Draw it again when what it shows has changed (the clock by the second).
    const now = `${Math.round(this.happiness)}|${this.bank}|${this.takings}|${Math.ceil(this.clock)}|${this.up}|${this.down}`;
    if (now !== this.shown) {
      this.shown = now;
      board.paint();
    }
  }

  private earn(coins: number): void {
    this.bank = Math.max(0, this.bank + coins);
    this.takings += coins;
  }

  private cheer(amount: number): void {
    this.happiness = Math.max(0, Math.min(HAPPINESS.max, this.happiness + amount));
  }

  /** The scoreboard: happiness (face and meter), bank and takings, clock, thumbs. */
  private drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const mood = this.happiness / HAPPINESS.max;
    const mid = h / 2;
    const r = h * 0.2;
    // Happiness: a face and a meter.
    moodFace(ctx, w * 0.1, mid, r, mood);
    const bar = { x: w * 0.165, y: mid - h * 0.07, w: w * 0.25, h: h * 0.14 };
    roundRect(ctx, bar.x, bar.y, bar.w, bar.h, bar.h / 2);
    ctx.fillStyle = '#e6d3b3';
    ctx.fill();
    if (mood > 0.005) {
      roundRect(ctx, bar.x, bar.y, Math.max(bar.h, bar.w * mood), bar.h, bar.h / 2);
      ctx.fillStyle = moodColour(mood);
      ctx.fill();
    }
    write(ctx, 'HAPPINESS', bar.x + bar.w / 2, mid - h * 0.17, h * 0.1, { weight: 700, color: INK.inkSoft });
    // The bank, and this shift's takings under it.
    coin(ctx, w * 0.49, mid, r * 0.8);
    write(ctx, `${this.bank}`, w * 0.52, mid - h * 0.02, h * 0.24, { weight: 800, align: 'left' });
    if (this.running) write(ctx, `${this.takings >= 0 ? '+' : ''}${this.takings} tonight`, w * 0.52, mid + h * 0.19, h * 0.09, { weight: 600, color: INK.inkSoft, align: 'left' });
    // The clock.
    const left = Math.max(0, Math.ceil(this.clock));
    write(ctx, this.running ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '—', w * 0.74, mid, h * 0.24, { weight: 800, color: left <= 20 && this.running ? INK.coral : INK.ink });
    // The thumbs.
    thumbCount(ctx, w * 0.865, mid - h * 0.12, h * 0.1, INK.mint, '▲', this.up);
    thumbCount(ctx, w * 0.865, mid + h * 0.13, h * 0.1, INK.coral, '▼', this.down);
  }
}

/** A small coloured disc with an arrow in it, and a count beside it. */
function thumbCount(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, glyph: string, count: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  write(ctx, glyph, x, y + r * 0.05, r * 1.1, { weight: 800, color: '#fffaf0' });
  write(ctx, `${count}`, x + r * 1.6, y, r * 1.6, { weight: 800, align: 'left' });
}
