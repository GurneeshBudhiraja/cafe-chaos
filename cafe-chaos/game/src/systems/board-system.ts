/**
 * BoardSystem: the side board, a paper card standing on the table beside
 * the café (not over it, not in front of it), turned to the player. It
 * is where the two things the player does besides seating are pressed
 * (the clock, happiness and coins are read on the strip in front of the
 * café, StripSystem):
 *
 * - the staff: six places, filled as servers are hired;
 * - Hire: until the bank can pay for the next server the button holds a
 *   savings bar (so much of the price saved); then it turns amber and
 *   reads the price; with all six hired it reads Full staff;
 * - Pause, small and in the far corner from Hire.
 *
 * Laid out from three tried layouts (docs/PLAN.md, phase 2). The buttons
 * are 41 mm and 31 mm tall, over Meta's 22 mm for a fingertip, and the
 * board keeps its real size whatever the café's (ui/panel.ts).
 *
 * It stands beside the café's right side, beyond the line at the gate
 * (so from the seat it is behind the guests, never in front of them) and
 * inside the view when the player looks at the café; `side` moves it to the left for a left-handed
 * player. GameSystem shows and hides it and handles its presses.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { MAX_STAFF } from '../game/rules.js';
import { coin, INK, Panel, roundRect, write, type Button } from '../ui/panel.js';
import { CafeSystem } from './cafe-system.js';
import { HoldSystem } from './hold-system.js';
import { ScoreSystem } from './score-system.js';
import { ShopSystem } from './shop-system.js';

/** The board's size (real metres), and where it stands: this far out from the café's side and above the table (real metres), and how far toward the player from the café's middle (café space). */
export const BOARD = { width: 0.2, height: 0.15, gap: 0.03, lift: 0.03, forward: 0.16 };
/**
 * The layout was drawn for an 18 cm board; from the seat the board is
 * about 75 cm from the eyes (the café itself is 92 cm across), so it is
 * built a fifth larger. `MM` is canvas pixels per millimetre of that
 * drawing (ui/panel.ts draws at 2400 px a metre).
 */
const MM = 2.4 * 1.2;

