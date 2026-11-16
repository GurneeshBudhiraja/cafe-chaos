/**
 * Reactions: a small speech bubble over each seated guest saying how it
 * feels, so a full café can be read at a glance (the owner's reference: a
 * heart, a thumbs up, a frown over the diners; a red scribble on one
 * storming out). Drawn in the café's pen and paper, its own pictures.
 *
 * What shows, by moment:
 * - its food just come: "!" (a moment);
 * - eating: how it feels, by what it is about to pay (the same sum as the
 *   pay: how soon it was seated, how many wishes its seat met), so the
 *   "+7" it leaves reads as earned: a heart (loving it), a thumbs up
 *   (happy), a level mouth (all right), a frown (not happy);
 * - a singer: notes;
 * - storming out: a red scribble, a thumbs down and a cross face in turn
 *   (two a second, under the 3 a second flash limit; no flicker).
 * While it waits for its food its dot (the timer) shows instead.
 *
 * Each feeling has three hand-drawn versions (the same shape, the line
 * a little different), chosen by the guest, so a room of hearts is not a
 * stamp. Good feelings are drawn in moss and gold, bad ones in koi, and
 * every one has its own shape, so colour is never the only cue.
 *
 * From the research (Meta, Microsoft, Apple; docs/MECHANICS-PLAN.md §9):
 * about 3 cm across (2 degrees at 0.8 m; not something to aim at, so under
 * the 3 degree target); turned to the eyes with no roll; still between
 * changes (no bobbing), a 0.3 s pop when one changes, never more than
 * four popping at once, none at all if the system asks for less motion.
 * Every bubble is one instance of one mesh with one picture sheet: one
 * draw call for the whole room. Opaque paper, cut-out edge: the nearer
 * bubble is simply drawn in front.
 */

import { CanvasTexture, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3, Euler } from '@iwsdk/core';

/** The feelings and moments, each a set of cells on the picture sheet. */
export type Feeling = 'loving' | 'happy' | 'okay' | 'unhappy' | 'singing' | 'served' | 'storming';

/** Size (metres across, café space), how far above the head anchor, and seat-mates' height step. */
export const BUBBLE = { size: 0.032, above: 0.024, step: 0.009, pop: 0.3, overshoot: 0.18, maxPopping: 4, servedFor: 1.2, stormHz: 2 };

const COLS = 8;
const ROWS = 4;
const CELL = 128;
/** Where each feeling's versions are on the sheet (cell indices). */
const CELLS: Record<Feeling, number[]> = {
  loving: [0, 1, 2],
  happy: [3, 4, 5],
  okay: [6, 7, 8],
  unhappy: [9, 10, 11],
  singing: [12],
  served: [13],
  storming: [14, 15, 16],
};
const INK = '#2a1d14';
const PAPER = '#fbf4e6';
const GOOD = '#3d6136';
const GOLD = '#d99a2b';
const BAD = '#b8361a';
const SOFT = '#7a5a40';

/** What the reactions need to know about a guest. */
export interface Reacting {
  id: number;
  /** Where its bubble goes (café space), and its seat's number (seat-mates are set at different heights). */
  at: Vector3;
  seat: number;
  feeling: Feeling | null;
}

interface Shown {
  feeling: Feeling;
  cell: number;
  /** Seconds since it last changed (for the pop). */
  age: number;
  popping: boolean;
}

