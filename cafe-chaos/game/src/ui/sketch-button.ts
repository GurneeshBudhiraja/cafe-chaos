/**
 * Buttons in the sketch-pen look (ui/sketch.ts), for panels that draw
 * their own frame: a marker-drawn box, paper or sun-red, with a
 * handwritten label. Lit with a soft glow while a fingertip is near; it
 * dips a little when pressed. The lines never move.
 */

import type { Button } from './panel.js';
import { hand, line, pen, SKETCH } from './sketch.js';

/** A sketch button: `kind` 'go' is sun-red (the main action), 'plain' is paper. `seed` fixes its lines. */
export function sketchButton(canvas: HTMLCanvasElement, id: string, label: string, x: number, y: number, w: number, h: number, seed: number, kind: 'go' | 'plain' = 'plain', extra?: (ctx: CanvasRenderingContext2D, b: Button) => void): Button {
  return {
    id, label, x, y, w, h, bare: true,
    draw: (ctx, b, hover, pressed) => {
      const rc = pen(canvas);
      const dip = pressed ? b.h * 0.05 : 0;
      const lw = Math.max(2, b.h * 0.045);
      if (hover) {
        ctx.save();
        ctx.shadowColor = kind === 'go' ? 'rgba(201, 56, 42, 0.8)' : 'rgba(255, 210, 140, 0.95)';
        ctx.shadowBlur = b.h * 0.45;
        ctx.fillStyle = 'rgba(0,0,0,0.01)';
        ctx.fillRect(b.x, b.y + dip, b.w, b.h);
        ctx.restore();
      }
      rc.rectangle(b.x, b.y + dip, b.w, b.h, line(seed, lw, kind === 'go'
        ? { fill: hover ? '#d94a3a' : SKETCH.red, fillStyle: 'solid', stroke: SKETCH.redInk }
        : { fill: hover ? '#e9dccb' : SKETCH.paperDeep, fillStyle: 'solid' }));
      if (extra) {
        ctx.save();
        ctx.translate(0, dip);
        extra(ctx, b);
        ctx.restore();
        return;
      }
      ctx.font = hand(b.h * 0.42);
      ctx.fillStyle = kind === 'go' ? '#fbeee2' : SKETCH.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label ?? '', b.x + b.w / 2, b.y + b.h / 2 + dip + b.h * 0.03);
    },
  };
}
