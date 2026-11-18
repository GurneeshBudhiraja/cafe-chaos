/**
 * The pictures of the wishes: one small drawing each, read at a glance
 * from the player's seat, with no words. They are drawn on canvases, in
 * the café's ink on a cream bubble, and used in two places: the bubble
 * over a waiting guest's head, and the card beside the hand.
 *
 * - window: a window with its cross bars and a little sun;
 * - door: the gate's arch with an arrow going out;
 * - counter: a steaming cup;
 * - quiet: a crescent moon and a "z";
 * - alone: one figure; company: two;
 * - music: a pair of notes; the singer's own mark is an open mouth with
 *   a note.
 * The Canadian café's:
 * - socket: a wall socket's face, two slots;
 * - outside: a snowy spruce;
 * - takeaway: a paper cup with its lid;
 * - lake: a red canoe on two waves;
 * - patio: a bistro table under its umbrella;
 * - bonfire: a flame over two crossed logs;
 * - warm: a thermometer, red to the top;
 * - upstairs: a flight of steps and an arrow up.
 * And how a wish came out: a heart (granted), a shrug (not).
 */

import { CanvasTexture, SRGBColorSpace } from '@iwsdk/core';
import type { WishId } from './wishes.js';

export type WishPicture = WishId | 'singer' | 'heart' | 'shrug' | 'note';

const INK = '#4a2f1c';
const AMBER = '#c9772f';

