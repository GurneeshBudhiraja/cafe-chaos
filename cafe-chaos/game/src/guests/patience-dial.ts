/**
 * The patience dot: over the head of each guest waiting to be seated, a
 * small round paper badge in the café's colours, with a timer ring round
 * its edge that empties clockwise as the guest's patience runs down, and
 * the seconds left in the middle. Moss while there is plenty, amber from
 * half, koi red for the last quarter, when the dot also gives a small
 * anxious throb. Under the number, one pip for each wish the guest has
 * (1 to 3), so a glance along the line says who is in a hurry and who is
 * hard to please. The wishes themselves are on the card beside the hand
 * (ui/wish-card.ts), when a hand is near the guest or carries it.
 *
 * When a hand is near its guest (the guest a pinch would take, whose card
 * is up beside the hand), the dot is lit: it grows by a third and a warm
 * lantern ring glows round it, easing in and out, so the card and its
 * guest are plainly one.
 *
 * A guest in a hurry has an hourglass at the top of its dot and a koi rim
 * (the shape says it as well as the colour); one of a pair has a small
 * heart in place of a pip, for the friend it wants to sit with.
 *
 * It is a sprite, so it always faces the player. Each dot has its own
 * small canvas, drawn again only when what it shows changes (the second,
 * a step of the ring).
 */

import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace } from '@iwsdk/core';
import { HAND_FONT } from '../ui/sketch.js';

/** The dot's size (metres across, café space) and how far above the guest's head anchor it floats. */
export const DIAL = { size: 0.026, above: 0.013 };
/** How many steps the ring empties in. */
const STEPS = 48;
/** The ring's colour by how much patience is left (the share at or below which each applies): koi, amber, moss. */
const COLOURS: [number, string][] = [
  [0.25, '#b8361a'],
  [0.5, '#c98a1e'],
  [1, '#3d6136'],
];
/** Below this share the dot throbs, this many times a second, by this much of its size. */
const THROB = { below: 0.25, rate: 2.4, depth: 0.12 };
/** Lit by a hand: how much larger, and how quickly it eases in and out (per second). */
const LIT = { grow: 0.35, ease: 14 };
const PX = 128;

