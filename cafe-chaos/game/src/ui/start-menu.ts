/**
 * The start menu: a card that stands a metre in front of the player,
 * facing them, pressed with the hand ray (point and pinch), as Quest's own
 * panels are (GameSystem places it and casts the ray). It is drawn in the café's own colours with a timber frame
 * round shoji paper, and its lines boil (redrawn with a new seed ten times
 * a second) while it is up.
 *
 * The start card is wide, the cover art on the left and the buttons on
 * the right, so it stays short: its top edge sits a little under eye
 * level and the whole card in the comfortable band below it (sideways
 * looking is easier than up and down), inside Meta VR Glasses' design
 * area. The pause card and the shop are the same shape.
 *
 *   ┌──────────────┬──────────────────────┐
 *   │ [BEST 5:40]  │               [Quit] │
 *   │  cover art   │ [      CONTINUE    ] │   40 coins · 2 baristas
 *   │              │ [      NEW GAME    ] │
 *   │  CAFÉ CHAOS  │ [? How to play][⚙ Settings]
 *   └──────────────┴──────────────────────┘
 *
 * The first time (no save) there is only NEW GAME, and it is bigger. With
 * no best time there is no badge. Quit sits at the top right, out of the
 * way of the buttons pressed often, and asks first. Settings, the New
 * Game warning and the Quit question open on a second card in front of it
 * (`sheet`): the card behind is dimmed and does not take presses until the
 * sheet closes.
 *
 * Everything is drawn in design units (720 across) and scaled to the panel.
 */

import { LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, VideoTexture } from '@iwsdk/core';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { HowToStep } from '../game/how-to-play.js';
import type { Options } from 'roughjs/bin/core';
import { Panel, type Button } from './panel.js';
import { hand, pen, SKETCH, sketchCoin } from './sketch.js';

/** The sheet's size (metres): 24 cm across (Settings, the New Game warning, Quit). */
export const MENU_SIZE = { width: 0.24, height: 0.28, sheetHeight: 0.21 };
/** The menu card (start, pause, shop): wide and short (metres), 960 by 600 design units. */
export const START_SIZE = { width: 0.32, height: 0.2 };
/**
 * How to play: one step at a time, as on the web page (index.html #how):
 * the step's video (looping, silent) on the left, its title and line on
 * the right, PREVIOUS and NEXT along the bottom (DONE on the last step),
 * and a close button at the top right. Wide and short like the start card
 * (38 by 21 cm, drawn in 1080 design units), so at a metre and twice the
 * size it stays inside Meta VR Glasses' design area (58 by 54 degrees)
 * and the 0 to 35 degrees below the eyes that is comfortable to look at.
 * The steps come from game/how-to-play.ts.
 */
export const HOW_SIZE = { width: 0.38, height: 0.21 };
const HW = 1080;
/** Canvas pixels per metre of panel (as ui/panel.ts). */
const PPM = 2400;
/** The video's frame on the How to play card (design units): 16:9, centred. */
const HOW_VIDEO = { width: 520, height: 293 };
/**
 * A lit button's paper: deep enough to see at a glance on the shoji paper
 * (#d9cfbe) through the headset; the ink on it stays well readable (navy on
 * the plain one about 9:1, koi red on the red tint about 4.4:1).
 */
const HOVER = { plain: '#c4b397', danger: '#e8b2a2' };
/** Design units across. */
const W = 720;
const PAD = 36;
const GAP = 24;
/** Between two things you press: 40 design units (about 13 mm), over Meta's 12 mm. */
const TOUCH_GAP = 40;
const BOIL_HZ = 10;
/** Volume and size steps. */
export const LEVELS = 5;

export interface StartState {
  /** 'first': no save. 'returning': a save to continue. */
  kind: 'first' | 'returning';
  coins: number;
  staff: number;
  /** The level the save is on. */
  level: number;
}
export interface SettingsState {
  music: number;
  sounds: number;
}
/** The pause card: the level, and guests served in it of the number that passes it. */
export interface PauseState {
  level: number;
  served: number;
  goal: number;
}
/** The level card: the level just reached, the coins it gives, and the guests to serve to pass it. */
export interface LevelState {
  level: number;
  bonus: number;
  goal: number;
}
/** The card when the café's happiness ran out: the level, and how far it got. */
export interface FailState {
  level: number;
  served: number;
  goal: number;
  /** Guests who left unhappy in the level: why the happiness ran out. */
  left: number;
}
/** The shop: the bank, and each barista in hiring order. */
export interface ShopState {
  coins: number;
  rows: {
    name: string;
    /** 'working': hired (or the first). 'hire': next, and the bank can pay. 'short': next, and it cannot. 'later': after the next. */
    status: 'working' | 'hire' | 'short' | 'later';
    price?: number;
  }[];
}
export interface WarnState {
  coins: number;
  staff: number;
  level: number;
}

let cover: HTMLImageElement | null = null;
const coverListeners: (() => void)[] = [];
if (typeof Image !== 'undefined') {
  const img = new Image();
  img.onload = () => {
    cover = img;
    for (const f of coverListeners) f();
  };
  img.src = `${import.meta.env.BASE_URL}ui/cover.jpg`;
}

const font = (size: number, heavy = true): string => hand(size, heavy ? 700 : 400);

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', heavy = true): void {
  ctx.font = font(size, heavy);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/** The menu's two cards and their boil. */
