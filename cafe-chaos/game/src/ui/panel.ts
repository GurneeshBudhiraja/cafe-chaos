/**
 * A panel: a paper card that floats over the café and turns to face the
 * player, drawn on a canvas, with buttons pressed by pinching on them.
 * The title screen, the rules, the walkthrough's coach card, the
 * end-of-shift card and the scoreboard are all panels.
 *
 * The look is the café's: cream paper, a walnut rim, warm brown ink, and
 * buttons like little lacquered tags (amber for the main one, cream for
 * the rest). A hand over a button lights it up; a pinch closing on it
 * presses it (a quick dip), as a pinch on a guest picks it up.
 *
 * Sizes are in the café's space (metres before the café is scaled), so a
 * panel grows and shrinks with the café, as everything else does.
 */

import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';

export interface Button {
  id: string;
  label: string;
  /** Where it is on the canvas (pixels). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The main action is amber; the others cream. */
  primary?: boolean;
}

/** The café's palette for paper things. */
export const INK = {
  paper: '#fbf2e1',
  paperDeep: '#f1e2c6',
  rim: '#6b4529',
  ink: '#4a2f1c',
  inkSoft: '#8a6a4f',
  amber: '#f2a95b',
  amberDeep: '#c9772f',
  mint: '#5fc48a',
  coral: '#f2786a',
  gold: '#f6c445',
};

/** A pinch within this of the panel's face (metres, world) counts as on it. */
const REACH_M = 0.035;
/** Pixels per metre of panel (café space). */
const PPM = 2400;

export class Panel {
  readonly mesh: Mesh;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  buttons: Button[] = [];
  /** The button a hand is over, and the one just pressed (with how long ago, seconds). */
  hover: string | null = null;
  private pressed: { id: string; t: number } | null = null;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private content: (ctx: CanvasRenderingContext2D, w: number, h: number) => void = () => {};
  /** 0 hidden to 1 shown, eased; and where it is heading. */
  private shown = 0;
  private want = false;
  private readonly local = new Vector3();
  private readonly scale = new Vector3();

  constructor(name: string, widthM: number, heightM: number) {
    this.canvas = document.createElement('canvas');
    this.width = this.canvas.width = Math.round(widthM * PPM);
    this.height = this.canvas.height = Math.round(heightM * PPM);
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, side: DoubleSide, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), this.material);
    this.mesh.name = name;
    this.mesh.renderOrder = 30;
    this.mesh.visible = false;
    this.mesh.userData.dynamic = true;
  }

  /** True while it is up (or coming up). */
  get open(): boolean {
    return this.want;
  }

  /** Set what the card shows (and its buttons), and draw it. */
  set(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, buttons: Button[] = []): void {
    this.content = draw;
    this.buttons = buttons;
    this.hover = null;
    this.paint();
  }

  /** Bring it up, or put it away. */
  show(on: boolean): void {
    this.want = on;
  }

  /** Draw it again (for content that changes: a clock, a meter). */
  paint(): void {
    const { ctx, width: w, height: h } = this;
    ctx.clearRect(0, 0, w, h);
    card(ctx, w, h);
    this.content(ctx, w, h);
    for (const b of this.buttons) drawButton(ctx, b, this.hover === b.id, this.pressed?.id === b.id);
    this.texture.needsUpdate = true;
  }

  /**
   * Each frame: ease in or out, and turn to face the player's head
   * (`head`, world). Returns true while it shows.
   */
  update(delta: number, head: Vector3): boolean {
    const target = this.want ? 1 : 0;
    this.shown += (target - this.shown) * (1 - Math.exp(-12 * delta));
    if (Math.abs(this.shown - target) < 0.01) this.shown = target;
    this.mesh.visible = this.shown > 0;
    if (!this.mesh.visible) return false;
    this.material.opacity = this.shown;
    const s = 0.9 + 0.1 * this.shown;
    this.mesh.scale.set(s, s, s);
    this.mesh.lookAt(head);
    if (this.pressed) {
      this.pressed.t += delta;
      if (this.pressed.t > 0.18) {
        this.pressed = null;
        this.paint();
      }
    }
    return true;
  }

  /** The button under a world point, if the point is on the card's face (within reach of it). */
  hit(point: Vector3): Button | null {
    if (!this.want || this.shown < 0.6) return null;
    const local = this.mesh.worldToLocal(this.local.copy(point));
    this.mesh.getWorldScale(this.scale);
    const params = (this.mesh.geometry as PlaneGeometry).parameters;
    if (Math.abs(local.z) * this.scale.z > REACH_M) return null;
    const px = (local.x / params.width + 0.5) * this.width;
    const py = (0.5 - local.y / params.height) * this.height;
    const pad = this.height * 0.02;
    return this.buttons.find((b) => px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad) ?? null;
  }

  /** Is a world point over the card at all (within reach of its face)? */
  covers(point: Vector3): boolean {
    if (!this.want) return false;
    const local = this.mesh.worldToLocal(this.local.copy(point));
    this.mesh.getWorldScale(this.scale);
    const params = (this.mesh.geometry as PlaneGeometry).parameters;
    return Math.abs(local.z) * this.scale.z < REACH_M * 1.5 && Math.abs(local.x) < params.width * 0.55 && Math.abs(local.y) < params.height * 0.55;
  }

  /** Light up the button a hand is over (null: none). */
  setHover(id: string | null): void {
    if (id === this.hover) return;
    this.hover = id;
    this.paint();
  }

  /** Show a press on a button (the little dip). */
  press(id: string): void {
    this.pressed = { id, t: 0 };
    this.paint();
  }
}

