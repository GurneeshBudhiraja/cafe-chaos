/**
 * StripSystem: the scoreboard, drawn in sketch pen and hung at the
 * player's eye level, above the back of the café, turned to the player. It
 * is the one place to read how the evening is going:
 *
 *   open 3:42  |  (face) [▨▨▨▨▨▨▨□□□] 70%  |  (coin) 46
 *
 * - The clock, counting up, with the longest evening under it ("new
 *   record!" once this run has passed it).
 * - Happiness: a face and ten hatched segments, calm above 60 %, warn
 *   down to 30 %, danger below; the percentage beside them.
 * - The bank.
 *
 * The lines are hand-drawn but still (ui/sketch.ts): nothing wobbles. It
 * moves only when something happens: a segment lost drains away over half
 * a second (one gained fills in), coins coming in make the number pop,
 * and under 30 % the lit segments pulse slowly, once a second.
 *
 * At eye level, straight ahead over the café, it can be read without
 * looking down or away from the guests, and it is never under a hand. It
 * follows the player's eye height slowly (a lean or a nod does not move
 * it), stays above the café's tallest point, and keeps its real size
 * whatever the café's scale (ui/panel.ts). GameSystem shows it.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { HAPPINESS } from '../game/rules.js';
import { Panel } from '../ui/panel.js';
import { line, moodInk, pen, scrawl, SKETCH, sketchCoin, sketchFace, sketchFontReady } from '../ui/sketch.js';
import { clockText } from './board-system.js';
import { CafeSystem } from './cafe-system.js';
import { ScoreSystem } from './score-system.js';

/**
 * Its size (real metres), and where it hangs: over the café's back edge,
 * `below` under the eyes (a touch under eye level reads most comfortably),
 * never lower than `clear` above the café's tallest point (the cherry
 * tree, 0.405 m in café space) so nothing of the café hides it.
 */
export const STRIP = { width: 0.42, height: 0.103, below: 0.03, clear: 0.03, back: -0.33, top: 0.405 };
/** How long a segment takes to drain or fill, and a coin pop lasts (seconds); the pulse under 30 % (times a second); how quickly it follows the eyes' height (per second). */
const MOTION = { segment: 0.5, pop: 0.3, pulse: 1, follow: 1.2 };
const SEGMENTS = 10;

