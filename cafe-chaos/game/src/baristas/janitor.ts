/**
 * The janitor: a look on the baristas' rig (models/18-barista/staff_build.py),
 * so it walks and wipes with the same clips (Walk, Wipe, Idle) and is one
 * draw call like them. Dressed so nobody mistakes it: a bright safety-blue
 * coverall with yellow reflective stripes, a white badge on the chest, a
 * yellow bandana, a mop slung across its back, a cleaning cloth in hand,
 * and a bucket set down beside it while it cleans (`setCleaning`).
 *
 * Over its head floats a small broom badge, the same broom as the sign
 * over a dirty table someone is on the way to clean: the one who cleans,
 * read at a glance (shape, not only colour).
 */

import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, type Object3D } from '@iwsdk/core';
import { Barista, baristaLoaded } from './barista.js';

/** The broom badge: its size and height over the janitor's feet (metres, its own space). */
const BADGE = { size: 0.022, above: 0.092 };

/** True once the janitor's model has loaded. */
export function janitorLoaded(): boolean {
  return baristaLoaded('janitor');
}

/** A janitor on stage, its bucket put away. */
export function makeJanitor(): Barista {
  const janitor = new Barista('janitor');
  janitor.root.name = 'Janitor';
  const badge = new Sprite(badgeMaterial());
  badge.name = 'JanitorBadge';
  badge.scale.setScalar(BADGE.size);
  badge.position.y = BADGE.above;
  badge.renderOrder = 29;
  janitor.root.add(badge);
  setCleaning(janitor, false);
  return janitor;
}

/** The bucket beside it while it cleans; folded away (its part collapsed) otherwise. */
export function setCleaning(janitor: Barista, on: boolean): void {
  const bucket: Object3D | undefined = janitor.root.getObjectByName('Bucket');
  bucket?.scale.setScalar(on ? 1 : 0.0001);
}

let badge: SpriteMaterial | null = null;

/** A paper disc with a blue rim and a broom on it, drawn once. */
function badgeMaterial(): SpriteMaterial {
  if (badge) return badge;
  const px = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  const c = px / 2;
  ctx.beginPath();
  ctx.arc(c, c + 2, c - 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30, 20, 12, 0.3)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, c - 6, 0, Math.PI * 2);
  ctx.fillStyle = '#2167d8';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, c - 15, 0, Math.PI * 2);
  ctx.fillStyle = '#f4ecdc';
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a1d14';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(c + 22, c - 30);
  ctx.lineTo(c - 6, c + 10);
  ctx.stroke();
  ctx.fillStyle = '#f5cf2a';
  ctx.beginPath();
  ctx.moveTo(c - 18, c + 2);
  ctx.lineTo(c + 4, c + 16);
  ctx.lineTo(c - 6, c + 34);
  ctx.lineTo(c - 32, c + 20);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  badge = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  return badge;
}