export class Reactions {
  readonly mesh: InstancedMesh;
  private readonly cells: InstancedBufferAttribute;
  private readonly shown = new Map<number, Shown>();
  private readonly still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'YXZ');
  private readonly s = new Vector3();
  private readonly p = new Vector3();
  private time = 0;
  private readonly seen = new Set<number>();
  /** How many of each feeling have been shown (for the checks). */
  readonly counts: Record<string, number> = {};

  constructor(max = 32) {
    const sheet = drawSheet();
    const material = new MeshBasicMaterial({ map: sheet, alphaTest: 0.5, side: DoubleSide, toneMapped: false });
    // Each instance shows its own cell of the sheet.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec2 cell;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = (uv + cell) / vec2(${COLS}.0, ${ROWS}.0);`);
    };
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, max);
    this.mesh.name = 'Reactions';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    this.mesh.userData.dynamic = true;
    // Nothing points at the bubbles: never tested by a ray.
    this.mesh.raycast = () => {};
    this.cells = new InstancedBufferAttribute(new Float32Array(max * 2), 2);
    this.mesh.geometry.setAttribute('cell', this.cells);
    this.mesh.count = 0;
  }

  /** Lay out this frame's bubbles: `head` is the eyes in café space. */
  update(reacting: readonly Reacting[], head: Vector3, delta: number): void {
    this.time += delta;
    const max = this.cells.count;
    let n = 0;
    let popping = 0;
    for (const shown of this.shown.values()) if (shown.popping) popping++;
    const seen = this.seen;
    seen.clear();
    for (const r of reacting) {
      if (!r.feeling || n >= max) continue;
      seen.add(r.id);
      let shown = this.shown.get(r.id);
      if (!shown || shown.feeling !== r.feeling) {
        const pop = !this.still && popping < BUBBLE.maxPopping;
        if (pop) popping++;
        shown = { feeling: r.feeling, cell: 0, age: 0, popping: pop };
        this.shown.set(r.id, shown);
        this.counts[r.feeling] = (this.counts[r.feeling] ?? 0) + 1;
      }
      shown.age += delta;
      if (shown.popping && shown.age >= BUBBLE.pop) shown.popping = false;
      // Its version of the feeling (a storm cycles through its three, two a second).
      const list = CELLS[r.feeling];
      shown.cell = r.feeling === 'storming' ? list[Math.floor(this.time * BUBBLE.stormHz) % list.length] : list[r.id % list.length];
      // A pop: up past full size and back (0.3 s), then still.
      const t = Math.min(1, shown.age / BUBBLE.pop);
      const k = shown.popping ? (t < 0.6 ? (t / 0.6) * (1 + BUBBLE.overshoot) : 1 + BUBBLE.overshoot * (1 - (t - 0.6) / 0.4)) : 1;
      this.p.copy(r.at);
      this.p.y += BUBBLE.above + (r.seat % 2) * BUBBLE.step;
      // Turned to the eyes (yaw and pitch, no roll).
      const dx = head.x - this.p.x;
      const dy = head.y - this.p.y;
      const dz = head.z - this.p.z;
      this.e.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
      this.q.setFromEuler(this.e);
      this.s.set(BUBBLE.size * k, BUBBLE.size * k, 1);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.cells.setXY(n, shown.cell % COLS, ROWS - 1 - Math.floor(shown.cell / COLS));
      n++;
    }
    for (const id of this.shown.keys()) if (!seen.has(id)) this.shown.delete(id);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cells.needsUpdate = true;
  }

  /** What a guest's bubble shows now (for the checks). */
  feelingOf(id: number): Feeling | null {
    return this.shown.get(id)?.feeling ?? null;
  }

  clear(): void {
    this.shown.clear();
    this.mesh.count = 0;
  }
}

/** How a guest eating feels, by what it is about to pay (1 to 10). */
export function feelingFor(pay: number): Feeling {
  return pay >= 9 ? 'loving' : pay >= 6 ? 'happy' : pay >= 4 ? 'okay' : 'unhappy';
}

