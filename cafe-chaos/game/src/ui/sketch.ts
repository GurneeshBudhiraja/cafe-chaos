/**
 * The sketch-pen look: drawing helpers for UI drawn as if with a marker on
 * toned paper. Lines are hand-drawn (rough.js) but still: every shape has
 * its own fixed seed, so it is drawn the same way every time and never
 * wobbles. Only what changes is redrawn.
 *
 * The handwriting is Kalam (SIL Open Font License, public/fonts/OFL.txt),
 * shipped with the game so it works with no network. `sketchFontReady`
 * resolves once it has loaded; panels drawn before that are drawn again.
 *
 * Colours: navy ink on toned paper (darker than plain white, as Meta
 * suggests for light panels in passthrough), one sun-red for things to
 * press, and calm / warn / danger for happiness. Navy on the paper is
 * about 11:1; the soft ink for labels about 6:1.
 */

import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';

export const SKETCH = {
  paper: '#ddcdbb',
  paperDeep: '#d1bfaa',
  ink: '#1c2036',
  soft: '#4a4160',
  red: '#c9382a',
  redInk: '#7a1e14',
  gold: '#e2a83a',
  goldInk: '#7a5410',
  calm: '#3f7f6a',
  warn: '#c98a1e',
  danger: '#c9382a',
  empty: '#c4b29e',
};

/** The handwriting font's family name. */
export const HAND_FONT = 'CafeKalam';

/** Resolves once the handwriting has loaded (or failed: then a fallback face is used). */
export const sketchFontReady: Promise<void> = (async () => {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  const base = import.meta.env.BASE_URL;
  try {
    const faces = [new FontFace(HAND_FONT, `url(${base}fonts/kalam-400.woff2)`, { weight: '400' }), new FontFace(HAND_FONT, `url(${base}fonts/kalam-700.woff2)`, { weight: '700' })];
    for (const face of await Promise.all(faces.map((f) => f.load()))) document.fonts.add(face);
  } catch {
    // No font: the fallback in `hand()` is used.
  }
})();

/** A font string for canvas text in the handwriting. */
export function hand(size: number, weight: 400 | 700 = 700): string {
  return `${weight} ${Math.round(size)}px ${HAND_FONT}, 'Comic Sans MS', cursive`;
}

/** The marker for a canvas. */
export function pen(canvas: HTMLCanvasElement): RoughCanvas {
  return rough.canvas(canvas);
}

/** Options for a still, hand-drawn stroke: `seed` fixes its shape. */
export function line(seed: number, width: number, more: Options = {}): Options {
  return { seed, roughness: 1.1, bowing: 0.8, stroke: SKETCH.ink, strokeWidth: width, ...more };
}

/** Text in the handwriting. */
export function scrawl(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, options: { color?: string; weight?: 400 | 700; align?: CanvasTextAlign } = {}): void {
  ctx.font = hand(size, options.weight ?? 700);
  ctx.fillStyle = options.color ?? SKETCH.ink;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** A doodled coin, `d` across. */
export function sketchCoin(rc: RoughCanvas, x: number, y: number, d: number, seed: number, width: number): void {
  rc.circle(x, y, d, line(seed, width, { fill: SKETCH.gold, fillStyle: 'solid', stroke: SKETCH.goldInk }));
  rc.circle(x, y, d * 0.58, line(seed + 1, width * 0.6, { stroke: SKETCH.goldInk }));
}

/** A doodled face: smiling, flat or frowning by `mood` (0 to 1), in the happiness colour. */
export function sketchFace(rc: RoughCanvas, x: number, y: number, d: number, mood: number, seed: number, width: number): void {
  rc.circle(x, y, d, line(seed, width, { fill: moodInk(mood), fillStyle: 'solid' }));
  for (const side of [-1, 1]) rc.circle(x + side * d * 0.17, y - d * 0.1, d * 0.09, line(seed + 2 + side, width * 0.5, { fill: SKETCH.ink, fillStyle: 'solid' }));
  const m = mood > 0.6 ? 0.14 : mood > 0.3 ? 0 : -0.12;
  rc.curve([[x - d * 0.2, y + d * 0.15], [x, y + d * (0.15 + m)], [x + d * 0.2, y + d * 0.15]], line(seed + 5, width * 0.9));
}

/** The happiness colour: calm above 60 %, warn to 30 %, danger below. */
export function moodInk(mood: number): string {
  return mood > 0.6 ? SKETCH.calm : mood > 0.3 ? SKETCH.warn : SKETCH.danger;
}