export class StripSystem extends createSystem({}) {
  readonly panel = new Panel('ScoreStrip', STRIP.width, STRIP.height);
  /** The longest evening before this run (seconds), and whether a run is on: the game sets them. */
  best = 0;
  live = false;
  private cafe!: CafeSystem;
  private score!: ScoreSystem;
  private readonly head = new Vector3();
  private readonly spot = new Vector3();
  /** The height it hangs at (world), eased toward the eyes. */
  private height = NaN;
  /** Each segment's fill as shown (0 to 1), eased toward what the happiness says. */
  private readonly fill: number[] = Array.from({ length: SEGMENTS }, () => 1);
  private bank = 0;
  private popAge = Infinity;
  private time = 0;
  private shown = '';

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.score = this.world.getSystem(ScoreSystem)!;
    this.cafe.cafe.add(this.panel.mesh);
    this.panel.frame = false;
    this.panel.onTop = true;
    this.panel.turn = 2.5;
    this.bank = this.score.bank;
    this.panel.set((ctx, w, h) => this.draw(ctx, w, h));
    void sketchFontReady.then(() => this.panel.paint());
  }

  update(frameDelta: number): void {
    const delta = Math.min(0.1, frameDelta);
    this.player.head.getWorldPosition(this.head);
    this.place(delta);
    if (!this.panel.update(delta, this.head)) return;
    this.time += delta;
    const s = this.score;
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
    this.height = NaN;
  }

  /** Over the café's back edge, at (just under) eye height, but always clear above the café. */
  private place(delta: number): void {
    const cafe = this.cafe.cafe;
    const scale = cafe.scale.x || 1;
    // The world height the eyes want, eased so a nod or a lean does not move it.
    const eyes = this.head.y - STRIP.below;
    this.height = Number.isNaN(this.height) ? eyes : this.height + (eyes - this.height) * (1 - Math.exp(-MOTION.follow * delta));
    cafe.localToWorld(this.spot.set(0, 0, STRIP.back));
    this.spot.y = this.height;
    cafe.worldToLocal(this.spot);
    const lowest = STRIP.top + (STRIP.clear + STRIP.height / 2) / scale;
    this.panel.mesh.position.set(0, Math.max(lowest, this.spot.y), STRIP.back);
  }

  private draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const rc = pen(this.panel.canvas);
    const s = this.score;
    const mood = s.happiness / HAPPINESS.max;
    const lw = Math.max(2, h * 0.016);
    // The paper, with a marker border.
    rc.rectangle(lw * 2, lw * 2, w - lw * 4, h - lw * 4, line(11, lw * 1.2, { fill: SKETCH.paper, fillStyle: 'solid', roughness: 1.3 }));
    // The clock, and the record under it.
    scrawl(ctx, 'open', w * 0.045, h * 0.24, h * 0.13, { color: SKETCH.soft, weight: 400 });
    scrawl(ctx, clockText(s.clock), w * 0.04, h * 0.56, h * 0.36);
    const record = this.live && this.best > 0 && s.clock > this.best;
    if (this.best > 0) scrawl(ctx, record ? 'new record!' : `best ${clockText(this.best)}`, w * 0.045, h * 0.83, h * 0.12, { color: record ? SKETCH.red : SKETCH.soft });
    // Dividers.
    rc.line(w * 0.225, h * 0.17, w * 0.227, h * 0.83, line(21, lw * 0.8));
    rc.line(w * 0.765, h * 0.17, w * 0.763, h * 0.83, line(22, lw * 0.8));
    // Happiness: the face, the segments and the percentage.
    sketchFace(rc, w * 0.27, h * 0.56, h * 0.36, mood, 31, lw);
    scrawl(ctx, 'happiness', w * 0.315, h * 0.24, h * 0.13, { color: SKETCH.soft, weight: 400 });
    scrawl(ctx, `${Math.round(mood * 100)}%`, w * 0.745, h * 0.24, h * 0.15, { color: moodInk(mood), align: 'right' });
    const x0 = w * 0.315;
    const span = w * 0.43;
    const gap = span * 0.022;
    const sw = (span - gap * (SEGMENTS - 1)) / SEGMENTS;
    const sy = h * 0.38;
    const sh = h * 0.42;
    const low = this.live && mood <= 0.3 && mood > 0;
    const pulse = low ? 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(this.time * MOTION.pulse * Math.PI * 2)) : 1;
    for (let i = 0; i < SEGMENTS; i++) {
      const x = x0 + i * (sw + gap);
      const f = this.fill[i];
      if (f > 0.005) {
        // Hatched in, filling from the bottom and draining from the top.
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - lw, sy + sh * (1 - f), sw + lw * 2, sh * f + lw);
        ctx.clip();
        ctx.globalAlpha = pulse;
        rc.rectangle(x, sy, sw, sh, line(50 + i, lw * 0.9, { stroke: 'transparent', fill: moodInk(mood), fillStyle: 'hachure', hachureGap: sw * 0.18, fillWeight: lw * 1.1, hachureAngle: -41 + i * 7 }));
        ctx.restore();
      }
      rc.rectangle(x, sy, sw, sh, line(60 + i, lw * 0.85, f > 0.005 ? {} : { stroke: SKETCH.empty }));
    }
    // The bank, popping for a moment when coins come in.
    const pop = this.popAge < MOTION.pop ? 1 + 0.22 * Math.sin((this.popAge / MOTION.pop) * Math.PI) : 1;
    const digits = String(s.bank).length;
    scrawl(ctx, 'coins', w * 0.79, h * 0.24, h * 0.13, { color: SKETCH.soft, weight: 400 });
    sketchCoin(rc, w * 0.815, h * 0.58, h * 0.27 * pop, 41, lw);
    scrawl(ctx, `${s.bank}`, w * 0.855, h * 0.58, h * (digits > 3 ? 0.24 : digits > 2 ? 0.3 : 0.36) * pop);
  }
}
