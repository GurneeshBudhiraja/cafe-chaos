/**
 * The start's sketch-pen cards (the scoreboard's look: paper, ink,
 * handwriting, still marker lines): the speech bubble that says what to do
 * next, beside the thing it is about; the gate sign returning players open
 * the café from; and the ghost hand that shows a pinch.
 */

import { line, pen, scrawl, SKETCH } from './sketch.js';

/**
 * A speech bubble filling the canvas: a paper box with its tail at the
 * bottom (toward what it is about), a bold line, an optional softer line,
 * and optional progress dots (`done` of `of`) at its top right.
 */
export function drawBubble(canvas: HTMLCanvasElement, title: string, sub: string | null, progress?: { done: number; of: number }, seed = 300): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const rc = pen(canvas);
  const tail = h * 0.2;
  const lw = Math.max(2, h * 0.018);
  const boxH = h - tail - lw * 2;
  // The tail first, then the box over its root, so the join does not show.
  rc.polygon([[w * 0.3, boxH - lw], [w * 0.22, h - lw * 1.5], [w * 0.46, boxH - lw]], line(seed + 1, lw, { fill: SKETCH.paper, fillStyle: 'solid' }));
  rc.rectangle(lw * 1.5, lw * 1.5, w - lw * 3, boxH - lw * 1.5, line(seed, lw, { fill: SKETCH.paper, fillStyle: 'solid' }));
  ctx.fillStyle = SKETCH.paper;
  ctx.fillRect(w * 0.3 + lw * 2, boxH - lw * 3, w * 0.16 - lw * 4, lw * 4);
  const left = w * 0.06;
  const titleSize = sub ? boxH * 0.36 : boxH * 0.44;
  scrawl(ctx, title, left, sub ? boxH * 0.36 : boxH * 0.52, titleSize);
  if (sub) scrawl(ctx, sub, left, boxH * 0.72, boxH * 0.25, { weight: 400, color: SKETCH.soft });
  if (progress) {
    const r = boxH * 0.07;
    for (let i = 0; i < progress.of; i++) {
      const x = w - w * 0.05 - (progress.of - 1 - i) * r * 2.8 - r;
      rc.circle(x, boxH * 0.2, r * 2, line(seed + 10 + i, lw * 0.7, i < progress.done ? { fill: SKETCH.calm, fillStyle: 'solid' } : { fill: SKETCH.paper, fillStyle: 'solid' }));
    }
  }
}

/** The gate sign's board (its buttons are drawn by the panel): the name, and the best evening at the foot. */
export function drawSign(canvas: HTMLCanvasElement, best: string | null): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const rc = pen(canvas);
  const lw = Math.max(2, h * 0.012);
  rc.rectangle(lw * 1.5, lw * 1.5, w - lw * 3, h - lw * 3, line(410, lw, { fill: SKETCH.paper, fillStyle: 'solid' }));
  scrawl(ctx, 'Café Chaos', w / 2, h * 0.16, h * 0.15, { align: 'center' });
  if (best) scrawl(ctx, best, w / 2, h * 0.9, h * 0.075, { align: 'center', weight: 400, color: SKETCH.soft });
}

/**
 * The ghost hand, from the player's side: a pale outline of a right hand
 * with thumb and index lit, open (`closed` false) or pinched. Two frames,
 * shown in turn, make the loop.
 */
export function drawGhostHand(canvas: HTMLCanvasElement, closed: boolean): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const rc = pen(canvas);
  const s = Math.min(w, h) / 220;
  ctx.save();
  ctx.translate(w * 0.55, h * 0.62);
  ctx.scale(s, s);
  const pale = { stroke: '#f3ead9', strokeWidth: 6, roughness: 0.7, bowing: 0.5, seed: 520 };
  rc.path('M -40 90 C -60 40 -55 0 -30 -10 L -28 -70 C -27 -82 -12 -82 -11 -70 L -9 -20 L -6 -95 C -5 -108 11 -108 12 -95 L 13 -22 L 18 -85 C 19 -97 34 -96 34 -84 L 32 -15 L 40 -60 C 42 -72 56 -70 55 -58 L 52 10 C 50 50 40 80 20 95 Z', pale);
  rc.path(closed ? 'M -30 -10 C -45 -20 -40 -55 -12 -66' : 'M -30 -10 C -60 -25 -72 -52 -68 -66', { ...pale, stroke: '#ffd27a', strokeWidth: 8, seed: 521 });
  for (const [fx, fy] of closed ? [[-14, -70]] : [[-19, -77], [-68, -66]]) {
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 26);
    g.addColorStop(0, 'rgba(255,214,120,.95)');
    g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fx, fy, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

