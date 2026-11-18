/**
 * Popups: the little pictures that rise over a guest's head to say how a
 * visit went, read at a glance from the player's seat.
 *
 * - `up`: a mint badge with a thumbs up (a happy guest, leaving).
 * - `down`: a coral badge with a thumbs down (a guest who gave up, or
 *   stormed out without eating).
 * - `anger`: the red cross-shaped vein mark of a guest losing its temper
 *   at the table (it stays over the head while the guest fumes).
 * - `heart`, `shrug`: a guest's wish granted, or not; `note`: a singer's
 *   tune.
 * - `coins`: a gold coin and "+12", the money a guest paid (or "-2" in
 *   coral, what one who left unhappy cost).
 *
 * Each is a sprite (always facing the player), drawn once on a canvas and
 * shared. They float up a little and fade out. They are drawn over
 * everything (no depth test), so a roof or a wall never hides one.
 */

import { CanvasTexture, Group, Sprite, SpriteMaterial, SRGBColorSpace, type Vector3 } from '@iwsdk/core';
import { wishTexture } from './wish-art.js';
import { HAND_FONT } from '../ui/sketch.js';

export type PopupKind = 'up' | 'down' | 'anger' | 'heart' | 'shrug' | 'note';

/** Sizes (metres across, café space), how long a popup lasts and how far it rises (seconds, metres). */
export const POPUP = { size: 0.022, coinSize: 0.03, resultSize: 0.04, seconds: 1.8, rise: 0.035 };

interface Live {
  sprite: Sprite;
  age: number;
  /** Seconds it lasts; Infinity for one held until `release`. */
  lasts: number;
  y: number;
}

const pictures = new Map<string, CanvasTexture>();

/** A picture, drawn on first use and kept. */
function picture(key: string, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 128, h = 128): CanvasTexture {
  let texture = pictures.get(key);
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!, w, h);
  texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  pictures.set(key, texture);
  return texture;
}

/** A round badge with a soft shadow. */
function badge(ctx: CanvasRenderingContext2D, c: number, fill: string, rim: string): void {
  ctx.beginPath();
  ctx.arc(c, c + 3, c - 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(40, 24, 12, 0.3)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, c - 8, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = rim;
  ctx.stroke();
}

/** A rounded rectangle path. */
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A white thumbs up in the middle of a 128 px badge (flipped for down). */
function thumb(ctx: CanvasRenderingContext2D, down: boolean): void {
  ctx.save();
  if (down) {
    ctx.translate(128, 128);
    ctx.rotate(Math.PI);
  }
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = 'rgba(60, 40, 20, 0.35)';
  ctx.lineWidth = 3;
  // The cuff, the fist and the thumb.
  rounded(ctx, 30, 58, 14, 36, 4);
  ctx.fill();
  ctx.stroke();
  rounded(ctx, 48, 56, 44, 40, 10);
  ctx.fill();
  ctx.stroke();
  rounded(ctx, 52, 28, 17, 36, 8);
  ctx.fill();
  ctx.stroke();
  // The knuckle lines.
  ctx.beginPath();
  for (const y of [66, 76, 86]) {
    ctx.moveTo(70, y);
    ctx.lineTo(90, y);
  }
  ctx.stroke();
  ctx.restore();
}

const DRAW: Record<PopupKind, () => CanvasTexture> = {
  // How a wish came out (a heart, a shrug), and a singer's note: guests/wish-art.ts.
  heart: () => wishTexture('heart', false),
  shrug: () => wishTexture('shrug', false),
  note: () => wishTexture('note', false),
  up: () =>
    picture('up', (ctx) => {
      badge(ctx, 64, '#5fc48a', '#2f8f5b');
      thumb(ctx, false);
    }),
  down: () =>
    picture('down', (ctx) => {
      badge(ctx, 64, '#f2786a', '#b5473c');
      thumb(ctx, true);
    }),
  anger: () =>
    picture('anger', (ctx) => {
      // Four bulging red brackets round a gap: the cartoon vein mark.
      ctx.strokeStyle = '#e8402f';
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(64, 64);
        ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(-20, -42);
        ctx.quadraticCurveTo(0, -14, 20, -42);
        ctx.stroke();
        ctx.restore();
      }
    }),
};

/** A gold coin and "+n". */
function coinPicture(amount: number): CanvasTexture {
  return picture(
    `coin${amount}`,
    (ctx, w, h) => {
      const c = h / 2;
      ctx.beginPath();
      ctx.arc(c, c + 3, c - 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40, 24, 12, 0.3)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(c, c, c - 12, 0, Math.PI * 2);
      ctx.fillStyle = '#f6c445';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#b8811c';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c, c - 26, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = '800 64px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(60, 36, 16, 0.85)';
      const text = amount > 0 ? `+${amount}` : `${amount}`;
      ctx.strokeText(text, h + 4, c + 4);
      ctx.fillStyle = amount > 0 ? '#ffe9a8' : '#ff9a8a';
      ctx.fillText(text, h + 4, c + 4);
      void w;
    },
    256,
    128,
  );
}

