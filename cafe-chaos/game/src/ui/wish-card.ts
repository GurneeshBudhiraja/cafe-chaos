/**
 * The request card: who a guest is and what it wishes for, shown beside
 * the hand while a hand is near the guest or carries it. It is drawn like
 * the start card and the menus (ui/start-menu.ts): a timber frame round
 * shoji paper; the guest's name in cream capitals on a dark band; each
 * wish its own outlined row; and its patience as a segmented bar, like
 * Settings' bars, with the seconds left beside it, in moss, then amber,
 * then koi red for the last quarter.
 *
 *   ┌──────────────────────────┐
 *   │ ▌PIP                    ▐│
 *   │ [1  By the counter     ] │
 *   │ [2  Some company       ] │
 *   │ ▮▮▮▮▯▯▯▯          13s   │
 *   └──────────────────────────┘
 *
 * While a guest is carried over a seat, each row says whether that seat
 * meets that wish: a pale moss row with a tick, or a koi outline with a
 * cross. (Once it sits down, its seat is final: guests/wishes.ts.)
 *
 * The card stands to the side of the guest away from the hand (to the
 * left of a right hand, to the right of a left one, as the player sees
 * it) and a little above, turned to the player, so the hand never covers
 * it; near the hand, it stays in view on a narrow headset too (Meta VR
 * Glasses). One card per hand. It is a Panel (ui/panel.ts): real size, so
 * its words stay readable however small the café is made (its row text
 * is about 10 mm tall).
 */

import { Vector3, type Object3D } from '@iwsdk/core';
import { WISH_SHORT, type WishId } from '../guests/wishes.js';
import { Panel } from './panel.js';
import { hand, pen } from './sketch.js';

/** The card's size (real metres: room for three wishes), and where it stands from the guest's head: this far to the side and above. */
export const WISH_CARD = { width: 0.15, height: 0.125, side: 0.115, above: 0.045 };
/** Design units across (the drawing is scaled to the card). */
const W = 330;
const C = { paper: '#d9cfbe', paperHi: '#e4d9c6', timber: '#66462f', band: '#2a2420', ink: '#16171d', soft: '#5a4030', moss: '#3d6136', mossDeep: '#2f522d', mossPale: '#cfe0c8', koi: '#9a2208', amber: '#c98a1e', amberDeep: '#8a5c10', koiDeep: '#6e1806', empty: '#cfc3ae', emptyLine: '#b6a993', cream: '#f2ebdd' };
/** The bar's segments. */
const SEGMENTS = 8;

/** What the card says about a guest. */
export interface CardSubject {
  id: number;
  name: string;
  wishes: WishId[];
  sings: boolean;
  /** In a hurry (the card says so), and the friend it came with (a pair), if any. */
  hurried?: boolean;
  friend?: string | null;
  /** Its patience: the share left (0 to 1) and the seconds left. */
  left: number;
  seconds: number;
  /** Carried over a seat: whether that seat meets each wish; null otherwise. */
  preview: boolean[] | null;
}

export class WishCards {
  readonly cards = [new Panel('WishCard-right', WISH_CARD.width, WISH_CARD.height), new Panel('WishCard-left', WISH_CARD.width, WISH_CARD.height)];
  /** What each card last showed, so it is drawn again only when that changes. */
  private readonly shown = ['', ''];
  private readonly toHead = new Vector3();
  private readonly right = new Vector3();
  private readonly spot = new Vector3();

  constructor(parent: Object3D) {
    for (const card of this.cards) {
      card.frame = false;
      card.mesh.renderOrder = 34;
      // Over everything: a post or a roof between the eyes and the guest never hides who it is.
      (card.mesh.material as { depthTest: boolean }).depthTest = false;
      parent.add(card.mesh);
    }
  }

  /**
   * Each frame, for hand `i` (0 right, 1 left): the guest its card is
   * about (null: none), where that guest's head is (the parent's space),
   * the player's head (world, and in the parent's space), and the
   * parent's scale.
   */
  update(i: number, subject: CardSubject | null, at: Vector3 | null, headWorld: Vector3, headLocal: Vector3, scale: number, delta: number): void {
    const card = this.cards[i];
    if (subject && at) {
      const steps = Math.ceil(subject.left * SEGMENTS * 4);
      const key = `${subject.id}|${subject.wishes.join()}|${subject.sings}|${subject.hurried ?? ''}|${subject.friend ?? ''}|${Math.max(0, Math.ceil(subject.seconds))}|${steps}|${subject.preview?.join() ?? ''}`;
      if (key !== this.shown[i]) {
        this.shown[i] = key;
        card.set((ctx, w, h) => draw(ctx, w, h, card.canvas, subject));
      }
      // To the side away from the hand, as the player sees it, and a little above.
      this.toHead.copy(headLocal).sub(at).setY(0);
      this.right.set(this.toHead.z, 0, -this.toHead.x).normalize();
      const side = (i === 0 ? -1 : 1) * (WISH_CARD.side / scale);
      this.spot.copy(at).addScaledVector(this.right, side);
      this.spot.y += WISH_CARD.above / scale;
      card.mesh.position.copy(this.spot);
    }
    card.show(!!subject && !!at);
    card.update(delta, headWorld);
  }
}

