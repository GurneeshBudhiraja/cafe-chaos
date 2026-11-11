/**
 * The patience dial: a cute little timer over the head of each guest in
 * the line. A round cream badge, like one of the café's paper lanterns
 * seen end on, with a ring that empties clockwise as the guest's
 * patience runs down: mint while there is plenty, amber from half, coral
 * for the last quarter, when the whole dial also gives a small anxious
 * throb. A glance along the line says who to seat first.
 *
 * It is a sprite, so it always faces the player. The faces are drawn
 * once (a couple of dozen small pictures, shared by every guest); a dial
 * only switches which one it shows.
 */

import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace } from '@iwsdk/core';

/** The dial's size (metres across) and how far above the guest's head anchor it floats. */
export const DIAL = { size: 0.017, above: 0.011 };
/** How many pictures the ring's emptying is drawn in. */
const STEPS = 24;
/** The ring's colour by how much patience is left (the share at or below which each applies). */
const COLOURS: [number, string][] = [
  [0.25, '#ff7a66'],
  [0.5, '#ffc05c'],
  [1, '#86d6a0'],
];
/** Below this share the dial throbs, this many times a second, by this much of its size. */
const THROB = { below: 0.25, rate: 2.4, depth: 0.14 };

let faces: CanvasTexture[] | undefined;

/** The dial with `left` (0 to 1) of its ring remaining. */
function drawFace(left: number): CanvasTexture {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  // A soft shadow, then the cream badge with a warm rim.
  ctx.beginPath();
  ctx.arc(c, c + 2, c - 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(40, 24, 12, 0.28)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, c - 7, 0, Math.PI * 2);
  ctx.fillStyle = '#fdf3e2';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#d9b98f';
  ctx.stroke();
  // The ring's track, and what is left of the ring (it empties clockwise from the top).
  const radius = c - 19;
  ctx.lineCap = 'round';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#eadbc4';
  ctx.stroke();
  const colour = COLOURS.find(([share]) => left <= share)![1];
  if (left > 0.01) {
    ctx.beginPath();
    ctx.arc(c, c, radius, -Math.PI / 2 + (1 - left) * Math.PI * 2, -Math.PI / 2 + Math.PI * 2);
    ctx.strokeStyle = colour;
    ctx.stroke();
  }
  // A small heart in the middle, in the ring's colour: it is the guest's goodwill that is running out.
  const h = 9;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(c, c + h * 0.95);
  ctx.bezierCurveTo(c - h * 1.9, c - h * 0.3, c - h * 0.9, c - h * 1.5, c, c - h * 0.45);
  ctx.bezierCurveTo(c + h * 0.9, c - h * 1.5, c + h * 1.9, c - h * 0.3, c, c + h * 0.95);
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The pictures, drawn the first time a dial is made. */
function allFaces(): CanvasTexture[] {
  faces ??= Array.from({ length: STEPS + 1 }, (_, i) => drawFace(i / STEPS));
  return faces;
}

export class PatienceDial {
  readonly sprite: Sprite;
  /** The share of patience it is showing (0 to 1). */
  left = 1;
  private readonly material: SpriteMaterial;
  private time = Math.random() * 10;

  constructor() {
    this.material = new SpriteMaterial({ map: allFaces()[STEPS], transparent: true, depthWrite: false, toneMapped: false });
    this.sprite = new Sprite(this.material);
    this.sprite.name = 'PatienceDial';
    this.sprite.scale.setScalar(DIAL.size);
    this.sprite.renderOrder = 30;
    this.sprite.visible = false;
  }

  /** Show `left` (0 to 1) of the patience, at `opacity`; hidden when `shown` is false. */
  update(left: number, shown: boolean, opacity: number, delta: number): void {
    this.sprite.visible = shown && opacity > 0.02;
    if (!this.sprite.visible) return;
    this.left = Math.min(1, Math.max(0, left));
    const face = allFaces()[Math.ceil(this.left * STEPS)];
    if (this.material.map !== face) this.material.map = face;
    this.material.opacity = opacity;
    this.time += delta;
    const throb = this.left < THROB.below ? 1 + THROB.depth * Math.abs(Math.sin(this.time * THROB.rate * Math.PI)) : 1;
    this.sprite.scale.setScalar(DIAL.size * throb);
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.material.dispose();
  }
}
