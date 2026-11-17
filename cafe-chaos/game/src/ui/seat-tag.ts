/**
 * Why a carried guest will not sit there: a small paper tag over the seat
 * the guest is held over, while it is held there, with a picture and a few
 * words ("Dirty", staff will clean it; "Locked", what it costs to open;
 * "Taken"). The seat's amber or red glow stays; the tag says what the
 * colour means, so colour is never the only signal.
 *
 * The guidance it follows: show whether a destination can take what is
 * dragged, and only while it is over it (Apple HIG, drag and drop); clear
 * feedback and signifiers for every hand interaction, paired with sound
 * (Meta, hands design; the sound is GuestSystem's `refusedSeats`, played at
 * the seat by SoundSystem); feedback at the object acted on (Meta, Microsoft
 * mixed reality). A guest let go there goes back to its place in the line
 * and the tag stays `linger` seconds more, so the reason can be read.
 *
 * It is a TipCard (the tips' paper and pen), drawn over the café, its size
 * real metres, standing `above` the seat.
 */

import { TipCard } from './tip-card.js';

export type SeatRefusal = 'dirty' | 'locked' | 'taken';

/** How high over the seat it stands (metres), and how long it stays after a refused let-go (seconds). */
export const SEAT_TAG = { above: 0.075, linger: 1.5 };

type Icon = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void;

const INK = '#2a1d14';
const PAPER = '#f4ecdc';

/** A round badge of `fill` with a picture drawn in paper on it. */
function badge(fill: string, draw: (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void): Icon {
  return (ctx, x, y, r) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = PAPER;
    draw(ctx, x, y, r);
    ctx.restore();
  };
}

const ICONS: Record<SeatRefusal, Icon> = {
  // A dish with a smudge, as on the "Dirty table" tip.
  dirty: badge('#c98a1e', (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.15, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a5a3a';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.1, y + r * 0.12, r * 0.25, r * 0.12, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }),
  // A padlock, shut.
  locked: badge(INK, (ctx, x, y, r) => {
    ctx.fillRect(x - r * 0.42, y - r * 0.05, r * 0.84, r * 0.6);
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.05, r * 0.3, Math.PI, Math.PI * 2);
    ctx.stroke();
  }),
  // Someone already sitting: a head and shoulders.
  taken: badge('#9a3b2a', (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.arc(x, y - r * 0.22, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.42, r * 0.44, r * 0.3, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }),
};

export class SeatTag {
  readonly card = new TipCard();

  constructor() {
    // Over the café, the seat glow and the guests' dials (30, 31 lit): while it is up it is what matters; under the
    // carried guest's own wish card (34).
    this.card.panel.mesh.renderOrder = 32;
    this.card.panel.mesh.name = 'SeatTag';
  }

  /** Say why: `detail` is the second line (the game supplies the price of a locked table). */
  show(why: SeatRefusal, detail: string): void {
    const title = why === 'dirty' ? 'Dirty' : why === 'locked' ? 'Locked' : 'Taken';
    this.card.show(title, detail, ICONS[why]);
  }

  hide(): void {
    this.card.hide();
  }
}
