/**
 * A tip: a small paper card in the café's sketch pen that appears next to
 * the thing it is about (a guest, a table, the bar) the first time that
 * thing matters, says it in a few words, and goes away by itself: when
 * the player does what it says, or after a few seconds. It never stops
 * the game and it takes no press (GameSystem decides when; game/rules.ts
 * TIPS has the words).
 *
 * From Meta's hands onboarding guidance: show a lesson only when it is
 * relevant, next to the object, with minimal text, one or two things at a
 * time, and a short distinct sound (hands have no haptics). The words are
 * about 1 cm tall at the café, over Microsoft's comfortable 0.65 to 0.8
 * degrees at arm's length. It is a Panel, so its size is real metres and it
 * turns to the player; it is drawn over the café (no depth test).
 */

import { Panel } from './panel.js';
import { hand, line, pen, SKETCH } from './sketch.js';

/** The card's size (metres) and how far above its target it stands. */
export const TIP = { width: 0.15, height: 0.05, above: 0.07 };
/** A one-line note's height, as a share of TIP.height. */
const ONE_LINE = 0.68;

export class TipCard {
  readonly panel = new Panel('TipCard', TIP.width, TIP.height);
  private drawn = '';

  constructor() {
    this.panel.frame = false;
    this.panel.onTop = true;
    this.panel.turn = 3;
    // Over the café, under the menu cards (drawn at 30 and up): the buy card covers a tip.
    this.panel.mesh.renderOrder = 28;
  }

  /**
   * Show `title` (bold, the keyword) and `text` beside a small `icon`
   * picture. With no `text`, a one-line note: the title alone, on a card
   * two thirds as tall.
   */
  show(title: string, text: string, icon: (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void): void {
    const key = `${title}|${text}`;
    if (key !== this.drawn) {
      this.drawn = key;
      // As wide as its words need (the icon, the longer line, a margin), never narrower than TIP.width; the words keep
      // their size whatever the card's height (sized from TIP.height, at 2400 px a metre, ui/panel.ts).
      const one = !text;
      const hp = TIP.height * 2400;
      const tall = one ? TIP.height * ONE_LINE : TIP.height;
      const ctx0 = this.panel.ctx;
      ctx0.font = hand(hp * 0.3, 700);
      const a = ctx0.measureText(title).width;
      ctx0.font = hand(hp * 0.23, 400);
      const b = one ? 0 : ctx0.measureText(text).width;
      const lead = tall * 2400 * 0.92;
      const needPx = lead + Math.max(a, b) + hp * 0.3;
      this.panel.resize(Math.max(one ? 0 : TIP.width, needPx / 2400), tall);
      this.panel.set((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const lw = Math.max(2, h * 0.04);
        const rc = pen(this.panel.canvas);
        rc.rectangle(lw * 1.5, lw * 1.5, w - lw * 3, h - lw * 3, line(400, lw, { fill: SKETCH.paper, fillStyle: 'solid', stroke: SKETCH.timber, roughness: 1.1 }));
        // A little tail down to what it is about.
        ctx.fillStyle = SKETCH.paper;
        const r = h * 0.3;
        icon(ctx, h * 0.48, h * 0.5, r);
        const x = h * 0.92;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = SKETCH.ink;
        ctx.font = hand(hp * 0.3, 700);
        ctx.fillText(title, x, one ? h * 0.52 : h * 0.34);
        if (one) return;
        ctx.fillStyle = SKETCH.soft;
        ctx.font = hand(hp * 0.23, 400);
        ctx.fillText(text, x, h * 0.68);
      });
    }
    this.panel.show(true);
  }

  hide(): void {
    this.panel.show(false);
  }
}
