/**
 * The shop as a drawer under the bar: pinch Shop and a slim paper strip
 * (DRAWER.width: a little wider than the bar, for three columns) comes
 * down beneath it. The café stays in view and
 * stands still while it is open, instead of the shop being a card that
 * hid the café. Each column is a picture, its name and one big button
 * with its price (HIRE a barista or the janitor, OPEN a table): moss green
 * when the bank can pay, pale when it cannot; the baristas' pips show how
 * many are hired, the tables how many are left to open. A close square sits at the right end, under the Shop button it
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

/** The drawer's size (metres), its gap under the bar, and its clearance over the café's top. */
export const DRAWER = { width: 0.8, height: 0.1, gap: 0.02, clear: 0.015 };

/** Columns on one line of the drawer; more go on a second line under it (the drawer grows down). */
export const DRAWER_COLUMNS = 3;

/** One column in the drawer. `price` null: all of this kind are hired (or opened). */
export interface DrawerRow {
  /** 'musician': the Canadian café's fiddler and pianist; 'cafe': the Canadian café itself, bought with the Japanese café's coins. */
  kind: 'barista' | 'janitor' | 'table' | 'musician' | 'cafe';
  name: string;
  hired: number;
  most: number;
  price: number | null;
  canPay: boolean;
  /** The click id of its button ('-later' is added when the bank cannot pay). */
  id: string;
  /** The button's word: HIRE (staff) or OPEN (a table). */
  word: string;
  /** A note beside the name instead of pips (a table: how many are left). */
  note?: string;
  /** Said under the name where the button would be when there is no price (default: all hired, all open). */
  done?: string;
  /** A picture of its own (a path under the page), instead of the icon set's. */
  picture?: string;
}

