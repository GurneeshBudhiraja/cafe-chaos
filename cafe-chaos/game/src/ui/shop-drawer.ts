/**
 * The shop as a drawer under the bar: pinch Shop and a slim paper strip,
 * as wide as the bar, comes down beneath it. The café stays in view and
 * stands still while it is open (as the buy card for a table), instead of
 * the shop being a card that hid the café. Each hire is a picture, its
 * name and one big HIRE button with its price: moss green when the bank
 * can pay, pale when it cannot; the baristas' pips show how many are
 * hired. A close square sits at the right end, under the Shop button it
 * came from. Pointed at with the hand ray and pinched, like the bar.
 *
 * Sizes: the drawer is 10 cm tall at about a metre, so a HIRE button is
 * about 4 cm tall and 13 cm wide (over 2 degrees by 7), above Meta's 2.5
 * to 3 degree minimum target; the words are as tall as the bar's.
 * StripSystem places it (and lifts the bar while it is open so it covers
 * nothing of the café); GameSystem fills it and opens and closes it.
 */

import { Panel, type Button } from './panel.js';
import { hand, line, pen, scrawl, SKETCH, sketchCoin } from './sketch.js';

/** The drawer's height (metres; as wide as the bar), its gap under the bar, and its clearance over the café's top. */
export const DRAWER = { height: 0.1, gap: 0.02, clear: 0.015 };

/** One hire in the drawer. `price` null: all of this kind are hired. */
export interface DrawerRow {
  kind: 'barista' | 'janitor';
  name: string;
  hired: number;
  most: number;
  price: number | null;
  canPay: boolean;
  /** The click id of its HIRE ('-later' is added when the bank cannot pay). */
  id: string;
}

/** The pictures: the staff renders (models/unlock-icons.png tile 0, models/icon-janitor.png). */
const pictures: { barista: HTMLImageElement | null; janitor: HTMLImageElement | null } = { barista: null, janitor: null };
const loaded: (() => void)[] = [];
if (typeof Image !== 'undefined') {
  for (const [kind, file] of [['barista', 'unlock-icons.png'], ['janitor', 'icon-janitor.png']] as const) {
    const img = new Image();
    img.onload = () => {
      pictures[kind] = img;
      for (const f of loaded) f();
    };
    img.src = `${import.meta.env.BASE_URL}models/${file}`;
  }
}

export class ShopDrawer {
  readonly panel: Panel;
  private rows: DrawerRow[] = [];

  constructor(width: number) {
    this.panel = new Panel('ShopDrawer', width, DRAWER.height);
    this.panel.frame = false;
    this.panel.onTop = true;
    loaded.push(() => {
      if (this.rows.length) this.draw();
    });
  }

  /** Fill it with these hires and bring it up. */
  show(rows: DrawerRow[]): void {
    this.rows = rows;
    this.draw();
    this.panel.show(true);
  }

  hide(): void {
    this.panel.show(false);
  }