export class StartMenu {
  readonly card = new Panel('StartCard', START_SIZE.width, START_SIZE.height);
  readonly sheet = new Panel('MenuSheet', MENU_SIZE.width, MENU_SIZE.sheetHeight);
  readonly how = new Panel('HowCard', HOW_SIZE.width, HOW_SIZE.height);
  private howSteps: readonly HowToStep[] = [];
  /** The step How to play shows (0-based). */
  howIndex = 0;
  /** Each step's still picture, by its path, once loaded. */
  private readonly posters = new Map<string, HTMLImageElement | null>();
  /** The step's video: one element, its texture on a plane laid over the card's picture frame. */
  private readonly video: HTMLVideoElement | null = typeof document !== 'undefined' ? document.createElement('video') : null;
  private videoPlane: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  private videoFor = '';
  /** Players who ask the system for less motion see the still picture, not the clip. */
  private readonly still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** What the sheet shows ('none' when it is closed). */
  sheetKind: 'none' | 'settings' | 'warn' | 'quit' = 'none';
  /** What the card shows: the start menu, or (in a run) the pause card or the shop. */
  cardKind: 'start' | 'pause' | 'shop' | 'level' | 'failed' = 'start';
  private seed = 1;
  private clock = 0;
  private start: StartState = { kind: 'first', coins: 0, staff: 1, level: 1 };
  private settings: SettingsState = { music: 2, sounds: 3 };
  private warn: WarnState = { coins: 0, staff: 1, level: 1 };
  private readonly k: number;
  /** How to play's scale (metres per design unit). */
  private readonly kh: number;

  constructor() {
    for (const p of [this.card, this.sheet, this.how]) {
      p.frame = false;
      p.turn = 3;
    }
    // Design units to canvas pixels: from the sheet (24 cm, 720 units), which never changes size; every card uses the same scale.
    this.k = this.sheet.width / W;
    this.kh = this.how.width / HW;
    coverListeners.push(() => this.card.paint());
  }

  /** How to play, in front of the eyes where the start card stands (the game hides the card behind), from `index`. */
  showHow(steps: readonly HowToStep[], index = 0): void {
    this.howSteps = steps;
    this.howIndex = Math.max(0, Math.min(steps.length - 1, index));
    for (const step of steps) this.loadPoster(step.poster);
    this.layoutHow();
    this.how.show(true);
  }

  /** The next or the previous step (`by` +1 or -1). False when there is none that way. */
  howStep(by: number): boolean {
    const to = this.howIndex + by;
    if (to < 0 || to >= this.howSteps.length) return false;
    this.howIndex = to;
    this.layoutHow();
    return true;
  }

  private loadPoster(path: string): void {
    if (this.posters.has(path) || typeof Image === 'undefined') return;
    this.posters.set(path, null);
    const img = new Image();
    img.onload = () => {
      this.posters.set(path, img);
      if (this.how.open) this.how.paint();
    };
    img.src = `${import.meta.env.BASE_URL}${path}`;
  }

