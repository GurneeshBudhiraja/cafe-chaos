/**
 * A panel: a paper card that turns to face the player, drawn on a
 * canvas, with buttons. The title screen, How to play, the first run's
 * coach card, the pause and closing cards and the side board are all
 * panels.
 *
 * The look is the café's: cream paper, a walnut rim, warm brown ink, and
 * buttons like little lacquered tags (amber for the main one, cream for
 * the rest).
 *
 * Buttons are pressed with a fingertip, as Meta's guidance for direct
 * touch asks: the index fingertip coming near lights the button, and
 * pushing it through the card's face presses it (a quick dip). It must
 * come back out before it can press again, and a finger that arrives
 * from behind the card presses nothing. A pinch on a button presses it
 * too, for players who reach for it that way.
 *
 * A panel's place is in the café's space, so it moves with the café; its
 * size is in real metres and stays the same however small the café is
 * made, so buttons never shrink below what a finger can press (22 mm).
 */

import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from '@iwsdk/core';

export interface Button {
  id: string;
  /** Its words; a button that draws itself (`draw`) may have none. */
  label?: string;
  /** Where it is on the canvas (pixels). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The main action is amber; the others cream. */
  primary?: boolean;
  /** Not available just now: drawn pale. It can still be pressed (the game says no). */
  off?: boolean;
  /** Draws what is on the button, in place of the label. */
  draw?: (ctx: CanvasRenderingContext2D, b: Button, hover?: boolean, pressed?: boolean) => void;
  /** Draw nothing but `draw` (the button draws its own background and frame). */
  bare?: boolean;
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
/**
 * A fingertip (metres in front of the card's face, world): it lights a
 * button from `hover` away, presses on coming within `press`, and can
 * press again once it has drawn back past `rearm`. One that is more
 * than `behind` past the face is not touching the card at all.
 *
 * The hand tracking gives the index tip joint, which is inside the
 * finger, about `FINGER_RADIUS` behind the pad that touches. So the
 * press is at the pad meeting the face, as Meta's poke interactions do
 * (they offset the tip by the finger's radius): the button goes the
 * moment the finger touches it, never only once it has been pushed a
 * centimetre past. Drawing back 1.4 cm from there lets it press again.
 */
const FINGER_RADIUS = 0.009;
const TOUCH = { hover: 0.05, press: FINGER_RADIUS + 0.002, rearm: FINGER_RADIUS + 0.014, behind: 0.03 };
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
  /** Each fingertip's last distance in front of the face, and whether it may press. */
  private readonly tips = new Map<string, { z: number; armed: boolean }>();
  /**
   * How quickly it turns to face the player (per second); Infinity turns at once. A board that is pressed with a
   * fingertip turns slowly, so a nod of the head never swings its face through a finger held near it.
   */
  turn = Infinity;
  /**
   * Dimmed behind a card opened in front of it (true): it fades to about 60%
   * brightness and takes no presses (the game skips it) until the card in
   * front closes.
   */
  dimmed = false;
  private dimNow = 0;
  /** Draw the paper card behind the content (false: the content draws its own). */
  frame = true;
  /** Draw over everything in the scene (nothing in front of it hides it). */
  set onTop(on: boolean) {
    this.material.depthTest = !on;
    this.mesh.renderOrder = on ? 40 : 30;
  }
  private readonly facing = new Quaternion();
  private faced = false;

  /** Face the player at once on the next update (then turn at `turn` as before; `turn = 0` keeps it still). */
  faceNow(): void {
    this.faced = false;
  }

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
    if (this.frame) card(ctx, w, h);
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
    this.dimNow += ((this.dimmed ? 1 : 0) - this.dimNow) * (1 - Math.exp(-14 * delta));
    this.material.color.setScalar(1 - 0.42 * this.dimNow);
    // Its size is in real metres, whatever the café's scale.
    const parent = this.mesh.parent ? this.mesh.parent.getWorldScale(this.scale).x : 1;
    const s = (0.9 + 0.1 * this.shown) / (parent || 1);
    this.mesh.scale.set(s, s, s);
    if (this.turn === Infinity || !this.faced) {
      this.mesh.lookAt(head);
      this.facing.copy(this.mesh.quaternion);
      this.faced = true;
    } else {
      this.mesh.lookAt(head);
      this.facing.slerp(this.mesh.quaternion, 1 - Math.exp(-this.turn * delta));
      this.mesh.quaternion.copy(this.facing);
    }
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

  /**
   * A fingertip (`tip`, world; null when its hand is not tracked), known
   * by `key` (its hand). Returns the button it is over, and the button it
   * has just pressed (once per push through the face).
   */
  touch(key: string, tip: Vector3 | null): { over: Button | null; pressed: Button | null } {
    let state = this.tips.get(key);
    if (!state) this.tips.set(key, (state = { z: Infinity, armed: false }));
    if (!tip || !this.want || this.shown < 0.6) {
      state.z = Infinity;
      state.armed = false;
      return NO_TOUCH;
    }
    const local = this.mesh.worldToLocal(this.local.copy(tip));
    this.mesh.getWorldScale(this.scale);
    const z = local.z * this.scale.z;
    const params = (this.mesh.geometry as PlaneGeometry).parameters;
    const px = (local.x / params.width + 0.5) * this.width;
    const py = (0.5 - local.y / params.height) * this.height;
    const pad = this.height * 0.015;
    const under = z <= TOUCH.hover && z >= -TOUCH.behind ? (this.buttons.find((b) => px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad) ?? null) : null;
    // Drawn back far enough (or seen in front for the first time): it may press.
    if (z > TOUCH.rearm) state.armed = true;
    let pressed: Button | null = null;
    if (under && state.armed && z <= TOUCH.press && state.z > TOUCH.press) {
      pressed = under;
      state.armed = false;
    }
    state.z = z;
    this.touched.over = under;
    this.touched.pressed = pressed;
    return this.touched;
  }
  private readonly touched: { over: Button | null; pressed: Button | null } = { over: null, pressed: null };

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

const NO_TOUCH: { over: Button | null; pressed: Button | null } = { over: null, pressed: null };

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
  if (b.bare && b.draw) {
    b.draw(ctx, b, hover, pressed);
    return;
  }
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
  ctx.fillStyle = b.off ? (hover ? '#f1e6cf' : '#e9dcc3') : b.primary ? (pressed ? INK.amberDeep : hover ? '#ffc07a' : INK.amber) : pressed ? INK.paperDeep : hover ? '#fffaf0' : '#f7ead2';
  ctx.fill();
  ctx.restore();
  roundRect(ctx, b.x, b.y + dip, b.w, b.h, r);
  ctx.lineWidth = Math.max(2, b.h * 0.05);
  ctx.strokeStyle = b.off ? '#cdb898' : b.primary ? INK.amberDeep : '#c9a77d';
  ctx.stroke();
  if (b.draw) {
    ctx.save();
    ctx.translate(0, dip);
    b.draw(ctx, b);
    ctx.restore();
    return;
  }
  if (!b.label) return;
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
