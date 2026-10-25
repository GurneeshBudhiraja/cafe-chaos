/**
 * Paper previews: draw a paper style, and optionally a note's ink, onto a
 * canvas texture that a UIKit `<img>` can show.
 *
 * Used for the template cards (paper only) and the recent-note thumbnails
 * (paper plus the note's real strokes), so people recognise notes by how
 * they look. Strokes are in page coordinates (0..1), so the same data draws
 * at any preview size.
 */

import { CanvasTexture, SRGBColorSpace } from '@iwsdk/core';
import { PAGE_ASPECT, type Note, type PaperStyle } from '../notes/note-model.js';

const PAPER_COLOR = '#fffdf9';
const RULE_COLOR = '#cfc5b8';
const GRID_COLOR = '#ddd4c8';
const DOT_COLOR = '#a89d90';
const MARGIN_COLOR = '#c98f7a';
const BOX_COLOR = '#9a928a';

/** One preview: a canvas, its 2D context and the texture UIKit samples. */
export class PaperPreview {
  readonly texture: CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  /** `width` in canvas pixels; the height follows the page aspect ratio. */
  constructor(width: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = Math.round(width / PAGE_ASPECT);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('PaperPreview: 2D canvas is not available.');
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
  }

  /** Redraw the paper, then the note's first page of ink if given. */
  draw(paper: PaperStyle, note?: Note): void {
    const { ctx } = this;
    const { width: w, height: h } = this.canvas;
    drawPaper(ctx, paper, w, h);
    const page = note?.pages[0];
    if (page) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const stroke of page.strokes) {
        const p = stroke.points;
        if (p.length < 2) continue;
        ctx.strokeStyle = stroke.color;
        // Never thinner than one pixel, so small previews keep fine ink.
        ctx.lineWidth = Math.max(1, stroke.width * w);
        ctx.beginPath();
        ctx.moveTo(p[0] * w, p[1] * h);
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * w, p[i + 1] * h);
        if (p.length === 2) ctx.lineTo(p[0] * w + 0.1, p[1] * h);
        ctx.stroke();
      }
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

function drawPaper(ctx: CanvasRenderingContext2D, paper: PaperStyle, w: number, h: number): void {
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, w, h);
  const line = Math.max(1, Math.round(w / 300));
  switch (paper) {
    case 'lined':
      rules(ctx, w, h, h / 12, line);
      break;
    case 'grid': {
      const step = w / 24;
      ctx.fillStyle = GRID_COLOR;
      for (let x = step; x < w; x += step) ctx.fillRect(Math.round(x), 0, line, h);
      for (let y = step; y < h; y += step) ctx.fillRect(0, Math.round(y), w, line);
      break;
    }
    case 'dotted': {
      const step = w / 24;
      ctx.fillStyle = DOT_COLOR;
      for (let y = step; y < h; y += step) {
        for (let x = step; x < w; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, line * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'cornell':
      // Cue column on the left, notes area on the right, summary at the bottom.
      rules(ctx, w, h * 0.78, h / 12, line, w * 0.27);
      ctx.fillStyle = MARGIN_COLOR;
      ctx.fillRect(Math.round(w * 0.25), 0, line * 2, Math.round(h * 0.78));
      ctx.fillRect(0, Math.round(h * 0.78), w, line * 2);
      break;
    case 'checklist': {
      const step = h / 8;
      const box = step * 0.42;
      for (let y = step; y < h - step * 0.5; y += step) {
        ctx.strokeStyle = BOX_COLOR;
        ctx.lineWidth = line * 1.5;
        ctx.strokeRect(w * 0.06, y - box, box, box);
        ctx.fillStyle = RULE_COLOR;
        ctx.fillRect(w * 0.06 + box * 1.6, Math.round(y), w * 0.86 - box * 1.6, line);
      }
      break;
    }
    case 'blank':
      break;
  }
}

/** Horizontal rules every `step` pixels, from `left` to the right edge. */
function rules(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  step: number,
  line: number,
  left = 0,
): void {
  ctx.fillStyle = RULE_COLOR;
  for (let y = step; y < h; y += step) ctx.fillRect(left, Math.round(y), w - left, line);
}