export class Popups {
  /** Add this to the café group. */
  readonly group = new Group();
  private readonly live: Live[] = [];
  /** How many of each kind have been shown (for the checks). */
  readonly shown: Record<string, number> = {};

  constructor() {
    this.group.name = 'Popups';
  }

  /** Show a popup of `kind` at `at` (café space); returns it, so a held one (`hold`) can be let go later. */
  show(kind: PopupKind, at: Vector3, hold = false): Sprite {
    this.shown[kind] = (this.shown[kind] ?? 0) + 1;
    return this.add(DRAW[kind](), at, POPUP.size, 1, hold ? Infinity : POPUP.seconds);
  }

  /** Show the coins a guest paid (or cost, if negative) at `at` (café space). */
  coins(amount: number, at: Vector3): void {
    this.shown.coins = (this.shown.coins ?? 0) + 1;
    this.add(this.picture(`coin:${amount}`, () => coinPicture(amount)), at, POPUP.coinSize, 2, POPUP.seconds * 1.1);
  }

  /**
   * How a guest's wishes came out when it sat down: a lantern badge with
   * a tick and "2/3", or a star when every wish was met, a koi cross when
   * none was.
   */
  result(met: number, of: number, at: Vector3): void {
    this.shown.result = (this.shown.result ?? 0) + 1;
    if (met === of) this.shown.heart = (this.shown.heart ?? 0) + 1;
    if (met === 0) this.shown.shrug = (this.shown.shrug ?? 0) + 1;
    this.add(this.picture(`result:${met}/${of}`, () => resultPicture(met, of)), at, POPUP.resultSize, 2, POPUP.seconds * 1.4);
  }

  /** A popup's picture, drawn once and kept (a few dozen at most: the coin amounts and the wish results). */
  private readonly pictures = new Map<string, CanvasTexture>();
  private picture(key: string, draw: () => CanvasTexture): CanvasTexture {
    let t = this.pictures.get(key);
    if (!t) this.pictures.set(key, (t = draw()));
    return t;
  }

  /** Let a held popup go: it floats off and fades from now. */
  release(sprite: Sprite): void {
    const live = this.live.find((l) => l.sprite === sprite);
    if (live) {
      live.lasts = POPUP.seconds * 0.5;
      live.age = 0;
    }
  }

  /** Float, fade and clear. */
  update(delta: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const live = this.live[i];
      live.age += delta;
      const held = live.lasts === Infinity;
      const t = held ? 0 : Math.min(1, live.age / live.lasts);
      // A quick pop in, then a slow rise and fade; a held one throbs gently where it is.
      const pop = Math.min(1, live.age / 0.15);
      const throb = held ? 1 + 0.12 * Math.sin(live.age * 9) : 1;
      const base = live.sprite.userData.base as number;
      live.sprite.scale.set(base * pop * throb * live.sprite.userData.aspect, base * pop * throb, 1);
      live.sprite.position.y = live.y + POPUP.rise * (1 - (1 - t) * (1 - t));
      live.sprite.material.opacity = held ? 1 : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      if (t >= 1) {
        this.group.remove(live.sprite);
        live.sprite.material.dispose();
        this.live.splice(i, 1);
      }
    }
  }

  /** Clear them all (a new shift). */
  clear(): void {
    for (const live of this.live) {
      this.group.remove(live.sprite);
      live.sprite.material.dispose();
    }
    this.live.length = 0;
  }

  private add(map: CanvasTexture, at: Vector3, size: number, aspect: number, lasts: number): Sprite {
    const material = new SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new Sprite(material);
    sprite.renderOrder = 20;
    sprite.position.copy(at);
    sprite.userData.base = size;
    sprite.userData.aspect = aspect;
    sprite.scale.set(0.0001, 0.0001, 1);
    this.group.add(sprite);
    this.live.push({ sprite, age: 0, lasts, y: at.y });
    return sprite;
  }
}

/** The result badge: a lantern-coloured tag with a timber rim; a tick and "2/3", a star for all, a cross for none. */
function resultPicture(met: number, of: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const all = met === of;
  const none = met === 0;
  ctx.fillStyle = 'rgba(30, 20, 12, 0.3)';
  ctx.beginPath();
  ctx.roundRect(8, 12, 176, 78, 18);
  ctx.fill();
  ctx.fillStyle = '#66462f';
  ctx.beginPath();
  ctx.roundRect(6, 6, 180, 80, 18);
  ctx.fill();
  ctx.fillStyle = all ? '#f0c987' : none ? '#e8c2b6' : '#e8dfcf';
  ctx.beginPath();
  ctx.roundRect(13, 13, 166, 66, 13);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = all ? '#2f522d' : none ? '#9a2208' : '#16171d';
  ctx.font = `800 46px ${HAND_FONT}, 'Trebuchet MS', sans-serif`;
  ctx.fillText(`${all ? '★' : none ? '✕' : '✓'} ${met}/${of}`, 96, 48);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