/** The pictures: the staff renders (models/unlock-icons.png tile 0, models/icon-janitor.png). */
const pictures: { icons: HTMLImageElement | null; janitor: HTMLImageElement | null } = { icons: null, janitor: null };
/** Pictures of their own (DrawerRow.picture), by path, once loaded. */
const ownPictures = new Map<string, HTMLImageElement | null>();
function ownPicture(path: string): HTMLImageElement | null {
  if (!ownPictures.has(path) && typeof Image !== 'undefined') {
    ownPictures.set(path, null);
    const img = new Image();
    img.onload = () => {
      ownPictures.set(path, img);
      for (const f of loaded) f();
    };
    img.src = `${import.meta.env.BASE_URL}${path}`;
  }
  return ownPictures.get(path) ?? null;
}
/** Each kind's tile in the icon set (4 x 2 tiles, ui/start-menu.ts ICONS): the barista, a two-seat table. */
const TILE = { barista: 0, table: 1 } as const;
const loaded: (() => void)[] = [];
if (typeof Image !== 'undefined') {
  for (const [kind, file] of [['icons', 'unlock-icons.png'], ['janitor', 'icon-janitor.png']] as const) {
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

  private readonly width: number;

  constructor(width = DRAWER.width) {
    this.width = width;
    this.panel = new Panel('ShopDrawer', width, DRAWER.height);
    this.panel.frame = false;
    this.panel.onTop = true;
    loaded.push(() => {
      if (this.rows.length) this.draw();
    });
  }

  /** The drawer's height now (metres): one line of columns, or two. */
  get heightM(): number {
    return DRAWER.height * Math.max(1, Math.ceil(this.rows.length / DRAWER_COLUMNS));
  }

  /** Fill it with these hires and bring it up. */
  show(rows: DrawerRow[]): void {
    this.rows = rows;
    this.panel.resize(this.width, this.heightM);
    this.draw();
    this.panel.show(true);
  }

  hide(): void {
    this.panel.show(false);
  }

  private draw(): void {
    const panel = this.panel;
    const w = panel.width;
    const lines = Math.max(1, Math.ceil(this.rows.length / DRAWER_COLUMNS));
    // `h` is one line's height: everything in a column is laid out on its line's own band (`y0` down).
    const h = panel.height / lines;
    const pad = h * 0.17;
    const closeW = h * 0.5;
    const n = Math.max(1, Math.min(DRAWER_COLUMNS, this.rows.length));
    // n columns a line, a pad either side of each and a divider between, then the close square.
    const col = (w - pad * (2 * n + 1) - closeW) / n;
    const r = h * 0.32;
    const buttons: Button[] = [];
    const cols = this.rows.map((row, i) => {
      const k = i % DRAWER_COLUMNS;
      const y0 = Math.floor(i / DRAWER_COLUMNS) * h;
      const x0 = pad + k * (col + pad * 2);
      const cx = x0 + r + 3;
      const tx = cx + r + h * 0.14;
      const tw = x0 + col - tx;
      const by = y0 + h * 0.46;
      const bh = h * 0.42;
      if (row.price !== null) {
        const live = row.canPay;
        const price = row.price;
        buttons.push({
          id: live ? row.id : `${row.id}-later`,
          label: `${row.word} ${price}`,
          x: tx, y: by, w: tw, h: bh,
          bare: true,
          off: !live,
          draw: (ctx, _b, hover, pressed) => this.hireButton(ctx, tx, by + (pressed ? bh * 0.04 : 0), tw, bh, row.word, price, live, !!hover, 350 + i * 10),
        });
      }
      return { row, k, y0, x0, cx, tx, tw, by, bh };
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
      rc.rectangle(lw * 2, lw * 2, w - lw * 4, panel.height - lw * 4, line(311, lw * 1.2, { fill: SKETCH.paper, fillStyle: 'solid', roughness: 1.3 }));
      // Between two lines, a rule across.
      for (let l = 1; l < lines; l++) rc.line(pad, l * h, w - pad * 2 - closeW, l * h + 2, line(380 + l, lw * 0.8));
      cols.forEach(({ row, k, y0, x0, cx, tx, tw, by, bh }, i) => {
        const mid = y0 + h / 2;
        if (k > 0) rc.line(x0 - pad, y0 + h * 0.16, x0 - pad + 2, y0 + h * 0.84, line(330 + i, lw * 0.8));
        // The picture in a round paper frame.
        rc.circle(cx, mid, r * 2, line(320 + i, lw, { fill: '#e4d9c6', fillStyle: 'solid' }));
        const own = row.picture ? ownPicture(row.picture) : null;
        const img = row.picture ? own : row.kind === 'janitor' ? pictures.janitor : pictures.icons;
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, mid, r - lw, 0, Math.PI * 2);
          ctx.clip();
          const s = r * 2.05;
          if (!row.picture && (row.kind === 'barista' || row.kind === 'table')) {
            // The icon set is 4 x 2 tiles with room round each render: the middle of the kind's tile, larger.
            const tile = TILE[row.kind];
            const tw0 = img.width / 4;
            const th0 = img.height / 2;
            const crop = 0.18;
            ctx.drawImage(img, (tile % 4) * tw0 + tw0 * crop, Math.floor(tile / 4) * th0 + th0 * crop * 0.6, tw0 * (1 - crop * 2), th0 * (1 - crop * 2), cx - s / 2, mid - s / 2, s, s);
          } else {
            // Its own picture, cropped to fill the round frame (never stretched).
            const q = Math.min(img.width, img.height);
            ctx.drawImage(img, (img.width - q) / 2, (img.height - q) / 2, q, q, cx - s / 2, mid - s / 2, s, s);
          }
          ctx.restore();
        }
        // The name, and a pip for each that can be hired (filled: hired).
        scrawl(ctx, row.name, tx, y0 + h * 0.28, h * 0.24);
        if (row.note) {
          ctx.font = hand(h * 0.24, 700);
          const nw = ctx.measureText(row.name).width;
          scrawl(ctx, row.note, tx + nw + h * 0.12, y0 + h * 0.29, h * 0.17, { color: SKETCH.soft, weight: 400 });
        } else if (row.most > 1) {
          ctx.font = hand(h * 0.24, 700);
          const nw = ctx.measureText(row.name).width;
          for (let q = 0; q < row.most; q++) rc.circle(tx + nw + h * 0.14 + q * h * 0.15, y0 + h * 0.27, h * 0.1, line(340 + i * 5 + q, lw * 0.8, { fill: q < row.hired ? SKETCH.moss : SKETCH.paper, fillStyle: 'solid' }));
        }
        // All hired: said where the button would be.
        if (row.price === null) scrawl(ctx, row.done ?? (row.kind === 'table' ? 'All open' : row.most > 1 ? `All ${row.most} hired` : 'Hired'), tx + tw / 2, by + bh / 2 + h * 0.02, h * 0.2, { color: row.done ? SKETCH.soft : SKETCH.moss, align: 'center' });
      });
    }, buttons);
  }

  /** The word (HIRE, OPEN) and the price: moss when the bank can pay (a deeper moss when aimed at), pale when it cannot. */
  private hireButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, bh: number, word: string, price: number, live: boolean, hover: boolean, seed: number): void {
    const rc = pen(this.panel.canvas);
    const lw = Math.max(2, bh * 0.043);
    rc.rectangle(x, y, w, bh, line(seed, lw, { fill: live ? (hover ? SKETCH.mossDeep : SKETCH.moss) : SKETCH.paper, fillStyle: 'solid', stroke: live ? SKETCH.mossDeep : '#b6a993', roughness: 1.1 }));
    const ink = live ? '#f2ebdd' : '#9c8f78';
    const size = bh * 0.5;
    ctx.font = hand(size, 700);
    const ww = ctx.measureText(word).width;
    const pw = ctx.measureText(`${price}`).width;
    const cd = size * 0.95;
    let lx = x + (w - (ww + size * 0.5 + cd + size * 0.25 + pw)) / 2;
    const cy = y + bh / 2;
    scrawl(ctx, word, lx, cy + size * 0.06, size, { color: ink });
    lx += ww + size * 0.5;
    if (live) sketchCoin(rc, lx + cd / 2, cy, cd, seed + 3, lw * 0.8);
    else rc.circle(lx + cd / 2, cy, cd, line(seed + 4, lw * 0.8, { stroke: '#9c8f78' }));
    lx += cd + size * 0.25;
    scrawl(ctx, `${price}`, lx, cy + size * 0.06, size, { color: ink });
  }
}