export class PatienceDial {
  readonly sprite: Sprite;
  /** The share of patience it is showing (0 to 1). */
  left = 1;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly material: SpriteMaterial;
  private drawn = '';
  private time = Math.random() * 10;
  /** 0 to 1: how lit it is, eased. */
  private lit = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = PX;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false });
    this.sprite = new Sprite(this.material);
    this.sprite.name = 'PatienceDot';
    this.sprite.scale.setScalar(DIAL.size);
    this.sprite.renderOrder = 30;
    this.sprite.visible = false;
  }

  /**
   * Show `left` (0 to 1) of the patience and `seconds` left, with `pips`
   * wishes, at `opacity`; hidden when `shown` is false.
   */
  update(left: number, seconds: number, pips: number, shown: boolean, opacity: number, delta: number, lit = false, hurried = false, paired = false, cold = false): void {
    this.sprite.visible = shown && opacity > 0.02;
    this.lit += ((lit ? 1 : 0) - this.lit) * Math.min(1, LIT.ease * delta);
    if (!this.sprite.visible) return;
    this.left = Math.min(1, Math.max(0, left));
    const glow = Math.round(this.lit * 8) / 8;
    const key = `${Math.ceil(this.left * STEPS)}|${Math.max(0, Math.ceil(seconds))}|${pips}|${glow}|${hurried}|${paired}|${cold}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.draw(Math.ceil(this.left * STEPS) / STEPS, Math.max(0, Math.ceil(seconds)), pips, glow, hurried, paired, cold);
    }
    this.material.opacity = opacity;
    this.time += delta;
    const throb = this.left < THROB.below ? 1 + THROB.depth * Math.abs(Math.sin(this.time * THROB.rate * Math.PI)) : 1;
    this.sprite.scale.setScalar(DIAL.size * throb * (1 + LIT.grow * this.lit));
    // Lit, it draws over the other dots.
    this.sprite.renderOrder = this.lit > 0.5 ? 31 : 30;
  }

  private draw(left: number, seconds: number, pips: number, glow: number, hurried = false, paired = false, cold = false): void {
    const ctx = this.ctx;
    const c = PX / 2;
    const colour = COLOURS.find(([share]) => left <= share)![1];
    ctx.clearRect(0, 0, PX, PX);
    // Lit: a soft lantern glow behind it, and a lantern ring round the rim.
    if (glow > 0) {
      const g = ctx.createRadialGradient(c, c, c * 0.55, c, c, c);
      g.addColorStop(0, `rgba(255, 214, 140, ${0.85 * glow})`);
      g.addColorStop(1, 'rgba(255, 214, 140, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, PX, PX);
    }
    // A soft shadow, the timber rim, the paper.
    ctx.beginPath();
    ctx.arc(c, c + 2, c - 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30, 20, 12, 0.3)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.fillStyle = glow > 0.5 ? '#f0c987' : hurried ? '#b8361a' : '#66462f';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, c - 11, 0, Math.PI * 2);
    ctx.fillStyle = '#e8dfcf';
    ctx.fill();
    // The ring's track, and what is left of it (it empties clockwise from the top).
    const radius = c - 20;
    ctx.lineCap = 'round';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#cfc3ae';
    ctx.stroke();
    if (left > 0.01) {
      ctx.beginPath();
      ctx.arc(c, c, radius, -Math.PI / 2 + (1 - left) * Math.PI * 2, -Math.PI / 2 + Math.PI * 2);
      ctx.strokeStyle = colour;
      ctx.stroke();
    }
    // The seconds left, big, in the ring's colour when it is short.
    ctx.fillStyle = left <= 0.25 ? colour : '#16171d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${seconds >= 10 ? 40 : 46}px ${HAND_FONT}, 'Trebuchet MS', sans-serif`;
    ctx.fillText(`${seconds}`, c, c - 5);
    // One pip for each wish, under the number (a small heart first for a pair's friend).
    const n = Math.max(0, Math.min(3, pips));
    const gap = paired ? 16 : 12;
    for (let i = 0; i < n; i++) {
      const px = c + (i - (n - 1) / 2) * gap;
      ctx.fillStyle = paired && i === 0 ? '#c9772f' : '#5a4030';
      ctx.beginPath();
      if (paired && i === 0) {
        // A heart, twice a pip's size, so its shape reads (not only its colour).
        ctx.arc(px - 3.6, c + 21.5, 4.2, 0, Math.PI * 2);
        ctx.arc(px + 3.6, c + 21.5, 4.2, 0, Math.PI * 2);
        ctx.moveTo(px - 7.6, c + 23);
        ctx.lineTo(px, c + 31);
        ctx.lineTo(px + 7.6, c + 23);
      } else ctx.arc(px, c + 24, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // In a hurry: an hourglass over the top of the ring.
    if (hurried) {
      const hx = c;
      const hy = 13;
      // On a dark ink disc (not the koi of a ring running low), so a hurried guest low on patience still shows both.
      ctx.beginPath();
      ctx.arc(hx, hy + 1, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#2a1d14';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx - 6, hy - 7);
      ctx.lineTo(hx + 6, hy - 7);
      ctx.lineTo(hx, hy + 1);
      ctx.lineTo(hx + 6, hy + 9);
      ctx.lineTo(hx - 6, hy + 9);
      ctx.lineTo(hx, hy + 1);
      ctx.closePath();
      ctx.fillStyle = '#fbf2e1';
      ctx.fill();
    }
    // Cold (the Canadian café): a snowflake over the top of the ring, a shape as the hourglass is (beside it when both).
    if (cold) snowflake(ctx, hurried ? c - 30 : c, hurried ? 19 : 13);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
  }
}

/** A white six-armed snowflake on an ice-blue disc, centred at (x, y): the cold guest's mark. */
export function snowflake(ctx: CanvasRenderingContext2D, x: number, y: number, r = 14): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y + 1, r, 0, Math.PI * 2);
  ctx.fillStyle = '#3f86c9';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.17;
  const arm = r * 0.68;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.lineTo(x + dx * arm, y + 1 + dy * arm);
    // A small V near each tip.
    const bx = x + dx * arm * 0.6;
    const by = y + 1 + dy * arm * 0.6;
    for (const side of [-1, 1]) {
      const b = a + side * 0.7;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.sin(b) * arm * 0.35, by - Math.cos(b) * arm * 0.35);
    }
    ctx.stroke();
  }
  ctx.restore();
}
