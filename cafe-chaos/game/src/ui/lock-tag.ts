/**
 * The tag over a locked table: a small paper label in the café's sketch
 * pen, a padlock on the left and the price beside a coin, standing a
 * little above the table and turned to the player. It is a Panel with one
 * button over all of it, so the hand ray lights it (Meta: show the hover)
 * and a pinch on it opens the buy card (GameSystem). The ray only: a
 * fingertip or a pinch among the tables is for the guests, never a tag.
 *
 * At rest it is only a small padlock on a paper disc (the owner: ten tags
 * crowded the café), open with a gold coin on its shoulder when the bank
 * can pay, shut when it cannot (never colour alone: WCAG 1.4.1, Meta's
 * accessibility checklist). Pointed at, it opens into the full tag: moss
 * with the price when affordable, plain paper when not. Its size is real metres whatever the café's
 * scale (ui/panel.ts).
 */

import { Panel, type Button } from './panel.js';
import { hand, line, pen, SKETCH, sketchCoin } from './sketch.js';

/**
 * The tag's size (metres) and how far above the table's top it floats. At
 * about 0.8 m from the seat it is 4.3 by 3 degrees: over Meta's 2.5 to 3
 * for a ray target each way; its digits about 0.9 degrees, over
 * Microsoft's 0.4 to 0.5 minimum for text at arm's length.
 *
 * It keeps that angular size, not its size in metres (Meta: keep a
 * target's angular size as it moves in depth): a tag further than `at`
 * from the eyes grows with the distance, up to `most` times. A table the
 * bank can pay for stands out: `ready` times as big, `aboveReady` over its
 * top, in full colour; one it cannot stays as made and faded (Panel
 * `dimmed`), so which tables can open is plain at a glance. When a table
 * first becomes affordable its tag pulses twice (`pulse`: seconds, growth).
 */
export const LOCK_TAG = { width: 0.066, height: 0.042, above: 0.05, aboveReady: 0.07, at: 0.8, most: 1.8, ready: 1.4, pulse: { seconds: 1.2, grow: 0.25 } };

export class LockTag {
  readonly panel: Panel;
  private price = 0;
  private affordable = false;
  private drawn = '';
  private pulseAge = Infinity;
  /** The table top's height under it (its parent's space; GameSystem sets it). */
  top = 0;

  /** Pulse twice (a table just became affordable). */
  pulse(): void {
    this.pulseAge = 0;
  }

  /**
   * Its size and height this frame: grown with its distance from the eyes
   * (`distance`, metres) so it keeps its angular size, bigger and higher
   * when the bank can pay, pulsing if asked.
   */
  fit(distance: number, delta: number): void {
    const far = Math.min(LOCK_TAG.most, Math.max(1, distance / LOCK_TAG.at));
    let size = far * (this.affordable ? LOCK_TAG.ready : 1);
    if (this.pulseAge < LOCK_TAG.pulse.seconds) {
      this.pulseAge += delta;
      // Two swells in the time.
      size *= 1 + LOCK_TAG.pulse.grow * Math.max(0, Math.sin((this.pulseAge / LOCK_TAG.pulse.seconds) * Math.PI * 4));
    }
    this.panel.size = size;
    this.panel.dimmed = !this.affordable;
    this.panel.mesh.position.y = this.top + (this.affordable ? LOCK_TAG.aboveReady : LOCK_TAG.above);
  }

  constructor(readonly table: number) {
    this.panel = new Panel(`LockTag-${table}`, LOCK_TAG.width, LOCK_TAG.height);
    this.panel.frame = false;
    this.panel.onTop = true;
    this.panel.turn = 3;
    // Over the café (no depth test), under the menu cards (drawn at 30): the buy card covers the other tags.
    this.panel.mesh.renderOrder = 29;
  }

  /** Whether the bank can pay for this table now (its tag is bigger, and the ray helps more: GameSystem TAG_RAY). */
  get canBuy(): boolean {
    return this.affordable;
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

  /** The tag at rest: a paper disc with a padlock, a gold coin on its shoulder when it can be bought. */
  private drawSmall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const rc = pen(this.panel.canvas);
    const lw = Math.max(2, h * 0.045);
    const cx = w / 2;
    const cy = h * 0.52;
    const r = h * 0.3;
    rc.circle(cx, cy, r * 2, line(340 + this.table, lw, { fill: SKETCH.paper, fillStyle: 'solid', stroke: this.affordable ? SKETCH.mossDeep : SKETCH.ink, roughness: 1 }));
    const bw = r * 0.95;
    const bh = r * 0.78;
    rc.rectangle(cx - bw / 2, cy - bh * 0.15, bw, bh, line(341 + this.table, lw * 0.9, { fill: SKETCH.ink, fillStyle: 'solid', stroke: SKETCH.ink }));
    if (this.affordable) rc.arc(cx + bw * 0.42, cy - bh * 0.15 - bh * 0.35, bw * 0.7, bh * 1.1, Math.PI * 0.5, Math.PI * 1.5, false, line(342 + this.table, lw, { stroke: SKETCH.ink }));
    else rc.arc(cx, cy - bh * 0.15, bw * 0.7, bh * 1.1, Math.PI, Math.PI * 2, false, line(342 + this.table, lw, { stroke: SKETCH.ink }));
    if (this.affordable) sketchCoin(rc, cx + r * 0.85, cy - r * 0.75, h * 0.26, 343 + this.table, lw * 0.8);
  }

  private draw(ctx: CanvasRenderingContext2D, w: number, h: number, hover: boolean, pressed: boolean): void {
    ctx.clearRect(0, 0, w, h);
    // At rest: just a small padlock (with a coin mark when the bank can pay), so ten locked tables do not crowd
    // the café; pointed at, the full tag with the price. The hit area is the whole tag either way (over 3 degrees).
    if (!hover && !pressed) {
      this.drawSmall(ctx, w, h);
      return;
    }
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
