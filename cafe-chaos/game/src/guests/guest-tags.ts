/**
 * Two small marks over a guest's head (the owner's rules 5 and 8):
 *
 * - the "leaving soon" mark: a seated guest near the end of its meal shows
 *   the gate-and-arrow picture (wish-art's `door`), so the player can plan
 *   for the seat it frees;
 * - its name: guests carry no name labels in normal play; the name shows
 *   while the player holds a guest whose wish names this one (it glows
 *   too), and for a moment when a finger points at a seated guest.
 *
 * Sprites in the café's own space (they scale with it), drawn on canvases
 * in the cards' paper and ink.
 */

import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace } from '@iwsdk/core';
import { hand } from '../ui/sketch.js';
import { drawWish } from './wish-art.js';

/** Sizes (metres, café space): the name tag's height and the leaving mark's width. */
export const GUEST_TAG = { nameHeight: 0.011, mark: 0.014 };

let markTexture: CanvasTexture | null = null;

/** The "leaving soon" mark: a paper disc with the gate and its arrow. */
export function makeLeavingMark(): Sprite {
  if (!markTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f4ecdc';
    ctx.strokeStyle = '#2a1d14';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawWish(ctx, 'door', 64, 66, 74);
    markTexture = new CanvasTexture(c);
    markTexture.colorSpace = SRGBColorSpace;
  }
  const sprite = new Sprite(new SpriteMaterial({ map: markTexture, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.name = 'LeavingMark';
  sprite.scale.set(GUEST_TAG.mark, GUEST_TAG.mark, 1);
  sprite.renderOrder = 12;
  sprite.visible = false;
  return sprite;
}

/** A guest's name on a paper pill. */
export function makeNameTag(name: string): Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const size = 56;
  ctx.font = hand(size, 700);
  const w = Math.ceil(ctx.measureText(name).width) + 48;
  c.width = w;
  c.height = 84;
  ctx.fillStyle = '#f4ecdc';
  ctx.strokeStyle = '#2a1d14';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, 76, 36);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#16171d';
  ctx.font = hand(size, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, w / 2, 45);
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.name = 'NameTag';
  sprite.scale.set((GUEST_TAG.nameHeight * w) / 84, GUEST_TAG.nameHeight, 1);
  sprite.renderOrder = 12;
  sprite.visible = false;
  return sprite;
}

/** Free a name tag's own texture (the leaving mark's is shared). */
export function disposeTag(sprite: Sprite | null): void {
  if (!sprite) return;
  sprite.removeFromParent();
  if (sprite.name === 'NameTag') sprite.material.map?.dispose();
  sprite.material.dispose();
}
