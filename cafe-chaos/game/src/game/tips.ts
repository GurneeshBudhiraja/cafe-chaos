/**
 * The tips: a few words the first time each new thing turns up (Meta's
 * hands onboarding: teach only when relevant, one thing at a time, next
 * to the thing; the café is simple enough that tips as things happen
 * suit it better than a long first lesson, Andersen et al. CHI 2012).
 * Each shows once per save (Save.tips), one at a time, next to what it is
 * about, and goes when the player has done it or after `seconds`.
 *
 * - goal: the start of level 1: what a level asks (the bar's "0/5 served"
 *   says the count, not that it ends the level). Level 1 only: from then
 *   on the level card names the next target.
 * - table: the bank can pay for a table: open one (point at a padlock and
 *   pinch). Ray and pinch is the move players most often fail untaught
 *   (Meta), so it stays up until a table is bought, or `seconds`.
 * - shop: the bank can pay for another barista: the Shop on the bar.
 * - dirty: the first dirty table: the staff clean it.
 * - hurry: the first guest in a hurry: seat it soon (its own clock waits
 *   while the tip is up, so reading costs nothing).
 * - pair: the first two friends: one table for both.
 */

export type TipId = 'goal' | 'table' | 'shop' | 'dirty' | 'hurry' | 'pair';

export interface TipText {
  title: string;
  text: string;
  /** How long it stays at most (seconds). */
  seconds: number;
}

export const TIPS: Record<TipId, TipText> = {
  // `{n}` is the level's goal (game/rules.ts levelGoal).
  goal: { title: 'Serve {n} guests', text: 'That finishes the level.', seconds: 8 },
  table: { title: 'Open a table', text: 'Point at a padlock and pinch.', seconds: 25 },
  shop: { title: 'More hands', text: 'Shop: hire a barista.', seconds: 9 },
  dirty: { title: 'Dirty table', text: 'Your staff will clean it.', seconds: 8 },
  hurry: { title: 'In a hurry!', text: 'Seat it soon. It pays more.', seconds: 8 },
  pair: { title: 'Two friends', text: 'Seat them at one table.', seconds: 10 },
};

/** The order tips are offered in when more than one is due (the one players act on first). */
export const TIP_ORDER: TipId[] = ['goal', 'hurry', 'pair', 'table', 'dirty', 'shop'];

/** Seconds between one tip going and the next appearing. */
export const TIP_GAP = 2;

/** Each tip's little picture, drawn at (x, y), radius r. */
export function tipIcon(id: TipId): (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void {
  return (ctx, x, y, r) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = '#2a1d14';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = id === 'hurry' ? '#2a1d14' : id === 'dirty' ? '#c98a1e' : '#3d6136';
    ctx.fill();
    ctx.fillStyle = '#f4ecdc';
    ctx.strokeStyle = '#f4ecdc';
    switch (id) {
      case 'goal': {
        // A flag on a pole.
        ctx.beginPath();
        ctx.moveTo(x - r * 0.3, y + r * 0.6);
        ctx.lineTo(x - r * 0.3, y - r * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - r * 0.3, y - r * 0.6);
        ctx.lineTo(x + r * 0.5, y - r * 0.35);
        ctx.lineTo(x - r * 0.3, y - r * 0.05);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'table': {
        // A padlock, open.
        ctx.fillRect(x - r * 0.42, y - r * 0.05, r * 0.84, r * 0.6);
        ctx.beginPath();
        ctx.arc(x + r * 0.3, y - r * 0.05, r * 0.3, Math.PI, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'shop': {
        // A coin.
        ctx.beginPath();
        ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `800 ${r * 0.7}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', x, y + r * 0.04);
        break;
      }
      case 'dirty': {
        // A dish with a smudge.
        ctx.beginPath();
        ctx.ellipse(x, y + r * 0.15, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a5a3a';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.1, y + r * 0.12, r * 0.25, r * 0.12, 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'hurry': {
        // An hourglass.
        ctx.beginPath();
        ctx.moveTo(x - r * 0.42, y - r * 0.55);
        ctx.lineTo(x + r * 0.42, y - r * 0.55);
        ctx.lineTo(x, y);
        ctx.lineTo(x + r * 0.42, y + r * 0.55);
        ctx.lineTo(x - r * 0.42, y + r * 0.55);
        ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'pair': {
        // Two heads and a small heart.
        for (const dx of [-0.32, 0.32]) {
          ctx.beginPath();
          ctx.arc(x + dx * r, y + r * 0.1, r * 0.26, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#e8a33a';
        ctx.beginPath();
        ctx.arc(x - r * 0.08, y - r * 0.42, r * 0.11, 0, Math.PI * 2);
        ctx.arc(x + r * 0.08, y - r * 0.42, r * 0.11, 0, Math.PI * 2);
        ctx.moveTo(x - r * 0.19, y - r * 0.38);
        ctx.lineTo(x, y - r * 0.2);
        ctx.lineTo(x + r * 0.19, y - r * 0.38);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  };
}
