/**
 * The rule cards: a little card that floats over each Yapper's head with
 * its name, its portrait and one picture per rule (a seat plan with the
 * right seats lit, a friend's portrait with a heart, a portrait crossed
 * out, a spare seat). Each picture is tinted by the rule's state: grey
 * until it can be judged, green when met, red when broken. Cards turn to
 * face the player (the Yapper system places them each frame).
 *
 * `drawPortrait` is shared with the scoreboard.
 */

import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Entity } from '@iwsdk/core';
import { HATS, type Level, type Rule, type RuleState, type YapperSpec } from './rules.js';
import { portraitColors } from './yapper-mesh.js';

export const CARD_SIZE = { width: 0.078, height: 0.044 };
const PX = 528;
const PY = Math.round((PX * CARD_SIZE.height) / CARD_SIZE.width);

const TINT: Record<RuleState, { fill: string; edge: string }> = {
  pending: { fill: '#ecebf2', edge: '#b8b5c6' },
  ok: { fill: '#d6f1cf', edge: '#5fa85a' },
  bad: { fill: '#f8d2d2', edge: '#d2504e' },
};

/** A Yapper's face from the front: the egg, eyes, beak, and its hat. */
export function drawPortrait(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: number, hat: number, mood: 'calm' | 'happy' | 'grumpy' = 'calm'): void {
  const { body, dark } = portraitColors(color);
  ctx.save();
  ctx.translate(x, y);
  // Body.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.86, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.4, r * 0.5, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tuft (when no hat covers it).
  const kind = HATS[hat % HATS.length];
  if (kind === 'none' || kind === 'glasses') {
    ctx.strokeStyle = dark;
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    for (const [dx, dy] of [
      [0, -1.3],
      [-0.22, -1.22],
      [0.22, -1.2],
    ]) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(dx * r, dy * r);
      ctx.stroke();
    }
  }
  // Eyes.
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(side * r * 0.36, -r * 0.2, r * 0.27, r * 0.31, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e1a1f';
    ctx.beginPath();
    ctx.arc(side * r * 0.36, -r * 0.16, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(side * r * 0.36 - r * 0.05, -r * 0.22, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // Brow.
    ctx.strokeStyle = dark;
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    const tilt = mood === 'grumpy' ? -side * 0.35 : mood === 'happy' ? side * 0.25 : side * 0.1;
    ctx.moveTo(side * r * 0.16, -r * 0.6 + tilt * r * 0.5);
    ctx.lineTo(side * r * 0.56, -r * 0.6 - tilt * r * 0.5);
    ctx.stroke();
  }
  // Beak.
  ctx.fillStyle = '#f0a040';
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, r * 0.12);
  ctx.lineTo(r * 0.2, r * 0.12);
  ctx.lineTo(0, r * (mood === 'grumpy' ? 0.42 : 0.34));
  ctx.closePath();
  ctx.fill();
  // Hat.
  ctx.fillStyle = '#d9484c';
  switch (kind) {
    case 'cap':
      ctx.fillStyle = '#3d6fc4';
      ctx.beginPath();
      ctx.arc(0, -r * 0.78, r * 0.55, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-r * 0.75, -r * 0.84, r * 1.5, r * 0.12);
      break;
    case 'bow':
      ctx.fillStyle = '#f07fb0';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(r * 0.55 + side * r * 0.22, -r * 0.85, r * 0.22, r * 0.14, side * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'beanie':
      ctx.fillStyle = '#4f9f5c';
      ctx.beginPath();
      ctx.arc(0, -r * 0.75, r * 0.6, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#d9484c';
      ctx.fillRect(-r * 0.62, -r * 0.82, r * 1.24, r * 0.14);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, -r * 1.35, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'glasses':
      ctx.strokeStyle = '#33333a';
      ctx.lineWidth = r * 0.07;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * r * 0.36, -r * 0.18, r * 0.34, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-r * 0.05, -r * 0.2);
      ctx.lineTo(r * 0.05, -r * 0.2);
      ctx.stroke();
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.fillStyle = '#f07fb0';
        ctx.beginPath();
        ctx.arc(r * 0.55 + Math.cos(a) * r * 0.16, -r * 0.95 + Math.sin(a) * r * 0.16, r * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f3cf4a';
      ctx.beginPath();
      ctx.arc(r * 0.55, -r * 0.95, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'propeller':
      ctx.fillStyle = '#d9484c';
      ctx.beginPath();
      ctx.arc(0, -r * 0.8, r * 0.5, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#f3cf4a';
      ctx.fillRect(-r * 0.6, -r * 1.42, r * 1.2, r * 0.09);
      ctx.fillStyle = '#888';
      ctx.fillRect(-r * 0.03, -r * 1.4, r * 0.06, r * 0.12);
      break;
    case 'headphones':
      ctx.strokeStyle = '#33333a';
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.95, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.fillStyle = '#3d6fc4';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * r * 0.92, -r * 0.05, r * 0.14, r * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }
  ctx.restore();
}

/** A seat plan from above: `rows` rows of 4 seats (the front at the left), the `lit` seats coloured. */
function drawPlan(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, rows: number, lit: (row: number, col: number) => boolean, front = true): void {
  const seat = w / (rows + 1.2);
  const aisle = seat * 0.5;
  const planH = seat * 4 + aisle;
  const x0 = x - w / 2 + seat * 0.6;
  const y0 = y - planH / 2;
  ctx.save();
  // Body outline, with a rounded nose at the front.
  ctx.fillStyle = '#d8d6e0';
  ctx.beginPath();
  ctx.roundRect(x0 - seat * 0.55, y0 - seat * 0.3, seat * rows + seat * 0.9, planH + seat * 0.6, seat * 0.35);
  ctx.fill();
  if (front) {
    ctx.fillStyle = '#9fc6e8';
    ctx.fillRect(x0 - seat * 0.5, y0 - seat * 0.1, seat * 0.16, planH + seat * 0.2);
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < 4; col++) {
      const sy = y0 + col * seat + (col >= 2 ? aisle : 0);
      ctx.fillStyle = lit(row, col) ? '#f0b64a' : '#f7f6fa';
      ctx.strokeStyle = lit(row, col) ? '#b57a1a' : '#9c99aa';
      ctx.lineWidth = seat * 0.08;
      ctx.beginPath();
      ctx.roundRect(x0 + row * seat + seat * 0.08, sy + seat * 0.08, seat * 0.84, seat * 0.84, seat * 0.22);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A pair of seats side by side, each either empty, dashed-empty, or holding a portrait. */
function drawPair(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, left: 'me' | 'empty' | 'portrait', right: 'me' | 'empty' | 'portrait', me: YapperSpec, other?: YapperSpec): void {
  const seat = w * 0.46;
  for (const [i, what] of [left, right].entries()) {
    const sx = x - w / 2 + i * (seat + w * 0.08);
    ctx.fillStyle = '#f7f6fa';
    ctx.strokeStyle = what === 'empty' ? '#d2504e' : '#9c99aa';
    ctx.lineWidth = seat * 0.08;
    ctx.setLineDash(what === 'empty' ? [seat * 0.18, seat * 0.12] : []);
    ctx.beginPath();
    ctx.roundRect(sx, y - seat / 2, seat, seat, seat * 0.22);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    if (what === 'me') drawPortrait(ctx, sx + seat / 2, y + seat * 0.08, seat * 0.3, me.color, me.hat);
    if (what === 'portrait' && other) drawPortrait(ctx, sx + seat / 2, y + seat * 0.08, seat * 0.3, other.color, other.hat);
    if (what === 'empty') {
      ctx.strokeStyle = '#d2504e';
      ctx.lineWidth = seat * 0.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx + seat * 0.32, y - seat * 0.18);
      ctx.lineTo(sx + seat * 0.68, y + seat * 0.18);
      ctx.moveTo(sx + seat * 0.68, y - seat * 0.18);
      ctx.lineTo(sx + seat * 0.32, y + seat * 0.18);
      ctx.stroke();
    }
  }
}

/** One rule's picture in a box at (x, y) of size `s`, tinted by its state. */
function drawRule(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rule: Rule, state: RuleState, me: YapperSpec, level: Level): void {
  const tint = TINT[state];
  ctx.fillStyle = tint.fill;
  ctx.strokeStyle = tint.edge;
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.roundRect(x - s / 2, y - s / 2, s, s, s * 0.14);
  ctx.fill();
  ctx.stroke();
  const cx = x;
  const cy = y - s * 0.06;
  const other = rule.who !== undefined ? level.yappers[rule.who] : undefined;
  switch (rule.kind) {
    case 'window':
      drawPlan(ctx, cx, cy, s * 0.72, level.rows, (_, col) => col === 0 || col === 3);
      break;
    case 'aisle':
      drawPlan(ctx, cx, cy, s * 0.72, level.rows, (_, col) => col === 1 || col === 2);
      break;
    case 'front':
      drawPlan(ctx, cx, cy, s * 0.72, level.rows, (row) => row === 0);
      break;
    case 'back':
      drawPlan(ctx, cx, cy, s * 0.72, level.rows, (row) => row === level.rows - 1);
      break;
    case 'beside':
      drawPair(ctx, cx, cy + s * 0.04, s * 0.8, 'me', 'portrait', me, other);
      // A heart between them.
      ctx.fillStyle = '#e0506a';
      ctx.font = `bold ${Math.round(s * 0.26)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', cx, cy - s * 0.3);
      break;
    case 'apart':
      if (other) drawPortrait(ctx, cx, cy + s * 0.05, s * 0.27, other.color, other.hat, 'grumpy');
      ctx.strokeStyle = '#d2504e';
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.26, cy - s * 0.26);
      ctx.lineTo(cx + s * 0.26, cy + s * 0.26);
      ctx.stroke();
      break;
    case 'alone':
      drawPair(ctx, cx, cy + s * 0.04, s * 0.8, 'me', 'empty', me);
      break;
  }
  // A tick or a cross in the corner once decided.
  if (state !== 'pending') {
    ctx.fillStyle = tint.edge;
    ctx.beginPath();
    ctx.arc(x + s * 0.4, y - s * 0.4, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(s * 0.2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state === 'ok' ? '✓' : '✗', x + s * 0.4, y - s * 0.39);
  }
}

/** The short label under a rule's picture. */
function ruleLabel(rule: Rule, level: Level): string {
  switch (rule.kind) {
    case 'window':
      return 'window';
    case 'aisle':
      return 'aisle';
    case 'front':
      return 'front row';
    case 'back':
      return 'back row';
    case 'beside':
      return `by ${level.yappers[rule.who!].name}`;
    case 'apart':
      return `not ${level.yappers[rule.who!].name}`;
    case 'alone':
      return 'spare seat';
  }
}

export class RuleCard {
  readonly group = new Group();
  readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  entity: Entity | null = null;

  constructor() {
    this.group.name = 'RuleCard';
    this.canvas.width = PX;
    this.canvas.height = PY;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mesh = new Mesh(new PlaneGeometry(CARD_SIZE.width, CARD_SIZE.height), new MeshBasicMaterial({ map: this.texture, transparent: true, side: DoubleSide, depthWrite: false }));
    mesh.renderOrder = 10;
    this.group.add(mesh);
  }

  /** Repaint: the name and portrait on the left, the rules' pictures to the right. */
  paint(spec: YapperSpec, level: Level, states: RuleState[], mood: 'calm' | 'happy' | 'grumpy' = 'calm'): void {
    const ctx = this.canvas.getContext('2d')!;
    const w = PX;
    const h = PY;
    ctx.clearRect(0, 0, w, h);
    // The card: a white speech-bubble with a little tail at the bottom.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.strokeStyle = mood === 'grumpy' ? '#d2504e' : mood === 'happy' ? '#5fa85a' : '#8d88a6';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 30, 26);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 16, h - 28);
    ctx.lineTo(w / 2 + 16, h - 28);
    ctx.lineTo(w / 2, h - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 16, h - 27);
    ctx.lineTo(w / 2, h - 4);
    ctx.lineTo(w / 2 + 16, h - 27);
    ctx.stroke();
    // Portrait and name.
    const left = 70;
    drawPortrait(ctx, left, h * 0.42, 44, spec.color, spec.hat, mood);
    ctx.fillStyle = '#3b3550';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.name, left, h - 62);
    // Rules.
    const n = spec.rules.length;
    const s = Math.min(150, (w - 150) / n - 10);
    const start = 150 + ((w - 150) - n * (s + 10)) / 2 + (s + 10) / 2;
    spec.rules.forEach((rule, i) => {
      const x = start + i * (s + 10);
      drawRule(ctx, x, h * 0.36 + 4, s * 0.86, rule, states[i] ?? 'pending', spec, level);
      ctx.fillStyle = '#4a4560';
      ctx.font = `bold ${Math.round(s * 0.2)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ruleLabel(rule, level), x, h - 60);
    });
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.entity?.dispose();
    this.entity = null;
  }
}
