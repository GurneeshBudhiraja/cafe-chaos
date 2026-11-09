/**
 * A soft glow sprite for a lamp: an additive, round, feathered billboard
 * that always faces the player. It fakes the bloom a small bright light
 * has to the eye, without a post-processing pass (too costly on the
 * headset).
 */

import { AdditiveBlending, CanvasTexture, Color, Sprite, SpriteMaterial } from '@iwsdk/core';

let texture: CanvasTexture | undefined;

/** The shared radial gradient, drawn once. */
function haloTexture(): CanvasTexture {
  if (texture) return texture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  texture = new CanvasTexture(canvas);
  return texture;
}

/** A halo `diameter` metres across in `color`, at `opacity`. */
export function makeHalo(diameter: number, color: number, opacity: number): Sprite {
  const material = new SpriteMaterial({
    map: haloTexture(),
    color: new Color(color),
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.setScalar(diameter);
  sprite.name = 'Halo';
  return sprite;
}
