/**
 * The tag over a locked table: a small paper label in the café's sketch
 * pen, a padlock on the left and the price beside a coin, standing a
 * little above the table and turned to the player. It is a Panel with one
 * button over all of it, so the hand ray lights it (Meta: show the hover)
 * and a pinch on it opens the buy card (GameSystem). The ray only: a
 * fingertip or a pinch among the tables is for the guests, never a tag.
 *
 * Moss with the padlock open when the bank can pay, plain paper with it
 * shut when it cannot (never colour alone: WCAG 1.4.1, Meta's
 * accessibility checklist): the player can see from across the room which
 * tables are within reach. Its size is real metres whatever the café's
 * scale (ui/panel.ts).
 */

import { Panel, type Button } from './panel.js';
import { hand, line, pen, SKETCH, sketchCoin } from './sketch.js';

/**
 * The tag's size (metres) and how far above the table's top it floats. At
 * about 0.8 m from the seat it is 4.3 by 3 degrees: over Meta's 2.5 to 3
 * for a ray target each way; its digits about 0.9 degrees, over
 * Microsoft's 0.4 to 0.5 minimum for text at arm's length.
 */
export const LOCK_TAG = { width: 0.066, height: 0.042, above: 0.05 };

export class LockTag {
  readonly panel: Panel;
  private price = 0;
  private affordable = false;
  private drawn = '';

  constructor(readonly table: number) {
    this.panel = new Panel(`LockTag-${table}`, LOCK_TAG.width, LOCK_TAG.height);
    this.panel.frame = false;
    this.panel.onTop = true;
    this.panel.turn = 3;
    // Over the café (no depth test), under the menu cards (drawn at 30): the buy card covers the other tags.
    this.panel.mesh.renderOrder = 29;
  }

  /** Draw (again) for this price, and whether the bank can pay it. */
  set(price: number, affordable: boolean): void {
    const key = `${price}|${affordable}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.price = price;
    this.affordable = affordable;
    const p = this.panel;
    const button: Button = {
      id: `table-${this.table}`,
      x: 0,
      y: 0,
      w: p.width,
      h: p.height,
      bare: true,
      draw: (ctx, _b, hover, pressed) => this.draw(ctx, p.width, p.height, !!hover, !!pressed),
    };
    p.set(() => {}, [button]);
  }

  private draw(ctx: CanvasRenderingContext2D, w: number, h: number, hover: boolean, pressed: boolean): void {
    ctx.clearRect(0, 0, w, h);
    const rc = pen(this.panel.canvas);
    const lw = Math.max(2, h * 0.045);
    const dip = pressed ? h * 0.04 : 0;
    const fill = this.affordable ? (hover ? '#9fc48a' : SKETCH.moss) : hover ? '#c4b397' : SKETCH.paper;
    const ink = this.affordable ? '#f2ebdd' : SKETCH.ink;
    rc.rectangle(lw * 1.5, lw * 1.5 + dip, w - lw * 3, h - lw * 3, line(300 + this.table, lw, { fill, fillStyle: 'solid', stroke: this.affordable ? SKETCH.mossDeep : SKETCH.ink, roughness: 1.1 }));
    // The padlock: a body and a shackle.
    const bx = w * 0.19;
    const by = h * 0.56 + dip;
    const bw = h * 0.3;
    const bh = h * 0.26;
    rc.rectangle(bx - bw / 2, by - bh / 2, bw, bh, line(310 + this.table, lw * 0.9, { fill: ink, fillStyle: 'solid', stroke: ink }));
    // The shackle: shut over the body, or (the bank can pay) swung open to the side, standing on one leg.
    if (this.affordable) rc.arc(bx + bw * 0.42, by - bh / 2 - bh * 0.35, bw * 0.7, bh * 1.1, Math.PI * 0.5, Math.PI * 1.5, false, line(320 + this.table, lw * 1.1, { stroke: ink }));
    else rc.arc(bx, by - bh / 2, bw * 0.7, bh * 1.1, Math.PI, Math.PI * 2, false, line(320 + this.table, lw * 1.1, { stroke: ink }));
    // The price beside a coin, the figures made smaller if three or more would not fit.
    const cx = w * 0.4;
    sketchCoin(rc, cx, h * 0.5 + dip, h * 0.32, 330 + this.table, lw * 0.9);
    const word = `${this.price}`;
    const from = cx + h * 0.22;
    const room = w - lw * 3 - h * 0.08 - from;
    let size = h * 0.42;
    ctx.font = hand(size, 700);
    const wide = ctx.measureText(word).width;
    if (wide > room) {
      size *= room / wide;
      ctx.font = hand(size, 700);
    }
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(word, from, h * 0.53 + dip);
  }
}