  /**
   * The video plane: made once, a child of the How to play card, so it moves,
   * turns and scales with it; it stands a hair in front of the paper.
   */
  private ensureVideoPlane(): Mesh<PlaneGeometry, MeshBasicMaterial> | null {
    if (this.videoPlane || !this.video) return this.videoPlane;
    const v = this.video;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';
    const texture = new VideoTexture(v);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    const m = (units: number): number => (units * this.kh) / PPM;
    const plane = new Mesh(new PlaneGeometry(m(HOW_VIDEO.width), m(HOW_VIDEO.height)), new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    plane.name = 'HowVideo';
    plane.renderOrder = this.how.mesh.renderOrder + 1;
    plane.visible = false;
    this.how.mesh.add(plane);
    this.videoPlane = plane;
    return plane;
  }

  /** Each frame: the step's clip plays over its frame while How to play is up; otherwise it stops. */
  private tickVideo(): void {
    const v = this.video;
    if (!v) return;
    const step = this.how.open ? this.howSteps[this.howIndex] : undefined;
    const want = step?.video && !this.still ? `${import.meta.env.BASE_URL}${step.video}` : '';
    if (!want) {
      if (!v.paused) v.pause();
      if (this.videoPlane) this.videoPlane.visible = false;
      return;
    }
    const plane = this.ensureVideoPlane();
    if (!plane) return;
    if (this.videoFor !== want) {
      this.videoFor = want;
      v.src = want;
      v.currentTime = 0;
    }
    if (v.paused) void v.play().catch(() => {});
    // Over the picture frame (design units to the card's own metres, y up).
    const top = this.howVideoTop;
    const m = (units: number): number => (units * this.kh) / PPM;
    plane.position.set(m(this.howVideoLeft + HOW_VIDEO.width / 2) - HOW_SIZE.width / 2, HOW_SIZE.height / 2 - m(top + HOW_VIDEO.height / 2), 0.0008);
    // Shown once it has a picture, fading with the card.
    const ready = v.readyState >= 2;
    plane.visible = ready && this.how.shownAmount > 0;
    plane.material.opacity = this.how.shownAmount;
  }

  /** Where the video's frame starts on the card (design units from the top and the left), set by the layout. */
  private howVideoTop = 0;
  private howVideoLeft = 0;

  /** Draw the start card for this state (and put it up). */
  showStart(state: StartState): void {
    this.cardKind = 'start';
    this.start = state;
    this.card.resize(START_SIZE.width, START_SIZE.height);
    this.layoutStart();
    this.card.show(true);
  }

  /** The pause card (in a run). */
  showPause(state: PauseState): void {
    this.cardKind = 'pause';
    this.card.resize(START_SIZE.width, START_SIZE.height);
    this.layoutPause(state);
    this.card.show(true);
  }

  /** A level reached: the banner, the coins it gives and what comes next; CONTINUE carries on. */
  showLevel(state: LevelState): void {
    this.cardKind = 'level';
    this.card.resize(START_SIZE.width, START_SIZE.height);
    this.layoutLevel(state);
    this.card.show(true);
  }

  /** The café's happiness ran out: the level starts again (TRY AGAIN), or back to the menu. */
  showFailed(state: FailState): void {
    this.cardKind = 'failed';
    this.card.resize(START_SIZE.width, START_SIZE.height);
    this.layoutFailed(state);
    this.card.show(true);
  }

  /** The shop (in a run, paused). Shown again after each hire. */
  showShop(state: ShopState): void {
    this.cardKind = 'shop';
    this.card.resize(START_SIZE.width, START_SIZE.height);
    this.layoutShop(state);
    this.card.show(true);
  }

  openSettings(state: SettingsState): void {
    this.settings = state;
    this.sheetKind = 'settings';
    this.layoutSettings();
    this.sheet.show(true);
  }

  /** Redraw Settings with new values (it stays open). */
  updateSettings(state: SettingsState): void {
    this.settings = state;
    if (this.sheetKind === 'settings') this.layoutSettings();
  }

  openWarn(state: WarnState): void {
    this.warn = state;
    this.sheetKind = 'warn';
    this.layoutWarn();
    this.sheet.show(true);
  }

  /** Are you sure? before leaving the headset view. */
  openQuit(): void {
    this.sheetKind = 'quit';
    this.layoutQuit();
    this.sheet.show(true);
  }

  closeSheet(): void {
    this.sheetKind = 'none';
    this.sheet.show(false);
  }

  hideAll(): void {
    this.closeSheet();
    this.card.show(false);
  }

  /** Each frame: the boil (a new seed, ten times a second) while a card is up. */
  tick(delta: number): void {
    this.tickVideo();
    this.clock += delta;
    const seed = 1 + Math.floor(this.clock * BOIL_HZ);
    if (seed === this.seed) return;
    this.seed = seed;
    if (this.card.open) this.card.paint();
    if (this.sheet.open) this.sheet.paint();
    if (this.how.open) this.how.paint();
  }

  // ----------------------------------------------------------- drawing

  private o(more: Options = {}): Options {
    return { seed: this.seed, roughness: 1.3, bowing: 1.1, strokeWidth: 3.5, stroke: SKETCH.ink, ...more };
  }

  /** A card's paper: a timber frame round shoji paper, from `top` (design units) down to `h`. */
  private paper(ctx: CanvasRenderingContext2D, rc: RoughCanvas, top: number, h: number, w = W): void {
    const f = Math.round((14 * w) / W);
    ctx.fillStyle = SKETCH.timber;
    ctx.fillRect(0, top, w, h - top);
    rc.rectangle(f, top + f, w - f * 2, h - top - f * 2, this.o({ fill: SKETCH.paper, fillStyle: 'solid', stroke: SKETCH.timber, strokeWidth: 3 }));
  }

  /** Light from inside the button, like a paper lantern (a finger is near). */
  private lantern(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 3, y + 3, w - 6, h - 6);
    ctx.clip();
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 0.6);
    g.addColorStop(0, 'rgba(255,214,140,.3)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  /**
   * A button in design units: 'primary' (moss), 'secondary' (paper),
   * 'danger' (koi outline), 'off' (pale, cannot go further). It lights from
   * inside when a finger is near and moves down when pressed.
   */
  private button(panel: Panel, id: string, x: number, y: number, w: number, h: number, kind: 'primary' | 'secondary' | 'danger' | 'off', label: string, sub?: string, glyph = false, size?: number): Button {
    const k = panel === this.how ? this.kh : this.k;
    return {
      id, label, x: x * k, y: y * k, w: w * k, h: h * k, bare: true,
      draw: (ctx, _b, hover, pressed) => {
        const rc = pen(panel.canvas);
        ctx.save();
        ctx.scale(k, k);
        const dip = pressed ? 6 : 0;
        // Lit (the beam or a finger on it): plain buttons darken to a deeper paper, the red ones take a red tint,
        // the green one keeps its colour and glows (the lantern), so the button about to be pressed is plain to see.
        const fill = kind === 'primary' ? SKETCH.moss : kind === 'off' ? SKETCH.paper : !hover ? SKETCH.paper : kind === 'danger' ? HOVER.danger : HOVER.plain;
        const stroke = kind === 'primary' ? SKETCH.mossDeep : kind === 'danger' ? SKETCH.koi : kind === 'off' ? '#b6a993' : SKETCH.ink;
        rc.rectangle(x, y + dip, w, h, this.o({ fill, fillStyle: 'solid', stroke, seed: this.seed + Math.round(x + y) }));
        if (hover && kind !== 'off') this.lantern(ctx, x, y + dip, w, h);
        const ink = kind === 'primary' ? '#f2ebdd' : kind === 'danger' ? SKETCH.koi : kind === 'off' ? '#b6a993' : SKETCH.ink;
        if (sub) {
          text(ctx, label, x + w / 2, y + h * 0.4 + dip, Math.round(h * 0.34), ink);
          text(ctx, sub, x + w / 2, y + h * 0.73 + dip, 28, kind === 'primary' ? '#f2ebdd' : SKETCH.soft, 'center', false);
        } else text(ctx, label, x + w / 2, y + h / 2 + 2 + dip, size ?? (glyph ? 50 : Math.round(Math.min(h >= 140 ? 60 : 40, h * 0.42))), ink);
        ctx.restore();
      },
    };
  }

  private layoutStart(): void {
    const s = this.start;
    const returning = s.kind === 'returning';
    const SW = Math.round(this.card.width / this.k);
    const H = Math.round(this.card.height / this.k);
    // The cover art: the left column, full height.
    const ax = PAD;
    const ay = PAD;
    const aw = 360;
    const ah = H - PAD * 2;
    // The buttons: the right column.
    const cx = ax + aw + 30;
    const cw = SW - PAD - cx;
    const buttons: Button[] = [];
    const rowH = 84;
    const half = (cw - TOUCH_GAP) / 2;
    const bottom = H - PAD - rowH;
    if (returning) {
      const newY = bottom - TOUCH_GAP - 96;
      const contY = newY - TOUCH_GAP - 140;
      buttons.push(this.button(this.card, 'continue', cx, contY, cw, 140, 'primary', 'CONTINUE', `Level ${s.level} · ${s.coins.toLocaleString('en')} coins`));
      buttons.push(this.button(this.card, 'new', cx, newY, cw, 96, 'secondary', 'NEW GAME'));
    } else {
      const h = 200;
      buttons.push(this.button(this.card, 'new', cx, bottom - TOUCH_GAP - h, cw, h, 'primary', 'NEW GAME'));
    }
    // How to play and Settings side by side at the bottom (little reach).
    buttons.push(this.button(this.card, 'help', cx, bottom, half, rowH, 'secondary', '? How to play', undefined, false, 30));
    buttons.push(this.button(this.card, 'gear', cx + half + TOUCH_GAP, bottom, half, rowH, 'secondary', '⚙ Settings', undefined, false, 30));
    // Quit: top right, away from the buttons pressed often (it asks first).
    const qw = 150;
    buttons.push(this.button(this.card, 'quit', SW - PAD - qw, PAD, qw, 72, 'secondary', 'Quit'));
    this.card.set((ctx) => {
      ctx.clearRect(0, 0, this.card.width, this.card.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      const rc = pen(this.card.canvas);
      this.paper(ctx, rc, 0, H, SW);
      // The cover art, cropped to fill its column (never stretched), darkened toward the name.
      ctx.save();
      ctx.beginPath();
      ctx.rect(ax, ay, aw, ah);
      ctx.clip();
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(ax, ay, aw, ah);
      if (cover) {
        const k = Math.max(aw / cover.width, ah / cover.height);
        const iw = aw / k;
        const ih = ah / k;
        ctx.drawImage(cover, (cover.width - iw) / 2, (cover.height - ih) / 2, iw, ih, ax, ay, aw, ah);
      }
      const g = ctx.createLinearGradient(0, ay + ah * 0.4, 0, ay + ah);
      g.addColorStop(0, 'rgba(22,23,29,0)');
      g.addColorStop(1, 'rgba(22,23,29,.88)');
      ctx.fillStyle = g;
      ctx.fillRect(ax, ay, aw, ah);
      ctx.restore();
      rc.rectangle(ax, ay, aw, ah, this.o({ strokeWidth: 3, seed: this.seed + 3 }));
      text(ctx, 'CAFÉ', ax + aw / 2, ay + ah - 150, 74, '#f2ebdd');
      text(ctx, 'CHAOS', ax + aw / 2, ay + ah - 72, 74, '#f2ebdd');
      // The level the save is on: a lantern-coloured badge.
      if (returning) {
        const word = `${s.level}`;
        ctx.font = font(30);
        const lw = ctx.measureText('LEVEL').width;
        ctx.font = font(44);
        const tw = ctx.measureText(word).width;
        const bx = ax + 18;
        const by = ay + 18;
        const bw = 24 + lw + 18 + tw + 24;
        rc.rectangle(bx, by, bw, 84, this.o({ fill: SKETCH.lantern, fillStyle: 'solid', stroke: SKETCH.timber, seed: this.seed + 50 }));
        text(ctx, 'LEVEL', bx + 24, by + 44, 30, SKETCH.ink, 'left');
        text(ctx, word, bx + bw - 22, by + 44, 44, SKETCH.ink, 'right');
      }
      ctx.restore();
    }, buttons);
  }

  /** Lines of `s` that fit `width` (design units) at this size. */
  private wrap(ctx: CanvasRenderingContext2D, s: string, size: number, heavy: boolean, width: number): string[] {
    ctx.font = font(size, heavy);
    const lines: string[] = [];
    let line = '';
    for (const word of s.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    return lines;
  }

  /**
   * How to play, one step at a time, laid out wide:
   *
   *   ┌──────────────────────────────────────────┐
   *   │ How to play                          [✕] │
   *   │ ┌──────────────────┐  [2] Pinch a guest  │
   *   │ │   step's video   │  Put your fingers   │
   *   │ │                  │  above a guest...   │
   *   │ └──────────────────┘                     │
   *   │ [PREVIOUS]        ● ○ ○ ○        [NEXT]  │
   *   └──────────────────────────────────────────┘
   *
   * PREVIOUS and NEXT run along the bottom, the most used controls low on
   * the panel (Meta); the last step's NEXT reads DONE and closes, as ✕ does.
   */
  private layoutHow(): void {
    const ctx = this.how.ctx;
    const H = Math.round(this.how.height / this.kh);
    const P = 36;
    const steps = this.howSteps;
    const i = this.howIndex;
    const step = steps[i];
    if (!step) return;
    const last = i === steps.length - 1;
    const HEAD = 84;
    const NAV_H = 90;
    const BADGE = 48;
    const vx = P;
    const vy = P + HEAD + 18;
    const rx = vx + HOW_VIDEO.width + 30;
    const rw = HW - P - rx;
    const titleLines = this.wrap(ctx, step.title, 36, true, rw - BADGE - 14);
    const textLines = this.wrap(ctx, step.text, 28, false, rw);
    this.howVideoTop = vy;
    this.howVideoLeft = vx;
    const yNav = H - P - NAV_H;
    const navW = 280;
    const buttons: Button[] = [
      this.button(this.how, 'back', HW - P - HEAD, P, HEAD, HEAD, 'secondary', '✕', undefined, true),
      this.button(this.how, 'how-prev', P, yNav, navW, NAV_H, i === 0 ? 'off' : 'secondary', 'PREVIOUS'),
      last ? this.button(this.how, 'how-done', HW - P - navW, yNav, navW, NAV_H, 'primary', 'DONE') : this.button(this.how, 'how-next', HW - P - navW, yNav, navW, NAV_H, 'primary', 'NEXT'),
    ];
    this.how.set((c) => {
      c.clearRect(0, 0, this.how.canvas.width, this.how.canvas.height);
      c.save();
      c.scale(this.kh, this.kh);
      const rc = pen(this.how.canvas);
      this.paper(c, rc, 0, H, HW);
      text(c, 'How to play', P + 4, P + HEAD / 2, 48, SKETCH.ink, 'left');
      // The frame: the still picture (shown until the clip plays, and for less motion), then the clip on top (tickVideo).
      c.fillStyle = '#2a2420';
      c.fillRect(vx, vy, HOW_VIDEO.width, HOW_VIDEO.height);
      const img = this.posters.get(step.poster);
      if (img) {
        // Cover the frame: crop, never stretch.
        const s = Math.max(HOW_VIDEO.width / img.width, HOW_VIDEO.height / img.height);
        const iw = HOW_VIDEO.width / s;
        const ih = HOW_VIDEO.height / s;
        c.drawImage(img, (img.width - iw) / 2, (img.height - ih) / 2, iw, ih, vx, vy, HOW_VIDEO.width, HOW_VIDEO.height);
      }
      rc.rectangle(vx, vy, HOW_VIDEO.width, HOW_VIDEO.height, this.o({ strokeWidth: 3, seed: this.seed + 30 }));
      // The step, beside the video: its number in a moss square, its title, its line.
      c.fillStyle = SKETCH.moss;
      c.fillRect(rx, vy, BADGE, BADGE);
      text(c, `${i + 1}`, rx + BADGE / 2, vy + BADGE / 2 + 2, 32, '#f2ebdd');
      titleLines.forEach((l, j) => text(c, l, rx + BADGE + 14, vy + BADGE / 2 + j * 44 + 2, 36, SKETCH.ink, 'left'));
      const yText = vy + Math.max(BADGE, titleLines.length * 44) + 30;
      textLines.forEach((l, j) => text(c, l, rx, yText + j * 38, 28, SKETCH.soft, 'left', false));
      // Where you are: a dot for each step, the current one filled.
      const dot = 20;
      const dotGap = 22;
      const dotsW = steps.length * dot + (steps.length - 1) * dotGap;
      const dx = HW / 2 - dotsW / 2;
      steps.forEach((_, k) => {
        rc.circle(dx + k * (dot + dotGap) + dot / 2, yNav + NAV_H / 2, dot, this.o({ strokeWidth: 2.5, seed: this.seed + 60 + k, fill: k === i ? SKETCH.moss : 'transparent', fillStyle: 'solid', stroke: k === i ? SKETCH.mossDeep : '#b6a993' }));
      });
      c.restore();
    }, buttons);
  }

  /** A row: the label above, then −, a five-step bar and + close together in the middle (little reach). */
  private stepper(buttons: Button[], ctx: CanvasRenderingContext2D | null, rc: RoughCanvas | null, id: string, y: number, label: string, level: number): void {
    const size = 84;
    const barW = 300;
    const gap = TOUCH_GAP;
    const left = (W - (size + gap + barW + gap + size)) / 2;
    const right = left + size + gap + barW + gap;
    if (!ctx || !rc) {
      buttons.push(this.button(this.sheet, `${id}-`, left, y, size, size, level <= 0 ? 'off' : 'secondary', '−', undefined, true));
      buttons.push(this.button(this.sheet, `${id}+`, right, y, size, size, level >= LEVELS ? 'off' : 'secondary', '+', undefined, true));
      return;
    }
    text(ctx, label, W / 2, y - 34, 36, SKETCH.ink);
    const x0 = left + size + gap;
    const n = LEVELS;
    const sg = 10;
    const sw = (barW - sg * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const on = i < level;
      rc.rectangle(x0 + i * (sw + sg), y + 16, sw, 52, this.o({ fill: on ? SKETCH.moss : '#cfc3ae', fillStyle: 'solid', stroke: on ? SKETCH.mossDeep : '#b6a993', seed: this.seed + y + i }));
    }
    if (level === 0) text(ctx, 'OFF', x0 + barW / 2, y + 44, 30, SKETCH.soft);
  }

  private layoutSettings(): void {
    const s = this.settings;
    const H = Math.round(this.sheet.height / this.k);
    const rows = { music: 170, sounds: 170 + 84 + 100 };
    const buttons: Button[] = [];
    this.stepper(buttons, null, null, 'music', rows.music, 'Music', s.music);
    this.stepper(buttons, null, null, 'sounds', rows.sounds, 'Sounds', s.sounds);
    buttons.push(this.button(this.sheet, 'close', PAD, rows.sounds + 84 + TOUCH_GAP + 8, W - PAD * 2, 90, 'primary', 'CLOSE'));
    this.sheet.set((ctx) => {
      ctx.clearRect(0, 0, this.sheet.width, this.sheet.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      const rc = pen(this.sheet.canvas);
      this.paper(ctx, rc, 0, H);
      text(ctx, 'Settings', W / 2, 74, 56, SKETCH.ink);
      this.stepper([], ctx, rc, 'music', rows.music, 'Music', s.music);
      this.stepper([], ctx, rc, 'sounds', rows.sounds, 'Sounds', s.sounds);
      ctx.restore();
    }, buttons);
  }

  private layoutWarn(): void {
    const s = this.warn;
    const H = Math.round(this.sheet.height / this.k);
    const lost = [`${s.coins.toLocaleString('en')} coins`, `${s.staff} ${s.staff === 1 ? 'barista' : 'baristas'}`].concat(s.level > 1 ? [`level ${s.level}`] : []);
    const sentence = `This deletes your ${lost.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
    const buttons: Button[] = [
      this.button(this.sheet, 'fresh', PAD, 300, W - PAD * 2, 120, 'danger', 'DELETE AND START'),
      this.button(this.sheet, 'keep', PAD, 300 + 120 + TOUCH_GAP, W - PAD * 2, 120, 'secondary', 'GO BACK'),
    ];
    this.sheet.set((ctx) => {
      ctx.clearRect(0, 0, this.sheet.width, this.sheet.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      const rc = pen(this.sheet.canvas);
      this.paper(ctx, rc, 0, H);
      text(ctx, 'Start a new café?', W / 2, 80, 54, SKETCH.ink);
      ctx.font = font(34, false);
      const lines: string[] = [];
      let line = '';
      for (const word of sentence.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > W - PAD * 2) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
      lines.forEach((l, i) => text(ctx, l, W / 2, 160 + i * 48, 34, SKETCH.soft, 'center', false));
      ctx.restore();
    }, buttons);
  }

  private layoutQuit(): void {
    const H = Math.round(this.sheet.height / this.k);
    const buttons: Button[] = [
      this.button(this.sheet, 'quit-no', PAD, 260, W - PAD * 2, 120, 'primary', 'KEEP PLAYING'),
      this.button(this.sheet, 'quit-yes', PAD, 260 + 120 + TOUCH_GAP, W - PAD * 2, 120, 'danger', 'QUIT'),
    ];
    this.sheet.set((ctx) => {
      ctx.clearRect(0, 0, this.sheet.width, this.sheet.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      this.paper(ctx, pen(this.sheet.canvas), 0, H);
      text(ctx, 'Quit Café Chaos?', W / 2, 90, 54, SKETCH.ink);
      text(ctx, 'Your progress is saved.', W / 2, 170, 34, SKETCH.soft, 'center', false);
      ctx.restore();
    }, buttons);
  }

  /** A button with a price: the word, a coin and the number ('primary' to buy now, 'off' when the bank cannot pay yet). */
  private priceButton(panel: Panel, id: string, x: number, y: number, w: number, h: number, kind: 'primary' | 'off', word: string, price: number): Button {
    const k = this.k;
    return {
      id, label: `${word} ${price}`, x: x * k, y: y * k, w: w * k, h: h * k, bare: true, off: kind === 'off',
      draw: (ctx, _b, hover, pressed) => {
        const rc = pen(panel.canvas);
        ctx.save();
        ctx.scale(k, k);
        const dip = pressed ? 6 : 0;
        const live = kind === 'primary';
        rc.rectangle(x, y + dip, w, h, this.o({ fill: live ? SKETCH.moss : SKETCH.paper, fillStyle: 'solid', stroke: live ? SKETCH.mossDeep : '#b6a993', seed: this.seed + Math.round(x + y) }));
        if (hover && live) this.lantern(ctx, x, y + dip, w, h);
        const ink = live ? '#f2ebdd' : '#b6a993';
        const size = 38;
        ctx.font = font(size);
        const ww = ctx.measureText(word).width;
        const pw = ctx.measureText(`${price}`).width;
        const cd = size * 0.9;
        const total = ww + 24 + cd + 10 + pw;
        let lx = x + (w - total) / 2;
        const cy = y + h / 2 + dip;
        text(ctx, word, lx, cy + 2, size, ink, 'left');
        lx += ww + 24;
        if (live) sketchCoin(rc, lx + cd / 2, cy, cd, this.seed + 7, 2.5);
        else rc.circle(lx + cd / 2, cy, cd, this.o({ stroke: '#b6a993', strokeWidth: 2.5 }));
        lx += cd + 10;
        text(ctx, `${price}`, lx, cy + 2, size, ink, 'left');
        ctx.restore();
      },
    };
  }

  /**
   * The pause card, wide like the start card: Paused, the time open and the
   * guests served on the left; RESUME, How to play and Settings, and MAIN
   * MENU (the level is saved as it stands) on the right.
   */
  private layoutPause(s: PauseState): void {
    const SW = Math.round(this.card.width / this.k);
    const H = Math.round(this.card.height / this.k);
    const lx = PAD;
    const lw = 360;
    const cx = lx + lw + 30;
    const cw = SW - PAD - cx;
    const half = (cw - TOUCH_GAP) / 2;
    const yEnd = H - PAD - 96;
    const yRow = yEnd - TOUCH_GAP - 96;
    const yResume = yRow - TOUCH_GAP - 150;
    const buttons: Button[] = [
      this.button(this.card, 'resume', cx, yResume, cw, 150, 'primary', 'RESUME'),
      this.button(this.card, 'how', cx, yRow, half, 96, 'secondary', '? How to play', undefined, false, 30),
      this.button(this.card, 'settings', cx + half + TOUCH_GAP, yRow, half, 96, 'secondary', '⚙ Settings', undefined, false, 30),
      this.button(this.card, 'end', cx, yEnd, cw, 96, 'secondary', 'MAIN MENU'),
    ];
    this.card.set((ctx) => {
      ctx.clearRect(0, 0, this.card.width, this.card.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      this.paper(ctx, pen(this.card.canvas), 0, H, SW);
      const mid = lx + lw / 2;
      text(ctx, 'Paused', mid, H / 2 - 90, 68, SKETCH.ink);
      text(ctx, `Level ${s.level}`, mid, H / 2 + 6, 64, SKETCH.ink);
      text(ctx, `${s.served} of ${s.goal} guests served`, mid, H / 2 + 88, 34, SKETCH.soft, 'center', false);
      ctx.restore();
    }, buttons);
  }

  /**
   * The level card, wide like the start card: on the left a lantern-gold
   * seal with the level's number; on the right what it brings (the coins,
   * the guests to serve next) and CONTINUE. Nothing on it moves or flashes;
   * the confetti is thrown in the room (StripSystem).
   */
  private layoutLevel(s: LevelState): void {
    const SW = Math.round(this.card.width / this.k);
    const H = Math.round(this.card.height / this.k);
    const lx = PAD;
    const lw = 360;
    const cx = lx + lw + 30;
    const cw = SW - PAD - cx;
    const buttons: Button[] = [this.button(this.card, 'level-continue', cx, H - PAD - 150, cw, 150, 'primary', 'CONTINUE')];
    this.card.set((ctx) => {
      ctx.clearRect(0, 0, this.card.width, this.card.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      const rc = pen(this.card.canvas);
      this.paper(ctx, rc, 0, H, SW);
      const mid = lx + lw / 2;
      // The seal: a gold disc, a timber ring, the number.
      rc.circle(mid, H / 2 + 20, 300, this.o({ fill: SKETCH.lantern, fillStyle: 'solid', stroke: SKETCH.timber, strokeWidth: 5, seed: this.seed + 70 }));
      rc.circle(mid, H / 2 + 20, 250, this.o({ stroke: SKETCH.timber, strokeWidth: 2.5, seed: this.seed + 71 }));
      text(ctx, 'LEVEL', mid, H / 2 - 50, 44, SKETCH.ink);
      text(ctx, `${s.level}`, mid, H / 2 + 50, 130, SKETCH.ink);
      const tx = cx + cw / 2;
      text(ctx, `Level ${s.level - 1} done!`, tx, PAD + 70, 56, SKETCH.ink);
      const coinsY = PAD + 170;
      ctx.font = font(44);
      const word = `+${s.bonus} coins`;
      const ww = ctx.measureText(word).width;
      rc.circle(tx - ww / 2 - 34, coinsY, 48, this.o({ fill: SKETCH.lantern, fillStyle: 'solid', stroke: SKETCH.timber, seed: this.seed + 72 }));
      text(ctx, word, tx + 20, coinsY, 44, SKETCH.ink);
      text(ctx, `Next: serve ${s.goal} guests`, tx, coinsY + 90, 34, SKETCH.soft, 'center', false);
      ctx.restore();
    }, buttons);
  }

  /**
   * The café's happiness ran out: the level starts again. The coins and
   * the staff are kept, and the card says so; TRY AGAIN is the main
   * button.
   */
  private layoutFailed(s: FailState): void {
    const SW = Math.round(this.card.width / this.k);
    const H = Math.round(this.card.height / this.k);
    const lx = PAD;
    const lw = 360;
    const cx = lx + lw + 30;
    const cw = SW - PAD - cx;
    const yMenu = H - PAD - 96;
    const buttons: Button[] = [
      this.button(this.card, 'again', cx, yMenu - TOUCH_GAP - 150, cw, 150, 'primary', 'TRY AGAIN'),
      this.button(this.card, 'menu', cx, yMenu, cw, 96, 'secondary', 'MAIN MENU'),
    ];
    this.card.set((ctx) => {
      ctx.clearRect(0, 0, this.card.width, this.card.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      this.paper(ctx, pen(this.card.canvas), 0, H, SW);
      const mid = lx + lw / 2;
      text(ctx, 'A rough evening', mid, H / 2 - 110, 46, SKETCH.ink);
      text(ctx, `Level ${s.level}`, mid, H / 2 - 20, 64, SKETCH.ink);
      text(ctx, `${s.served} of ${s.goal} guests served`, mid, H / 2 + 50, 34, SKETCH.soft, 'center', false);
      text(ctx, `${s.left} ${s.left === 1 ? 'guest' : 'guests'} left unhappy`, mid, H / 2 + 98, 30, SKETCH.koi, 'center', false);
      text(ctx, 'Your coins and staff are kept.', mid, H / 2 + 146, 30, SKETCH.soft, 'center', false);
      ctx.restore();
    }, buttons);
  }

  /** A barista's place in the shop: a round frame with a steaming cup in their colour. */
  private portrait(rc: RoughCanvas, x: number, y: number, d: number, tint: string, seed: number): void {
    rc.circle(x, y, d, this.o({ seed, strokeWidth: 3, fill: '#e4d9c6', fillStyle: 'solid' }));
    rc.rectangle(x - d * 0.2, y - d * 0.08, d * 0.4, d * 0.3, this.o({ seed: seed + 1, strokeWidth: 2.5, fill: tint, fillStyle: 'solid' }));
    rc.arc(x + d * 0.21, y + d * 0.06, d * 0.16, d * 0.16, -Math.PI / 2, Math.PI / 2, false, this.o({ seed: seed + 2, strokeWidth: 2.5 }));
    for (const side of [-1, 0, 1]) {
      const sx = x + side * d * 0.1;
      rc.curve([[sx, y - d * 0.16], [sx + d * 0.04, y - d * 0.24], [sx, y - d * 0.32]], this.o({ seed: seed + 4 + side, strokeWidth: 2, stroke: SKETCH.soft }));
    }
  }

  /**
   * The shop, wide like the start card: the title and the bank across the
   * top with CLOSE at the right (as Quit on the start card), then a row for
   * each barista: their portrait and name, and HIRE with the price (or
   * "Works for you").
   */
  private layoutShop(s: ShopState): void {
    const SW = Math.round(this.card.width / this.k);
    const H = Math.round(this.card.height / this.k);
    const HEAD = 84;
    const ROW_GAP = 16;
    const y0 = PAD + HEAD + 20;
    const ROW = Math.min(124, Math.floor((H - PAD - y0 - ROW_GAP * (s.rows.length - 1)) / Math.max(1, s.rows.length)));
    const buttons: Button[] = [];
    const bw = 290;
    const bh = Math.min(100, ROW - 16);
    let y = y0;
    s.rows.forEach((r) => {
      if (r.status !== 'working' && r.price !== undefined) {
        buttons.push(this.priceButton(this.card, r.status === 'hire' ? 'hire' : 'hire-later', SW - PAD - bw, y + (ROW - bh) / 2, bw, bh, r.status === 'hire' ? 'primary' : 'off', 'HIRE', r.price));
      }
      y += ROW + ROW_GAP;
    });
    const qw = 170;
    buttons.push(this.button(this.card, 'shop-close', SW - PAD - qw, PAD, qw, HEAD, 'secondary', 'CLOSE'));
    const tints = ['#7a9a6e', '#d48a8a', '#8aa3c9'];
    this.card.set((ctx) => {
      ctx.clearRect(0, 0, this.card.width, this.card.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      const rc = pen(this.card.canvas);
      this.paper(ctx, rc, 0, H, SW);
      text(ctx, 'Hire baristas', PAD + 4, PAD + HEAD / 2, 52, SKETCH.ink, 'left');
      const coins = `${s.coins.toLocaleString('en')} coins`;
      ctx.font = font(36);
      const cw = ctx.measureText(coins).width;
      const coinX = SW - PAD - qw - 40 - cw;
      sketchCoin(rc, coinX - 26, PAD + HEAD / 2, 38, this.seed + 3, 2.5);
      text(ctx, coins, coinX, PAD + HEAD / 2 + 2, 36, SKETCH.ink, 'left');
      let ry = y0;
      s.rows.forEach((r, i) => {
        const d = Math.min(100, ROW - 10);
        this.portrait(rc, PAD + d / 2 + 8, ry + ROW / 2, d, tints[i % tints.length], this.seed + 100 + i * 10);
        text(ctx, r.name, PAD + d + 40, ry + ROW / 2 + 2, 44, SKETCH.ink, 'left');
        if (r.status === 'working') text(ctx, 'Works for you', SW - PAD - 14, ry + ROW / 2 + 2, 32, SKETCH.moss, 'right');
        ry += ROW + ROW_GAP;
      });
      ctx.restore();
    }, buttons);
  }
}
