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
 * a step of the ring). The dots share one texture on the GPU (`DialAtlas`):
 * each has a cell in it, and a dot drawn again is copied into its own cell
 * only (a small upload, not a texture of its own). At most
 * DialAtlas.PER_FRAME cells are copied in a frame; the rest wait a frame.
 */

import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Texture, Vector2, type WebGLRenderer } from '@iwsdk/core';
import { HAND_FONT } from '../ui/sketch.js';
import { COUNTS, PROBE } from '../lib/probe.js';

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

/**
 * The texture all the dots draw from: a grid of PX cells. A dot's canvas is
 * copied into its cell when it changes (`flush`, once a frame).
 */
export class DialAtlas {
  /** Cells across and down. */
  static readonly COLS = 8;
  static readonly ROWS = 4;
  /** Cells copied in one frame at most (the others wait their turn). */
  static readonly PER_FRAME = 2;
  readonly texture: CanvasTexture;
  private readonly free: number[] = [];
  private readonly dirty = new Set<PatienceDial>();
  private ready = false;
  private readonly at = new Vector2();

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = DialAtlas.COLS * PX;
    canvas.height = DialAtlas.ROWS * PX;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.name = 'DialAtlas';
    for (let i = DialAtlas.COLS * DialAtlas.ROWS - 1; i >= 0; i--) this.free.push(i);
  }

  /** A free cell, or -1 when all are taken (that dot then has a texture of its own). */
  take(): number {
    return this.free.pop() ?? -1;
  }

  give(cell: number, dial: PatienceDial): void {
    this.dirty.delete(dial);
    if (cell >= 0) this.free.push(cell);
  }

  /** The dot's picture changed: copy it in at the next flush. */
  mark(dial: PatienceDial): void {
    this.dirty.add(dial);
  }

  /** How many cells wait to be copied (for the checks). */
  get waiting(): number {
    return this.dirty.size;
  }

  /** Copy the changed cells in, the longest waiting first, at most PER_FRAME. */
  flush(renderer: WebGLRenderer): void {
    if (this.dirty.size === 0) return;
    if (!this.ready) {
      renderer.initTexture(this.texture);
      this.ready = true;
    }
    let n = 0;
    for (const dial of this.dirty) {
      if (n++ >= DialAtlas.PER_FRAME) break;
      this.dirty.delete(dial);
      const cell = dial.cell;
      // Texture space counts rows from the bottom; the copy is turned upright as it goes in (the atlas's flipY).
      this.at.set((cell % DialAtlas.COLS) * PX, Math.floor(cell / DialAtlas.COLS) * PX);
      renderer.copyTextureToTexture(dial.source, this.texture, null, this.at);
      COUNTS.dotCopies++;
    }
  }
}

export class PatienceDial {
  readonly sprite: Sprite;
  /** The share of patience it is showing (0 to 1). */
  left = 1;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** The texture it draws with: its cell of the atlas (or its own, when the atlas is full). */
  private readonly texture: Texture;
  /** Its canvas as a texture the renderer never draws with: only copied into the atlas. */
  readonly source: Texture;
  /** Its cell in the atlas (-1: none). */
  readonly cell: number;
  private readonly material: SpriteMaterial;
  private drawn = '';
  private time = Math.random() * 10;
  /** 0 to 1: how lit it is, eased. */
  private lit = 0;

  constructor(private readonly atlas: DialAtlas | null = null) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = PX;
    this.ctx = this.canvas.getContext('2d')!;
    this.source = new Texture(this.canvas);
    this.cell = atlas ? atlas.take() : -1;
    if (atlas && this.cell >= 0) {
      // Its cell of the shared texture (a copy of the texture object: the same image on the GPU).
      this.texture = atlas.texture.clone();
      this.texture.repeat.set(1 / DialAtlas.COLS, 1 / DialAtlas.ROWS);
      this.texture.offset.set((this.cell % DialAtlas.COLS) / DialAtlas.COLS, Math.floor(this.cell / DialAtlas.COLS) / DialAtlas.ROWS);
    } else {
      this.texture = new CanvasTexture(this.canvas);
      this.texture.colorSpace = SRGBColorSpace;
    }
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
    // The ring steps with the seconds shown (the share at that whole second), so a dot is drawn again at most once a
    // second as its patience runs (not once for the number and again for the ring): each drawing is a copy into the
    // atlas, and with a full line those copies added up (the probe's upload count, the owner's Quest playtest).
    const whole = Math.max(0, Math.ceil(seconds));
    const total = this.left > 0.001 ? seconds / this.left : 0;
    const ring = total > 0 ? Math.min(1, whole / total) : Math.ceil(this.left * STEPS) / STEPS;
    const key = `${whole}|${Math.round(ring * 1000)}|${pips}|${glow}|${hurried}|${paired}|${cold}`;
    // `?nodials` (lib/probe.ts): drawn once, never again (no texture uploads for the dots during play).
    if (key !== this.drawn && !(PROBE.noDials && this.drawn)) {
      this.drawn = key;
      this.draw(ring, whole, pips, glow, hurried, paired, cold);
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
    if (this.atlas && this.cell >= 0) this.atlas.mark(this);
    else this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
    this.atlas?.give(this.cell, this);
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