/** Text in the café's lettering, in design units. */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, colour: string, align: CanvasTextAlign = 'left', heavy = true): void {
  ctx.font = hand(size, heavy ? 700 : 400);
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/**
 * The card, drawn from the bottom of the panel up (a guest with fewer
 * wishes has a shorter card, standing on the same spot).
 */
function draw(ctx: CanvasRenderingContext2D, w: number, h: number, canvas: HTMLCanvasElement, g: CardSubject): void {
  const k = w / W;
  const H = h / k;
  const rc = pen(canvas);
  const o = (seed: number, more: Record<string, unknown> = {}) => ({ seed, roughness: 1.1, bowing: 0.9, strokeWidth: 2.6, stroke: C.ink, ...more });
  const frame = 9;
  const pad = 14;
  const bandH = 50;
  const rowH = 44;
  const rowGap = 8;
  const segH = 22;
  const rows = Math.max(1, g.wishes.length);
  const cardH = frame + bandH + pad + rows * (rowH + rowGap) - rowGap + pad + segH + pad + frame;
  const top = Math.max(0, H - cardH);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.scale(k, k);
  // The frame and the paper.
  ctx.fillStyle = C.timber;
  ctx.fillRect(0, top, W, cardH);
  rc.rectangle(frame, top + frame, W - frame * 2, cardH - frame * 2, o(3, { fill: C.paper, fillStyle: 'solid', stroke: C.timber, strokeWidth: 2.5 }));
  // The band: the name in cream capitals (a singer has a note after its name).
  const bx = frame + 6;
  const by = top + frame + 6;
  const bw = W - (frame + 6) * 2;
  const bh = bandH - 6;
  ctx.fillStyle = C.band;
  ctx.fillRect(bx, by, bw, bh);
  rc.rectangle(bx, by, bw, bh, o(5, { strokeWidth: 2.4 }));
  text(ctx, `${g.name.toUpperCase()}${g.sings ? '  ♪' : ''}`, bx + 14, by + bh / 2 + 1, 26, C.cream);
  if (g.hurried) {
    // An hourglass drawn (the hand font has no glyph for it), then the words.
    text(ctx, 'IN A HURRY', bx + bw - 14, by + bh / 2 + 1, 20, C.cream, 'right');
    ctx.font = hand(20, 700);
    const hx = bx + bw - 14 - ctx.measureText('IN A HURRY').width - 16;
    const hy = by + bh / 2;
    ctx.fillStyle = C.cream;
    ctx.beginPath();
    ctx.moveTo(hx - 7, hy - 10);
    ctx.lineTo(hx + 7, hy - 10);
    ctx.lineTo(hx, hy);
    ctx.lineTo(hx + 7, hy + 10);
    ctx.lineTo(hx - 7, hy + 10);
    ctx.lineTo(hx, hy);
    ctx.closePath();
    ctx.fill();
  }
  // The wishes, a row each.
  let y = top + frame + bandH + pad;
  if (g.wishes.length === 0) {
    // No wishes: one quiet row.
    rc.rectangle(frame + pad, y, W - (frame + pad) * 2, rowH, o(10, { fill: C.paperHi, fillStyle: 'solid', stroke: C.emptyLine }));
    text(ctx, 'Happy anywhere', frame + pad + 18, y + rowH / 2 + 1, 24, C.soft);
    y += rowH + rowGap;
  }
  g.wishes.forEach((wish, i) => {
    const met = g.preview ? g.preview[i] : undefined;
    const x = frame + pad;
    const rw = W - (frame + pad) * 2;
    const fill = met === true ? C.mossPale : C.paperHi;
    const line = met === true ? C.mossDeep : met === false ? C.koi : C.ink;
    rc.rectangle(x, y, rw, rowH, o(10 + i, { fill, fillStyle: 'solid', stroke: line }));
    const mark = met === true ? '✓' : met === false ? '✕' : `${i + 1}`;
    const ink = met === true ? C.mossDeep : met === false ? C.koi : C.ink;
    text(ctx, mark, x + 22, y + rowH / 2 + 1, 23, met === undefined ? C.soft : ink, 'center');
    text(ctx, wish === 'friend' && g.friend ? `With ${g.friend}` : WISH_SHORT[wish], x + 44, y + rowH / 2 + 1, 24, ink);
    y += rowH + rowGap;
  });
  y += pad - rowGap;
  // The patience: segments emptying from the right, and the seconds left beside them.
  const left = Math.max(0, Math.min(1, g.left));
  const fill = left <= 0.25 ? C.koi : left <= 0.5 ? C.amber : C.moss;
  const deep = left <= 0.25 ? C.koiDeep : left <= 0.5 ? C.amberDeep : C.mossDeep;
  const timeW = 66;
  const sg = 5;
  const sx0 = frame + pad;
  const sw = (W - (frame + pad) * 2 - timeW - sg * (SEGMENTS - 1)) / SEGMENTS;
  const lit = left * SEGMENTS;
  for (let i = 0; i < SEGMENTS; i++) {
    const part = Math.max(0, Math.min(1, lit - i));
    const sx = sx0 + i * (sw + sg);
    rc.rectangle(sx, y, sw, segH, o(30 + i, { fill: C.empty, fillStyle: 'solid', stroke: C.emptyLine, strokeWidth: 2, roughness: 0.8 }));
    if (part > 0.02) rc.rectangle(sx, y, sw * part, segH, o(40 + i, { fill, fillStyle: 'solid', stroke: deep, strokeWidth: 2, roughness: 0.8 }));
  }
  text(ctx, `${Math.max(0, Math.ceil(g.seconds))}s`, W - frame - pad, y + segH / 2 + 1, 28, left <= 0.25 ? C.koi : left <= 0.5 ? C.amberDeep : C.mossDeep, 'right');
  ctx.restore();
}
