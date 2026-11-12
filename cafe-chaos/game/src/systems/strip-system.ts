/**
 * StripSystem: the scoreboard, a strip standing on the table just in front
 * of the café, turned to the player. It is the one place to read how the
 * evening is going, without looking away from the guests:
 *
 *   OPEN 3:42  |  (face) [■■■■■■■□□□] 70%  |  (coin) 46
 *
 * - The clock, counting up, with the longest evening under it.
 * - Happiness: a face and ten segments, mint above 60 %, amber down to
 *   30 %, coral below; the percentage beside them.
 * - The bank.
 *
 * It is still at rest, and moves only when something happens (see
 * docs/PLAN.md for why: constant motion at the edge of the view pulls the
 * eye from the guests):
 * - a segment lost drains away over half a second, one gained fills in;
 * - coins coming in make the number pop for a moment;
 * - under 30 % the lit segments pulse slowly, once a second, so the
 *   danger shows without anything buzzing.
 *
 * It keeps its real size whatever the café's scale (ui/panel.ts), and a
 * pinch on it never takes the café or a guest. GameSystem shows it.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { HAPPINESS } from '../game/rules.js';
import { coin, INK, moodColour, moodFace, Panel, roundRect, write } from '../ui/panel.js';
import { clockText } from './board-system.js';
import { CafeSystem } from './cafe-system.js';
import { HoldSystem } from './hold-system.js';
import { ScoreSystem } from './score-system.js';

/** Its size (real metres), how far out in front of the café's front edge it stands (past the pill that moves the café, so that stays in view and in reach), and how high its foot is over the table (real metres). */
export const STRIP = { width: 0.27, height: 0.066, out: 0.14, lift: 0.004 };
/** How long a segment takes to drain or fill, and a coin pop lasts (seconds); and the pulse under 30 % (times a second). */
const MOTION = { segment: 0.5, pop: 0.3, pulse: 1 };
const SEGMENTS = 10;