/** The picture sheet: every bubble, drawn once. */
function drawSheet(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  const ctx = canvas.getContext('2d')!;
  const at = (i: number): [number, number] => [(i % COLS) * CELL, Math.floor(i / COLS) * CELL];
  (Object.keys(CELLS) as Feeling[]).forEach((feeling) => {
    CELLS[feeling].forEach((cell, v) => {
      const [x, y] = at(cell);
      ctx.save();
      ctx.translate(x, y);
      // A gutter round each cell (the drawing a little smaller than the cell), so a far, small bubble never takes a
      // sliver of its neighbour.
      ctx.translate(CELL / 2, CELL / 2);
      ctx.scale(0.86, 0.86);
      ctx.translate(-CELL / 2, -CELL / 2);
      bubble(ctx, v, feeling === 'storming' ? BAD : feeling === 'unhappy' ? BAD : feeling === 'okay' ? SOFT : GOOD);
      ctx.translate(64, 56);
      draw(ctx, feeling, v);
      ctx.restore();
    });
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A small seeded wobble, so each version's line is its own. */
function wob(v: number, k: number): number {
  return Math.sin(v * 12.9898 + k * 78.233) * 1.6;
}

/** The speech bubble: paper with a thick ink rim (its colour by the feeling's family) and a tail to the head. */
function bubble(ctx: CanvasRenderingContext2D, v: number, rim: string): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(26 + wob(v, 1), 14);
  ctx.lineTo(102 + wob(v, 2), 14 + wob(v, 3));
  ctx.quadraticCurveTo(116, 14, 116, 28);
  ctx.lineTo(116 + wob(v, 4), 84);
  ctx.quadraticCurveTo(116, 98, 102, 98);
  ctx.lineTo(74, 98);
  ctx.lineTo(62 + wob(v, 5), 118);
  ctx.lineTo(54, 98);
  ctx.lineTo(26, 98 + wob(v, 6));
  ctx.quadraticCurveTo(12, 98, 12, 84);
  ctx.lineTo(12 + wob(v, 7), 28);
  ctx.quadraticCurveTo(12, 14, 26, 14);
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = rim;
  ctx.stroke();
}

/** The picture in the bubble, centred at the origin (about 70 px across). */
function draw(ctx: CanvasRenderingContext2D, feeling: Feeling, v: number): void {
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  switch (feeling) {
    case 'loving': {
      // A heart (the third version with a small sparkle).
      ctx.fillStyle = BAD;
      ctx.beginPath();
      ctx.moveTo(0, 26 + wob(v, 1));
      ctx.bezierCurveTo(-40, -2, -26, -36 + wob(v, 2), 0, -14);
      ctx.bezierCurveTo(26, -36 + wob(v, 3), 40, -2, 0, 26 + wob(v, 1));
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.stroke();
      if (v === 2) star(ctx, 26, -26, 9);
      if (v === 1) star(ctx, -28, -24, 7);
      break;
    }
    case 'happy':
      thumb(ctx, false, v);
      break;
    case 'okay':
      face(ctx, 'level', v);
      break;
    case 'unhappy':
      face(ctx, 'frown', v);
      break;
    case 'singing':
      note(ctx, -12, 4, 1);
      note(ctx, 16, -8, 0.75);
      break;
    case 'served':
      ctx.fillStyle = GOLD;
      ctx.font = `900 76px 'Trebuchet MS', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeText('!', 0, 4);
      ctx.fillText('!', 0, 4);
      break;
    case 'storming':
      if (v === 0) scribble(ctx);
      else if (v === 1) thumb(ctx, true, v);
      else face(ctx, 'cross', v);
      break;
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.4 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** A thumbs up (gold, filled), or down (koi). */
function thumb(ctx: CanvasRenderingContext2D, down: boolean, v: number): void {
  ctx.save();
  if (down) ctx.rotate(Math.PI);
  ctx.fillStyle = down ? BAD : GOLD;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(-30, -2, 12, 30, 4);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-14, -4 + wob(v, 1) * 0.5, 40, 34, 9);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-10, -32, 15, 32, 7);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** A round face: level mouth (all right), a frown, or crossed eyes and a frown (storming). */
function face(ctx: CanvasRenderingContext2D, kind: 'level' | 'frown' | 'cross', v: number): void {
  ctx.fillStyle = kind === 'level' ? '#ead9b4' : '#f2b4a6';
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.lineWidth = 6;
  if (kind === 'cross') {
    for (const sx of [-12, 12]) {
      ctx.beginPath();
      ctx.moveTo(sx - 6, -14);
      ctx.lineTo(sx + 6, -4);
      ctx.moveTo(sx + 6, -14);
      ctx.lineTo(sx - 6, -4);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = INK;
    for (const sx of [-12, 12]) {
      ctx.beginPath();
      ctx.arc(sx, -9 + wob(v, sx), 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.beginPath();
  if (kind === 'level') {
    ctx.moveTo(-14, 14 + wob(v, 2));
    ctx.lineTo(14, 14 - wob(v, 2));
  } else ctx.arc(0, 32, 17, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  // Not happy: brows slanting down to the middle, so the shape differs from "all right", not only the colour.
  if (kind !== 'level') {
    ctx.beginPath();
    ctx.moveTo(-20, -20);
    ctx.lineTo(-6, -15);
    ctx.moveTo(20, -20);
    ctx.lineTo(6, -15);
    ctx.stroke();
  }
}

/** A music note. */
function note(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  ctx.fillStyle = GOOD;
  ctx.beginPath();
  ctx.ellipse(x, y + 18 * k, 11 * k, 8 * k, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6 * k;
  ctx.strokeStyle = GOOD;
  ctx.beginPath();
  ctx.moveTo(x + 9 * k, y + 16 * k);
  ctx.lineTo(x + 9 * k, y - 26 * k);
  ctx.lineTo(x + 24 * k, y - 18 * k);
  ctx.stroke();
}

/** The angry scribble: a tangled red line. */
function scribble(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = BAD;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-30, 10);
  for (let i = 0; i < 9; i++) {
    const a = i * 1.9;
    ctx.quadraticCurveTo(Math.cos(a) * 32, Math.sin(a) * 26, Math.cos(a + 0.9) * 22, Math.sin(a + 0.9) * 20);
  }
  ctx.stroke();
}
