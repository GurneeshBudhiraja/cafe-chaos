/**
 * How to play: the steps, in order. The web page (index.html, src/landing.ts)
 * and the card in the headset (ui/start-menu.ts) are both built from this
 * list, so a step is added, removed or reordered here and nowhere else.
 *
 * A step is a title, one or two short sentences (ASD-STE100 style: one
 * action a sentence), a video of the move and a still picture:
 * - `video`: a short, silent, looping clip, 16:9 (public/howto/*.mp4,
 *   H.264, about 640 x 360). Made from the game itself by
 *   `npm run record:howto` (scripts/record-howto.mjs); to replace one, drop
 *   a new file in under the same name.
 * - `poster`: a still picture, 16:9 or wider, shown until the video plays,
 *   in place of it for players who ask for less motion, and on its own when
 *   a step has no video. (The first-run coach card uses the stills too.)
 * Paths are relative to the site's root (public/).
 */

export interface HowToStep {
  /** A short name for the step (the video and the checks use it). */
  id: string;
  title: string;
  text: string;
  /** The looping clip (optional). */
  video?: string;
  /** The still picture (required). */
  poster: string;
}

export const HOW_TO_PLAY: readonly HowToStep[] = [
  {
    id: 'start',
    title: 'Before you start',
    text: 'Sit at a table. The café stands on the table. Put down your controllers. Use only your hands.',
    poster: 'ui/cover.jpg',
  },
  {
    id: 'pinch',
    title: 'Pinch a guest',
    text: 'Put your fingers above a guest at the gate. When the guest glows, pinch.',
    video: 'howto/pinch.mp4',
    poster: 'ui/howto-pinch.jpg',
  },
  {
    id: 'seat',
    title: 'Seat the guest',
    text: 'Move the guest above the café. Open your fingers. The guest goes to the seat that glows.',
    video: 'howto/seat.mp4',
    poster: 'ui/howto-seat.jpg',
  },
  {
    id: 'happy',
    title: 'Keep guests happy',
    text: 'Seat guests quickly. Give them the seats they wish for: they pay more. Serve enough guests to finish the level.',
    video: 'howto/happy.mp4',
    poster: 'ui/howto-happy.jpg',
  },
  {
    id: 'bar',
    title: 'Pause and shop',
    text: 'Point your hand at the bar and pinch. Pause is at the left end. Shop is at the right end.',
    video: 'howto/bar.mp4',
    poster: 'ui/howto-pause.jpg',
  },
  {
    id: 'tables',
    title: 'Open more tables',
    text: 'Point your hand at a padlock and pinch. Pinch BUY. More tables seat more guests.',
    video: 'howto/tables.mp4',
    poster: 'ui/howto-tables.jpg',
  },
  {
    id: 'clean',
    title: 'Dirty tables',
    text: 'Guests leave a mess. Nobody sits at a dirty table. Your baristas clean it. A janitor from the Shop cleans faster.',
    video: 'howto/clean.mp4',
    poster: 'ui/howto-clean.jpg',
  },
  {
    id: 'guests',
    title: 'Special guests',
    text: 'An hourglass: the guest is in a hurry. Seat it soon: it pays more. Hearts: two friends. Seat them at one table.',
    poster: 'ui/howto-guests.jpg',
  },
];