export class StripSystem extends createSystem({}) {
  readonly panel = new Panel('ScoreStrip', STRIP.width, STRIP.height);
  /** The longest evening before this run (seconds), and whether a run is on: the game sets them. */
  best = 0;
  live = false;
  private cafe!: CafeSystem;
  private score!: ScoreSystem;
  private hold: HoldSystem | null = null;
  private readonly head = new Vector3();
  /** Each segment's fill as shown (0 to 1), eased toward what the happiness says. */
  private readonly fill: number[] = Array.from({ length: SEGMENTS }, () => 1);
  private bank = 0;
  /** Seconds since the bank last went up (Infinity: no pop showing). */
  private popAge = Infinity;
  private time = 0;
  private shown = '';

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.score = this.world.getSystem(ScoreSystem)!;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    this.cafe.cafe.add(this.panel.mesh);
    this.panel.turn = 2.5;
    this.hold?.claims.push((point) => this.panel.covers(point));
    this.bank = this.score.bank;
    this.panel.set((ctx, w, h) => this.draw(ctx, w, h));
  }

  update(frameDelta: number): void {
    const delta = Math.min(0.1, frameDelta);
    this.place();
    this.player.head.getWorldPosition(this.head);
    if (!this.panel.update(delta, this.head)) return;
    this.time += delta;
    const s = this.score;
    // Segments ease toward the happiness, one at a time from the end, over MOTION.segment each.
    const want = (s.happiness / HAPPINESS.max) * SEGMENTS;
    let moving = false;
    for (let i = 0; i < SEGMENTS; i++) {
      const target = Math.max(0, Math.min(1, want - i));
      const f = this.fill[i];
      if (Math.abs(target - f) > 0.001) {
        this.fill[i] = f + Math.sign(target - f) * Math.min(Math.abs(target - f), delta / MOTION.segment);
        moving = true;
      }
    }
    if (s.bank > this.bank) this.popAge = 0;
    this.bank = s.bank;
    if (this.popAge < MOTION.pop) {
      this.popAge += delta;
      moving = true;
    }
    const low = this.live && s.happiness / HAPPINESS.max <= 0.3 && s.happiness > 0;
    // Redraw while something moves, or the pulse runs, or what it shows has changed.
    const now = `${Math.round(s.happiness)}|${s.bank}|${Math.floor(s.clock)}|${this.best}|${this.live}`;
    if (moving || low || now !== this.shown) {
      this.shown = now;
      this.panel.paint();
    }
  }

  /** Jump the segments to the happiness at once (a new run starts full). */
  settle(): void {
    const want = (this.score.happiness / HAPPINESS.max) * SEGMENTS;
    for (let i = 0; i < SEGMENTS; i++) this.fill[i] = Math.max(0, Math.min(1, want - i));
    this.bank = this.score.bank;
    this.popAge = Infinity;
  }

  /** In front of the café's front edge, in the middle, its foot just over the table: wherever the café is and whatever its size. */
  private place(): void {
    const scale = this.cafe.cafe.scale.x || 1;
    const front = this.hold?.bounds && this.hold.bounds.max.z > 0 ? this.hold.bounds.max.z : 0.31;
    this.panel.mesh.position.set(0, (STRIP.lift + STRIP.height / 2) / scale, front + STRIP.out / scale);
  }

  private draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const s = this.score;
    const mood = s.happiness / HAPPINESS.max;
    const mid = h / 2;
    // The clock, and the record under it.
    write(ctx, 'OPEN', w * 0.05, h * 0.27, h * 0.12, { weight: 800, color: INK.inkSoft, align: 'left' });
    write(ctx, clockText(s.clock), w * 0.047, h * 0.62, h * 0.36, { weight: 800, align: 'left', font: 'Georgia, serif' });
    const record = this.live && this.best > 0 && s.clock > this.best;
    if (this.best > 0) write(ctx, record ? 'new record!' : `best ${clockText(this.best)}`, w * 0.05, h * 0.87, h * 0.1, { weight: 700, color: record ? INK.amberDeep : INK.inkSoft, align: 'left' });
    // Dividers.
    ctx.fillStyle = 'rgba(74, 47, 28, 0.25)';
    ctx.fillRect(w * 0.235, h * 0.18, 2, h * 0.64);
    ctx.fillRect(w * 0.755, h * 0.18, 2, h * 0.64);
    // Happiness: the face, the segments and the percentage.
    moodFace(ctx, w * 0.285, mid + h * 0.05, h * 0.2, mood);
    write(ctx, 'HAPPINESS', w * 0.335, h * 0.25, h * 0.12, { weight: 800, color: INK.inkSoft, align: 'left' });
    write(ctx, `${Math.round(mood * 100)}%`, w * 0.725, h * 0.25, h * 0.14, { weight: 800, color: moodColour(mood), align: 'right' });
    const x0 = w * 0.335;
    const span = w * 0.39;
    const gap = span * 0.012;
    const sw = (span - gap * (SEGMENTS - 1)) / SEGMENTS;
    const sy = h * 0.4;
    const sh = h * 0.42;
    const low = this.live && mood <= 0.3 && mood > 0;
    const pulse = low ? 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(this.time * MOTION.pulse * Math.PI * 2)) : 1;
    for (let i = 0; i < SEGMENTS; i++) {
      const x = x0 + i * (sw + gap);
      roundRect(ctx, x, sy, sw, sh, sh * 0.18);
      ctx.fillStyle = '#e6d3b3';
      ctx.fill();
      const f = this.fill[i];
      if (f > 0.005) {
        // Fills from the bottom, drains from the top.
        ctx.save();
        roundRect(ctx, x, sy, sw, sh, sh * 0.18);
        ctx.clip();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = moodColour(mood);
        ctx.fillRect(x, sy + sh * (1 - f), sw, sh * f);
        ctx.restore();
      }
    }
    // The bank, popping for a moment when coins come in.
    const pop = this.popAge < MOTION.pop ? 1 + 0.22 * Math.sin((this.popAge / MOTION.pop) * Math.PI) : 1;
    const digits = String(s.bank).length;
    coin(ctx, w * 0.8, mid + h * 0.05, h * 0.13 * pop);
    write(ctx, `${s.bank}`, w * 0.835, mid + h * 0.07, h * (digits > 3 ? 0.24 : digits > 2 ? 0.29 : 0.36) * pop, { weight: 800, align: 'left' });
    write(ctx, 'COINS', w * 0.775, h * 0.25, h * 0.12, { weight: 800, color: INK.inkSoft, align: 'left' });
  }
}