  private draw(): void {
    const panel = this.panel;
    const w = panel.width;
    const h = panel.height;
    const pad = h * 0.17;
    const closeW = h * 0.5;
    const col = (w - pad * 5 - closeW) / 2;
    const r = h * 0.34;
    const buttons: Button[] = [];
    const cols = this.rows.slice(0, 2).map((row, i) => {
      const x0 = pad + i * (col + pad * 2);
      const cx = x0 + r + 3;
      const tx = cx + r + h * 0.14;
      const tw = x0 + col - tx;
      const by = h * 0.46;
      const bh = h * 0.42;
      if (row.price !== null) {
        const live = row.canPay;
        const price = row.price;
        buttons.push({
          id: live ? row.id : `${row.id}-later`,
          label: `HIRE ${price}`,
          x: tx, y: by, w: tw, h: bh,
          bare: true,
          off: !live,
          draw: (ctx, _b, hover, pressed) => this.hireButton(ctx, tx, by + (pressed ? bh * 0.04 : 0), tw, bh, price, live, !!hover, 350 + i * 10),
        });
      }
      return { row, x0, cx, tx, tw, by, bh };
    });
    const qx = w - pad - closeW;
    const qy = (h - closeW) / 2;
    buttons.push({
      id: 'shop-close', label: 'Close', x: qx, y: qy, w: closeW, h: closeW, bare: true,
      draw: (ctx, _b, hover, pressed) => {
        const rc = pen(panel.canvas);
        const lw = Math.max(2, h * 0.018);
        const dip = pressed ? closeW * 0.04 : 0;
        rc.rectangle(qx, qy + dip, closeW, closeW, line(370, lw * 1.1, { fill: hover ? '#c4b397' : SKETCH.paper, fillStyle: 'solid' }));
        const m = closeW * 0.3;
        rc.line(qx + m, qy + dip + m, qx + closeW - m, qy + dip + closeW - m, line(371, lw * 1.4));
        rc.line(qx + closeW - m, qy + dip + m, qx + m, qy + dip + closeW - m, line(372, lw * 1.4));
      },
    });
    panel.set((ctx) => {
      const rc = pen(panel.canvas);
      const lw = Math.max(2, h * 0.018);
      rc.rectangle(lw * 2, lw * 2, w - lw * 4, h - lw * 4, line(311, lw * 1.2, { fill: SKETCH.paper, fillStyle: 'solid', roughness: 1.3 }));
      cols.forEach(({ row, x0, cx, tx, tw, by, bh }, i) => {
        if (i === 1) rc.line(x0 - pad, h * 0.16, x0 - pad + 2, h * 0.84, line(330, lw * 0.8));
        // The picture in a round paper frame.
        rc.circle(cx, h / 2, r * 2, line(320 + i, lw, { fill: '#e4d9c6', fillStyle: 'solid' }));
        const img = pictures[row.kind];
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, h / 2, r - lw, 0, Math.PI * 2);
          ctx.clip();
          const s = r * 2.05;
          if (row.kind === 'barista') {
            // The icon set is 4 x 2 tiles with room round each render: the middle of tile 0, larger.
            const tw0 = img.width / 4;
            const th0 = img.height / 2;
            const crop = 0.18;
            ctx.drawImage(img, tw0 * crop, th0 * crop * 0.6, tw0 * (1 - crop * 2), th0 * (1 - crop * 2), cx - s / 2, h / 2 - s / 2, s, s);
          } else ctx.drawImage(img, cx - s / 2, h / 2 - s / 2, s, s);
          ctx.restore();
        }
        // The name, and a pip for each that can be hired (filled: hired).
        scrawl(ctx, row.name, tx, h * 0.28, h * 0.24);
        if (row.most > 1) {
          ctx.font = hand(h * 0.24, 700);
          const nw = ctx.measureText(row.name).width;
          for (let k = 0; k < row.most; k++) rc.circle(tx + nw + h * 0.14 + k * h * 0.15, h * 0.27, h * 0.1, line(340 + i * 5 + k, lw * 0.8, { fill: k < row.hired ? SKETCH.moss : SKETCH.paper, fillStyle: 'solid' }));
        }
        // All hired: said where the button would be.
        if (row.price === null) scrawl(ctx, row.most > 1 ? `All ${row.most} hired` : 'Hired', tx + tw / 2, by + bh / 2 + h * 0.02, h * 0.2, { color: SKETCH.moss, align: 'center' });
      });
    }, buttons);
  }

  /** HIRE and the price: moss when the bank can pay (a deeper moss when aimed at), pale when it cannot. */
  private hireButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, bh: number, price: number, live: boolean, hover: boolean, seed: number): void {
    const rc = pen(this.panel.canvas);
    const lw = Math.max(2, this.panel.height * 0.018);
    rc.rectangle(x, y, w, bh, line(seed, lw, { fill: live ? (hover ? SKETCH.mossDeep : SKETCH.moss) : SKETCH.paper, fillStyle: 'solid', stroke: live ? SKETCH.mossDeep : '#b6a993', roughness: 1.1 }));
    const ink = live ? '#f2ebdd' : '#9c8f78';
    const size = bh * 0.5;
    ctx.font = hand(size, 700);
    const ww = ctx.measureText('HIRE').width;
    const pw = ctx.measureText(`${price}`).width;
    const cd = size * 0.95;
    let lx = x + (w - (ww + size * 0.5 + cd + size * 0.25 + pw)) / 2;
    const cy = y + bh / 2;
    scrawl(ctx, 'HIRE', lx, cy + size * 0.06, size, { color: ink });
    lx += ww + size * 0.5;
    if (live) sketchCoin(rc, lx + cd / 2, cy, cd, seed + 3, lw * 0.8);
    else rc.circle(lx + cd / 2, cy, cd, line(seed + 4, lw * 0.8, { stroke: '#9c8f78' }));
    lx += cd + size * 0.25;
    scrawl(ctx, `${price}`, lx, cy + size * 0.06, size, { color: ink });
  }
}
