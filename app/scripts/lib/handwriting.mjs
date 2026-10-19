/**
 * Handwriting generator for demo recordings.
 *
 * Converts text into pen strokes in page coordinates (u, v in 0..1, v down)
 * using the Hershey "scripts" font: a public-domain single-stroke cursive
 * face made for pen plotters (data from the MIT-licensed `hersheytext`
 * package). Single-stroke glyphs are pen paths, not outlines, so they can
 * be "written" with the pointer like real handwriting.
 *
 * Human touches: per-word size and baseline drift, per-point wobble, and
 * joined strokes inside a word (the pen stays down between letters when the
 * next letter starts where the last one ended).
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FONTS = require('hersheytext/hersheytext.json');

/** Hershey glyphs use y-down units with the baseline near y = 22. */
const BASELINE = 22;
const SPACE_WIDTH = 9;
/** Page height is 3/4 of its width (PAGE_ASPECT 4:3 in note-model.ts). */
const V_PER_U = 4 / 3;

/** Small deterministic random generator (mulberry32), so takes repeat. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glyph(fontName, char) {
  const font = FONTS[fontName];
  const data = font.chars[char.charCodeAt(0) - 33];
  if (!data) return null;
  const paths = data.d
    .split('M')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace('L', ' ')
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number)),
    );
  return { paths, width: Number(data.o) };
}

const ADVANCE_SCALE = 1.68; // hersheytext JSON fonts store half-ish widths.
const JOIN_DISTANCE = 2.2; // glyph units: closer than this keeps the pen down.

/**
 * Lay out one line of text. Returns strokes (arrays of [u, v] points) in the
 * order a person would write them, plus the line's right edge in u.
 *
 * @param {string} text
 * @param {{u: number, v: number, size: number, seed?: number, font?: string,
 *          wobble?: number, drift?: number}} options
 *   u, v: left end of the baseline; size: page-width units per glyph unit.
 */
export function layoutLine(text, options) {
  const { u, v, size, seed = 1, font = 'scripts', wobble = 0.22, drift = 0.6 } = options;
  const rand = seededRandom(seed);
  const strokes = [];
  let penX = 0;
  let wordScale = 1;
  let wordLift = 0;
  let previousEnd = null;

  for (const char of text) {
    if (char === ' ') {
      penX += SPACE_WIDTH * (0.9 + rand() * 0.3);
      previousEnd = null; // New word: lift the pen.
      wordScale = 0.96 + rand() * 0.08;
      wordLift = (rand() - 0.5) * drift;
      continue;
    }
    const g = glyph(font, char);
    if (!g) continue;
    for (const path of g.paths) {
      const points = path.map(([gx, gy]) => {
        const x = penX + gx * wordScale + (rand() - 0.5) * wobble;
        const y = (gy - BASELINE) * wordScale + wordLift + (rand() - 0.5) * wobble;
        return [u + x * size, v + y * size * V_PER_U];
      });
      const first = path[0];
      const startX = penX + first[0] * wordScale;
      const startY = (first[1] - BASELINE) * wordScale + wordLift;
      const joins =
        previousEnd && Math.hypot(startX - previousEnd[0], startY - previousEnd[1]) < JOIN_DISTANCE;
      if (joins) strokes[strokes.length - 1].push(...points.slice(1));
      else strokes.push(points);
      const last = path[path.length - 1];
      previousEnd = [penX + last[0] * wordScale, (last[1] - BASELINE) * wordScale + wordLift];
    }
    penX += g.width * ADVANCE_SCALE * wordScale;
  }
  return { strokes, right: u + penX * size };
}

/**
 * Resample a stroke so consecutive points are about `step` page units apart,
 * which is how densely a real pointer reports positions while writing.
 */
export function densify(stroke, step = 0.004) {
  const out = [stroke[0]];
  for (let i = 1; i < stroke.length; i++) {
    const [ax, ay] = stroke[i - 1];
    const [bx, by] = stroke[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, (by - ay) / V_PER_U) / step));
    for (let s = 1; s <= n; s++) out.push([ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n]);
  }
  return out;
}