/** m:ss. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class BoardSystem extends createSystem({}) {
  readonly panel = new Panel('SideBoard', BOARD.width, BOARD.height);
  /** Which side of the café it stands on. */
  side: 'right' | 'left' = 'right';
  /** The longest evening before this run (seconds); the game sets it. */
  best = 0;
  /** True while a run is on (the clock runs and the record can be beaten). */
  live = false;
  private cafe!: CafeSystem;
  private score!: ScoreSystem;
  private shop!: ShopSystem;
  private hold: HoldSystem | null = null;
  private readonly head = new Vector3();
  /** What the board last showed, so it is drawn again only when something changes. */
  private shown = '';

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.score = this.world.getSystem(ScoreSystem)!;
    this.shop = this.world.getSystem(ShopSystem)!;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    this.cafe.cafe.add(this.panel.mesh);
    this.panel.turn = 2.5;
    // A pinch on the board is the board's, never the café's or a guest's.
    this.hold?.claims.push((point) => this.panel.covers(point));
    this.layout();
  }

  update(delta: number): void {
    this.place();
    this.player.head.getWorldPosition(this.head);
    if (!this.panel.update(Math.min(0.1, delta), this.head)) return;
    const s = this.score;
    const now = `${s.bank}|${this.shop.hires}|${this.live}`;
    if (now !== this.shown) {
      this.shown = now;
      this.layout();
    }
  }

  /** Beside the café's front corner, clear of it, standing just above the table: wherever the café is and whatever its size. */
  private place(): void {
    const scale = this.cafe.cafe.scale.x || 1;
    const bounds = this.hold?.bounds;
    const edge = this.side === 'right' ? (bounds && bounds.max.x > 0 ? bounds.max.x : 0.3) : (bounds && bounds.min.x < 0 ? bounds.min.x : -0.3);
    const out = (BOARD.gap + BOARD.width / 2) / scale;
    this.panel.mesh.position.set(edge + (this.side === 'right' ? out : -out), (BOARD.lift + BOARD.height / 2) / scale, BOARD.forward);
  }

  /** Set the board's buttons for the state of the bank and the staff, and draw it. */
  private layout(): void {
    const { width: w, height: h } = this.panel;
    const L = w * 0.09;
    const R = w * 0.91;
    const price = this.shop.price;
    const bank = this.score.bank;
    const canPay = price !== null && bank >= price;
    const hire: Button = {
      id: 'hire', x: L, y: h - 34 * MM - h * 0.09, w: R - L, h: 34 * MM, primary: true, off: !canPay,
      draw: (ctx, b) => {
        const mid = b.x + b.w / 2;
        if (price === null) {
          write(ctx, 'Full staff', mid, b.y + b.h / 2, 8.5 * MM, { weight: 800, color: INK.inkSoft });
        } else if (canPay) {
          write(ctx, 'Hire a server', mid, b.y + b.h * 0.34, 8.5 * MM, { weight: 800 });
          coin(ctx, mid - 9 * MM, b.y + b.h * 0.7, 4.5 * MM);
          write(ctx, `${price}`, mid - 2 * MM, b.y + b.h * 0.71, 8.5 * MM, { weight: 800, align: 'left' });
        } else {
          write(ctx, 'Next server', mid, b.y + b.h * 0.27, 7.5 * MM, { weight: 800, color: INK.inkSoft });
          meter(ctx, b.x + b.w * 0.1, b.y + b.h * 0.47, b.w * 0.8, 5 * MM, bank / price, INK.gold);
          coin(ctx, mid - 17 * MM, b.y + b.h * 0.79, 3.6 * MM);
          write(ctx, `${bank} / ${price}`, mid - 11 * MM, b.y + b.h * 0.8, 6.5 * MM, { weight: 800, align: 'left', color: INK.inkSoft });
        }
      },
    };
    const pause: Button = {
      id: 'pause', x: R - 26 * MM, y: h * 0.08, w: 26 * MM, h: 26 * MM,
      draw: (ctx, b) => {
        const x = b.x + b.w / 2;
        const y = b.y + b.h / 2;
        const r = 6 * MM;
        ctx.fillStyle = INK.ink;
        for (const side of [-1, 1]) {
          roundRect(ctx, x + (side < 0 ? -r * 0.55 : r * 0.17), y - r * 0.6, r * 0.38, r * 1.2, r * 0.1);
          ctx.fill();
        }
      },
    };
    this.panel.set((ctx) => this.draw(ctx, w, h, L, R), this.live ? [hire, pause] : [hire]);
  }

  private draw(ctx: CanvasRenderingContext2D, _w: number, h: number, L: number, R: number): void {
    // The staff: six places, filled as servers are hired. (The clock, happiness and coins are on the strip in front.)
    write(ctx, 'STAFF', L, h * 0.15, 6 * MM, { weight: 800, color: INK.inkSoft, align: 'left' });
    for (let i = 0; i < MAX_STAFF; i++) person(ctx, L + 5 * MM + i * 13 * MM, h * 0.36, 7 * MM, i < this.shop.staff);
    void R;
  }
}

/** A rounded bar, `share` of it filled. */
function meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, share: number, colour: string): void {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#e6d3b3';
  ctx.fill();
  if (share > 0.005) {
    roundRect(ctx, x, y, Math.max(h, w * Math.min(1, share)), h, h / 2);
    ctx.fillStyle = colour;
    ctx.fill();
  }
}

/** A little figure: a server on the staff (amber) or a place still to fill (pale). */
function person(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, on: boolean): void {
  ctx.fillStyle = on ? INK.amberDeep : '#dcc7a4';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.45, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, x - r * 0.6, y + r * 0.05, r * 1.2, r * 0.9, r * 0.4);
  ctx.fill();
}
