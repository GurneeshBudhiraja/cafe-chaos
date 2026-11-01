/**
 * The paper's pattern (ruled lines, grid, dots...) on the infinite canvas.
 *
 * The page's paper photo stays put, like the sheet in a frame; its pattern
 * belongs to the canvas, so it pans and zooms with the ink. Lined, grid and
 * dotted paper repeat forever: each is drawn once as a single repeating
 * tile, and the page shows it through a texture transform (no redrawing as
 * the view moves). Cornell and checklist paper are page layouts, not
 * patterns: they are drawn once over the first page's area only.
 *
 * Sizes match paper-preview.ts: rules every twelfth of the page's height,
 * grid squares and dots every 24th of its width.
 */

import {
  CanvasTexture,
  ClampToEdgeWrapping,
  RepeatWrapping,
  SRGBColorSpace,
} from '@iwsdk/core';
import { PAGE_ASPECT, type PaperStyle } from '../notes/note-model.js';
import type { PageView } from '../notes/page-view.js';
import { drawPaperPattern } from './paper-preview.js';

const RULE_COLOR = '#cfc5b8';
const GRID_COLOR = '#ddd4c8';
const DOT_COLOR = '#a89d90';
/** Pixels per page width the patterns are drawn at. */
const PX_PER_PAGE = 1024;
/** Lines are this thick (page widths), as on the paper preview. */
const LINE = 1 / 300;

export interface PaperPattern {
  texture: CanvasTexture;
  /** One tile's size in canvas units (page widths across, page heights down). */
  periodX: number;
  periodY: number;
}

/** The pattern for a paper style, or null for blank paper. */
export function createPaperPattern(paper: PaperStyle): PaperPattern | null {
  switch (paper) {
    case 'lined':
      return tile(1, 1 / 12, (ctx, w) => {
        ctx.fillStyle = RULE_COLOR;
        ctx.fillRect(0, 0, w, Math.max(1, LINE * PX_PER_PAGE));
      });
    case 'grid':
      return tile(1 / 24, PAGE_ASPECT / 24, (ctx, w, h) => {
        const line = Math.max(1, LINE * PX_PER_PAGE);
        ctx.fillStyle = GRID_COLOR;
        ctx.fillRect(0, 0, w, line);
        ctx.fillRect(0, 0, line, h);
      });
    case 'dotted':
      return tile(1 / 24, PAGE_ASPECT / 24, (ctx, w, h) => {
        ctx.fillStyle = DOT_COLOR;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.max(1, LINE * PX_PER_PAGE) * 1.2, 0, Math.PI * 2);
        ctx.fill();
      });
    case 'cornell':
    case 'checklist': {
      // A page layout: drawn once, with a clear border so it does not smear past the page.
      const w = PX_PER_PAGE;
      const h = Math.round(PX_PER_PAGE / PAGE_ASPECT);
      const { canvas, ctx } = makeCanvas(w + 4, h + 4);
      ctx.translate(2, 2);
      drawPaperPattern(ctx, paper, w, h);
      const texture = makeTexture(canvas);
      texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
      return { texture, periodX: 1, periodY: 1 };
    }
    case 'blank':
      return null;
  }
}

/**
 * Show the canvas area `view` looks at through a page-sized mesh with the
 * pattern (its UVs run 0..1 across the page, 0 at the bottom).
 */
export function aimPaperPattern(pattern: PaperPattern, view: PageView): void {
  const { texture, periodX, periodY } = pattern;
  texture.repeat.set(1 / (view.zoom * periodX), 1 / (view.zoom * periodY));
  // The image's top row lies along canvas y = 0 (and every period after it).
  texture.offset.set((view.x - 0.5 / view.zoom) / periodX, 1 - (view.y + 0.5 / view.zoom) / periodY);
}

function tile(
  periodX: number,
  periodY: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): PaperPattern {
  const w = Math.max(8, Math.round(periodX * PX_PER_PAGE));
  const h = Math.max(8, Math.round((periodY / PAGE_ASPECT) * PX_PER_PAGE));
  const { canvas, ctx } = makeCanvas(w, h);
  draw(ctx, w, h);
  const texture = makeTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return { texture, periodX, periodY };
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('paper-pattern: 2D canvas is not available.');
  return { canvas, ctx };
}

function makeTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
