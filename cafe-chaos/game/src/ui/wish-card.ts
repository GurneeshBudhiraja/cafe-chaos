/**
 * The wish card: who this guest is and what it wants, in a few words,
 * shown beside the hand while a guest is lit under it or carried by it.
 *
 *   [picture]  Miso
 *              wants a window seat
 *
 * A guest with no wish is "happy anywhere"; a singer says so. The card
 * stands to the side of the guest away from the hand (to the left of a
 * right hand, to the right of a left one, as the player sees it) and a
 * little above, so the hand never covers it, and it turns to face the
 * player. One card per hand. It is a Panel (ui/panel.ts): real size, so
 * its words stay readable however small the café is made.
 */

import { Vector3, type Object3D } from '@iwsdk/core';
import { drawWish, type WishPicture } from '../guests/wish-art.js';
import { WISHES, type WishId } from '../guests/wishes.js';
import { INK, Panel, write } from './panel.js';

/** The card's size (real metres), and where it stands from the guest's head: this far to the side and above (real metres). */
export const WISH_CARD = { width: 0.118, height: 0.046, side: 0.085, above: 0.03 };
const MM = 2.4;

/** What the card says about a guest. */
export interface CardSubject {
  id: number;
  name: string;
  wish: WishId | null;
  sings: boolean;
  /** Seated with its wish judged: granted (true), not (false); null before that or with no wish. */
  met: boolean | null;
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
      const key = `${subject.id}|${subject.wish}|${subject.sings}|${subject.met}`;
      if (key !== this.shown[i]) {
        this.shown[i] = key;
        card.set((ctx, w, h) => draw(ctx, w, h, subject));
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

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, g: CardSubject): void {
  const picture: WishPicture | null = g.sings ? 'singer' : g.wish;
  const r = h * 0.3;
  const cx = h * 0.5;
  let x = h * 0.2;
  if (picture) {
    ctx.beginPath();
    ctx.arc(cx, h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = g.met === true ? '#c8f3da' : '#fffaf0';
    ctx.fill();
    ctx.lineWidth = 0.8 * MM;
    ctx.strokeStyle = g.met === true ? '#2f8f5b' : '#c9a77d';
    ctx.stroke();
    drawWish(ctx, picture, cx, h / 2, r * 1.35);
    x = cx + r + 3.5 * MM;
  }
  write(ctx, g.name, x, h * 0.36, 8 * MM, { weight: 800, align: 'left', font: 'Georgia, serif' });
  const line = g.sings ? 'sings! wants company' : g.wish ? `wants ${WISHES[g.wish].wants}` : 'happy anywhere';
  // Shrink the line to fit the card if it is a long one.
  let size = 5.4 * MM;
  ctx.font = `700 ${Math.round(size)}px sans-serif`;
  const room = w - x - 4 * MM;
  const width = ctx.measureText(line).width;
  if (width > room) size *= room / width;
  write(ctx, line, x, h * 0.68, size, { weight: 700, align: 'left', color: g.met === true ? '#2f8f5b' : INK.inkSoft });
}