// ----------------------------------------------------------- drawing helpers

/** A rounded rectangle path. */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The paper card: a soft shadow, the walnut rim, the cream paper with a faint warm wash. */
function card(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const r = Math.min(w, h) * 0.08;
  const m = Math.min(w, h) * 0.03;
  ctx.save();
  ctx.shadowColor = 'rgba(30, 16, 6, 0.45)';
  ctx.shadowBlur = m * 0.9;
  ctx.shadowOffsetY = m * 0.25;
  roundRect(ctx, m, m, w - 2 * m, h - 2 * m, r);
  ctx.fillStyle = INK.rim;
  ctx.fill();
  ctx.restore();
  const inset = m + Math.min(w, h) * 0.018;
  roundRect(ctx, inset, inset, w - 2 * inset, h - 2 * inset, r * 0.8);
  const wash = ctx.createLinearGradient(0, inset, 0, h - inset);
  wash.addColorStop(0, INK.paper);
  wash.addColorStop(1, INK.paperDeep);
  ctx.fillStyle = wash;
  ctx.fill();
}

/** A button: a rounded tag with its label; lighter with a glow while a hand is over it, dipped while pressed. */
function drawButton(ctx: CanvasRenderingContext2D, b: Button, hover: boolean, pressed: boolean): void {
  const r = b.h * 0.42;
  const dip = pressed ? b.h * 0.06 : 0;
  ctx.save();
  if (hover) {
    ctx.shadowColor = b.primary ? 'rgba(255, 190, 110, 0.95)' : 'rgba(255, 210, 150, 0.9)';
    ctx.shadowBlur = b.h * 0.45;
  } else {
    ctx.shadowColor = 'rgba(60, 36, 16, 0.35)';
    ctx.shadowBlur = b.h * 0.12;
    ctx.shadowOffsetY = b.h * 0.06;
  }
  roundRect(ctx, b.x, b.y + dip, b.w, b.h, r);
  ctx.fillStyle = b.primary ? (pressed ? INK.amberDeep : hover ? '#ffc07a' : INK.amber) : pressed ? INK.paperDeep : hover ? '#fffaf0' : '#f7ead2';
  ctx.fill();
  ctx.restore();
  roundRect(ctx, b.x, b.y + dip, b.w, b.h, r);
  ctx.lineWidth = b.h * 0.06;
  ctx.strokeStyle = b.primary ? INK.amberDeep : '#c9a77d';
  ctx.stroke();
  ctx.fillStyle = INK.ink;
  ctx.font = `700 ${Math.round(b.h * 0.42)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + dip + b.h * 0.02);
}

/** Text in the café's ink: `size` as a share of the card's height. */
export function write(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, options: { weight?: number; color?: string; align?: CanvasTextAlign; font?: string } = {}): void {
  ctx.fillStyle = options.color ?? INK.ink;
  ctx.font = `${options.weight ?? 600} ${Math.round(size)}px ${options.font ?? 'sans-serif'}`;
  ctx.textAlign = options.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** Wrap text to a width; returns the lines. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Write wrapped text from (x, y) down; returns the y below it. */
export function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, options: { color?: string; align?: CanvasTextAlign; weight?: number; lineHeight?: number } = {}): number {
  ctx.font = `${options.weight ?? 500} ${Math.round(size)}px sans-serif`;
  const step = size * (options.lineHeight ?? 1.32);
  for (const line of wrap(ctx, text, width)) {
    write(ctx, line, x, y, size, { weight: options.weight ?? 500, color: options.color ?? INK.ink, align: options.align ?? 'left' });
    y += step;
  }
  return y;
}

/** A little gold coin, `r` in radius, centred at (x, y). */
export function coin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = INK.gold;
  ctx.fill();
  ctx.lineWidth = r * 0.18;
  ctx.strokeStyle = '#b8811c';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.1;
  ctx.stroke();
}

/** A simple face: happy, middling or sad by `mood` (0 to 1), in a coloured disc. */
export function moodFace(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, mood: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = moodColour(mood);
  ctx.fill();
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = 'rgba(74, 47, 28, 0.5)';
  ctx.stroke();
  ctx.fillStyle = INK.ink;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + side * r * 0.36, y - r * 0.2, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  const curve = (mood - 0.5) * 2;
  ctx.moveTo(x - r * 0.4, y + r * 0.3);
  ctx.quadraticCurveTo(x, y + r * 0.3 + curve * r * 0.4, x + r * 0.4, y + r * 0.3);
  ctx.lineWidth = r * 0.12;
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK.ink;
  ctx.stroke();
}

/** Mint when the café is happy, amber in the middle, coral when it is not. */
export function moodColour(mood: number): string {
  return mood > 0.6 ? INK.mint : mood > 0.3 ? INK.amber : INK.coral;
}