/** Draw a picture centred at (x, y), `s` across, in `ctx`. */
export function drawWish(ctx: CanvasRenderingContext2D, kind: WishPicture, x: number, y: number, s: number): void {
  const u = s / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = s * 0.09;
  const figure = (fx: number, k: number): void => {
    ctx.beginPath();
    ctx.arc(fx, -u * 0.38 * k, u * 0.3 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(fx - u * 0.42 * k, u * 0.0, u * 0.84 * k, u * 0.72 * k, u * 0.28 * k);
    ctx.fill();
  };
  const note = (nx: number, ny: number, k: number): void => {
    ctx.beginPath();
    ctx.ellipse(nx, ny + u * 0.45 * k, u * 0.24 * k, u * 0.18 * k, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(nx + u * 0.2 * k, ny + u * 0.42 * k);
    ctx.lineTo(nx + u * 0.2 * k, ny - u * 0.5 * k);
    ctx.lineTo(nx + u * 0.62 * k, ny - u * 0.3 * k);
    ctx.stroke();
  };
  switch (kind) {
    case 'window':
      ctx.beginPath();
      ctx.roundRect(-u * 0.72, -u * 0.72, u * 1.44, u * 1.44, u * 0.16);
      ctx.fillStyle = '#bfe3ff';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -u * 0.72);
      ctx.lineTo(0, u * 0.72);
      ctx.moveTo(-u * 0.72, 0);
      ctx.lineTo(u * 0.72, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(u * 0.36, -u * 0.36, u * 0.17, 0, Math.PI * 2);
      ctx.fillStyle = '#f6c445';
      ctx.fill();
      break;
    case 'door':
      // The gate's posts and beam, and an arrow out.
      ctx.beginPath();
      ctx.moveTo(-u * 0.6, u * 0.75);
      ctx.lineTo(-u * 0.6, -u * 0.5);
      ctx.moveTo(-u * 0.1, u * 0.75);
      ctx.lineTo(-u * 0.1, -u * 0.5);
      ctx.moveTo(-u * 0.85, -u * 0.55);
      ctx.lineTo(u * 0.15, -u * 0.55);
      ctx.stroke();
      ctx.strokeStyle = AMBER;
      ctx.beginPath();
      ctx.moveTo(u * 0.1, u * 0.2);
      ctx.lineTo(u * 0.85, u * 0.2);
      ctx.moveTo(u * 0.55, -u * 0.1);
      ctx.lineTo(u * 0.85, u * 0.2);
      ctx.lineTo(u * 0.55, u * 0.5);
      ctx.stroke();
      break;
    case 'counter':
      ctx.beginPath();
      ctx.roundRect(-u * 0.6, -u * 0.1, u * 1.0, u * 0.8, u * 0.2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(u * 0.48, u * 0.25, u * 0.26, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = AMBER;
      for (const sx of [-0.35, 0.1]) {
        ctx.beginPath();
        ctx.moveTo(u * sx, -u * 0.3);
        ctx.quadraticCurveTo(u * (sx + 0.2), -u * 0.5, u * sx, -u * 0.7);
        ctx.stroke();
      }
      break;
    case 'quiet':
      ctx.beginPath();
      ctx.arc(-u * 0.15, u * 0.05, u * 0.62, 0.6, Math.PI * 2 - 0.9);
      ctx.arc(u * 0.12, -u * 0.12, u * 0.5, Math.PI * 2 - 1.25, 0.95, true);
      ctx.fillStyle = '#7d6fd6';
      ctx.fill();
      ctx.font = `800 ${Math.round(u * 0.62)}px sans-serif`;
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('z', u * 0.55, -u * 0.5);
      break;
    case 'alone':
      figure(0, 1.15);
      break;
    case 'company':
      figure(-u * 0.38, 0.92);
      ctx.fillStyle = AMBER;
      figure(u * 0.38, 0.92);
      break;
    case 'friend':
      // Two figures, close, a small heart between them.
      figure(-u * 0.32, 0.88);
      figure(u * 0.32, 0.88);
      ctx.fillStyle = AMBER;
      ctx.beginPath();
      ctx.arc(-u * 0.07, -u * 0.62, u * 0.09, 0, Math.PI * 2);
      ctx.arc(u * 0.07, -u * 0.62, u * 0.09, 0, Math.PI * 2);
      ctx.moveTo(-u * 0.16, -u * 0.58);
      ctx.lineTo(0, -u * 0.4);
      ctx.lineTo(u * 0.16, -u * 0.58);
      ctx.fill();
      break;
    case 'music':
    case 'note':
      note(-u * 0.25, 0, 1);
      if (kind === 'music') {
        ctx.strokeStyle = AMBER;
        ctx.fillStyle = AMBER;
        note(u * 0.3, -u * 0.2, 0.7);
      }
      break;
    case 'singer':
      ctx.beginPath();
      ctx.arc(-u * 0.2, u * 0.1, u * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd9a8';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-u * 0.2, u * 0.25, u * 0.2, u * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.strokeStyle = AMBER;
      ctx.fillStyle = AMBER;
      note(u * 0.45, -u * 0.35, 0.6);
      break;
    case 'socket':
      ctx.beginPath();
      ctx.roundRect(-u * 0.62, -u * 0.72, u * 1.24, u * 1.44, u * 0.3);
      ctx.fillStyle = '#f4ead8';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-u * 0.32, -u * 0.32, u * 0.16, u * 0.5, u * 0.06);
      ctx.roundRect(u * 0.16, -u * 0.32, u * 0.16, u * 0.5, u * 0.06);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, u * 0.42, u * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'outside':
      // A spruce, snow on its tiers.
      ctx.fillStyle = '#3f7a4a';
      for (const [ty, tw] of [[-0.8, 0.45], [-0.35, 0.65], [0.1, 0.85]] as const) {
        ctx.beginPath();
        ctx.moveTo(0, u * ty);
        ctx.lineTo(-u * tw, u * (ty + 0.6));
        ctx.lineTo(u * tw, u * (ty + 0.6));
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -u * 0.8);
      ctx.lineTo(-u * 0.18, -u * 0.55);
      ctx.lineTo(u * 0.18, -u * 0.55);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.fillRect(-u * 0.1, u * 0.7, u * 0.2, u * 0.2);
      break;
    case 'takeaway':
      // A paper cup, its lid and sleeve.
      ctx.beginPath();
      ctx.moveTo(-u * 0.45, -u * 0.45);
      ctx.lineTo(u * 0.45, -u * 0.45);
      ctx.lineTo(u * 0.32, u * 0.8);
      ctx.lineTo(-u * 0.32, u * 0.8);
      ctx.closePath();
      ctx.fillStyle = '#f4ead8';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-u * 0.56, -u * 0.68, u * 1.12, u * 0.24, u * 0.08);
      ctx.fillStyle = '#c8322e';
      ctx.fill();
      ctx.fillStyle = AMBER;
      ctx.fillRect(-u * 0.4, u * 0.05, u * 0.8, u * 0.3);
      break;
    case 'lake':
      // A red canoe on the water.
      ctx.beginPath();
      ctx.moveTo(-u * 0.85, -u * 0.05);
      ctx.quadraticCurveTo(0, u * 0.5, u * 0.85, -u * 0.05);
      ctx.closePath();
      ctx.fillStyle = '#c8322e';
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#4f8fd0';
      for (const wy of [0.45, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(-u * 0.85, u * wy);
        ctx.quadraticCurveTo(-u * 0.42, u * (wy - 0.18), 0, u * wy);
        ctx.quadraticCurveTo(u * 0.42, u * (wy + 0.18), u * 0.85, u * wy);
        ctx.stroke();
      }
      break;
    case 'patio':
      // A bistro table under an umbrella.
      ctx.beginPath();
      ctx.moveTo(-u * 0.85, -u * 0.25);
      ctx.quadraticCurveTo(0, -u * 1.0, u * 0.85, -u * 0.25);
      ctx.closePath();
      ctx.fillStyle = '#c8322e';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -u * 0.25);
      ctx.lineTo(0, u * 0.75);
      ctx.moveTo(-u * 0.45, u * 0.3);
      ctx.lineTo(u * 0.45, u * 0.3);
      ctx.moveTo(-u * 0.3, u * 0.75);
      ctx.lineTo(u * 0.3, u * 0.75);
      ctx.stroke();
      break;
    case 'bonfire':
      ctx.beginPath();
      ctx.moveTo(-u * 0.7, u * 0.8);
      ctx.lineTo(u * 0.7, u * 0.45);
      ctx.moveTo(u * 0.7, u * 0.8);
      ctx.lineTo(-u * 0.7, u * 0.45);
      ctx.lineWidth = s * 0.14;
      ctx.strokeStyle = '#7a4a2a';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -u * 0.85);
      ctx.bezierCurveTo(u * 0.75, -u * 0.2, u * 0.55, u * 0.5, 0, u * 0.5);
      ctx.bezierCurveTo(-u * 0.55, u * 0.5, -u * 0.6, -u * 0.1, -u * 0.15, -u * 0.35);
      ctx.bezierCurveTo(-u * 0.1, -u * 0.55, 0, -u * 0.6, 0, -u * 0.85);
      ctx.fillStyle = '#f08a2c';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, u * 0.22, u * 0.18, u * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f6c445';
      ctx.fill();
      break;
    case 'warm':
      // A thermometer, red to the top.
      ctx.beginPath();
      ctx.roundRect(-u * 0.16, -u * 0.85, u * 0.32, u * 1.2, u * 0.16);
      ctx.fillStyle = '#f4ead8';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, u * 0.55, u * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = '#e0443a';
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-u * 0.07, -u * 0.6, u * 0.14, u * 1.0);
      ctx.strokeStyle = AMBER;
      for (const ry of [-0.5, -0.1]) {
        ctx.beginPath();
        ctx.moveTo(u * 0.35, u * ry);
        ctx.lineTo(u * 0.6, u * ry);
        ctx.stroke();
      }
      break;
    case 'upstairs':
      ctx.beginPath();
      ctx.moveTo(-u * 0.8, u * 0.75);
      ctx.lineTo(-u * 0.8, u * 0.4);
      ctx.lineTo(-u * 0.35, u * 0.4);
      ctx.lineTo(-u * 0.35, u * 0.05);
      ctx.lineTo(u * 0.1, u * 0.05);
      ctx.lineTo(u * 0.1, -u * 0.3);
      ctx.lineTo(u * 0.55, -u * 0.3);
      ctx.lineTo(u * 0.55, u * 0.75);
      ctx.closePath();
      ctx.fillStyle = '#b5814f';
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = AMBER;
      ctx.beginPath();
      ctx.moveTo(-u * 0.55, -u * 0.25);
      ctx.lineTo(-u * 0.05, -u * 0.75);
      ctx.moveTo(-u * 0.4, -u * 0.75);
      ctx.lineTo(-u * 0.05, -u * 0.75);
      ctx.lineTo(-u * 0.05, -u * 0.4);
      ctx.stroke();
      break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, u * 0.7);
      ctx.bezierCurveTo(-u * 1.1, -u * 0.05, -u * 0.55, -u * 0.95, 0, -u * 0.35);
      ctx.bezierCurveTo(u * 0.55, -u * 0.95, u * 1.1, -u * 0.05, 0, u * 0.7);
      ctx.fillStyle = '#f2607a';
      ctx.fill();
      break;
    case 'shrug':
      // A flat little face.
      ctx.beginPath();
      ctx.arc(0, 0, u * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = '#d9cbb5';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-u * 0.25, -u * 0.15, u * 0.08, 0, Math.PI * 2);
      ctx.arc(u * 0.25, -u * 0.15, u * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-u * 0.25, u * 0.28);
      ctx.lineTo(u * 0.25, u * 0.22);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

const bubbles = new Map<string, CanvasTexture>();

/** A wish in its bubble (a cream disc with a walnut rim, or bare for the marks that float up), as a texture: drawn once and kept. */
export function wishTexture(kind: WishPicture, bubble = true): CanvasTexture {
  const key = `${kind}|${bubble}`;
  let texture = bubbles.get(key);
  if (texture) return texture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  if (bubble) {
    ctx.beginPath();
    ctx.arc(c, c + 3, c - 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 24, 12, 0.3)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, c - 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fbf2e1';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#6b4529';
    ctx.stroke();
  }
  drawWish(ctx, kind, c, c, bubble ? size * 0.56 : size * 0.8);
  texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  bubbles.set(key, texture);
  return texture;
}
