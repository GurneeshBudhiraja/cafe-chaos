/**
 * The start menu: a card that stands a metre in front of the player,
 * facing them, pressed with the hand ray (point and pinch), as Quest's own
 * panels are (GameSystem places it and casts the ray). It is drawn in the café's own colours with a timber frame
 * round shoji paper, and its lines boil (redrawn with a new seed ten times
 * a second) while it is up.
 *
 * The start card is one rounded box with a margin, and nothing is drawn
 * past its edge: three small square buttons in its top corners (Quit on
 * the left; How to play and Settings on the right), the logo between them,
 * and a row of café cards across the middle that scrolls sideways (pinch
 * and drag it, or press the arrows at its ends). A card is the café's
 * picture with its name over a dark shadow at the bottom; pinching it plays
 * there. The last card is a café still to come, and cannot be picked.
 *
 *   ╭──────────────────────────────────────────────╮
 *   │ [⏻]           CAFÉ CHAOS            [?] [⚙] │
 *   │ ╭──────────╮  ╭──────────╮  ╭────╌╌╌         │
 *   │ │ picture  │  │ picture  │  │ Brazil  (→)    │
 *   │ │▒Japanese▒│  │▒Canadian▒│  │▒Coming         │
 *   │ ╰──────────╯  ╰──────────╯  ╰────╌╌╌         │
 *   │       Pinch a café to play · drag for more    │
 *   ╰──────────────────────────────────────────────╯
 *
 * The pause card and the failed card are the same width, the older shape:
 * their words on the left and the buttons on the right. Settings, the New
 * Game warning and the Quit question open on a second card in front
 * (`sheet`): the card behind is dimmed and takes no presses until the sheet
 * closes.
 *
 * Everything is drawn in design units (720 across) and scaled to the panel.
 */

import { LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, VideoTexture } from '@iwsdk/core';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { HowToStep } from '../game/how-to-play.js';
import type { Options } from 'roughjs/bin/core';
import type { CafeId } from '../cafe/style.js';
import { Panel, roundRect, type Button } from './panel.js';
import { hand, pen, SKETCH, sketchCoin } from './sketch.js';
import { snowflake } from '../guests/patience-dial.js';

/** The sheet's size (metres): 24 cm across (Settings, the New Game warning, Quit). */
export const MENU_SIZE = { width: 0.24, height: 0.28, sheetHeight: 0.21 };
/** The menu card (start, pause, shop): wide and short (metres), 960 by 600 design units. */
export const START_SIZE = { width: 0.32, height: 0.2 };
/**
 * The start card (design units, 960 across like the others): the outer
 * box's margin, corner radius and rim; the corner buttons (square, 84
 * units: 3.2 degrees at the card's metre, over Meta's 2.5 to 3 for a ray)
 * and their labels; the carousel's window, its cards and the arrows.
 */
const START = {
  W: 960,
  H: 556,
  margin: 14,
  radius: 40,
  rim: 10,
  corner: 84,
  cornerX: 44,
  cornerY: 32,
  label: 22,
  view: { x: 44, y: 172, w: 872, h: 318 },
  cardW: 356,
  cardGap: 32,
  cardRadius: 26,
  arrow: 84,
  hintY: 520,
} as const;
/** The start card's size (metres). */
export const PICKER_SIZE = { width: 0.32, height: (START.H * 0.32) / START.W };
/** The corner buttons' colours: Quit red, How to play plum, Settings slate blue (the sketch's three markers, toned to the café). */
const CORNER = {
  quit: { fill: SKETCH.red, deep: SKETCH.redInk, lit: '#de5444' },
  help: { fill: '#6d4a7e', deep: '#4a3157', lit: '#85609a' },
  gear: { fill: '#3d5f8a', deep: '#29425f', lit: '#5378a8' },
} as const;
/** Ink on a dark ground (the corner buttons, the words over a café's picture). */
const CREAM = '#f2ebdd';
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

/** One café on the start card. */
export interface CafeTile {
  id: CafeId;
  name: string;
  /** Its line under the name. */
  line: string;
  /** Owned (the Japanese café always); not owned: the free trial and Buy. */
  owned: boolean;
  /** A save to continue there (Continue and New game; else Start). */
  started: boolean;
  level: number;
  coins: number;
  /** Chosen, and its models still loading. */
  loading: boolean;
  /** Today's forecast (the Canadian café): its icon and one line, over the foot of its picture. */
  forecast?: { id: 'sunny' | 'snap' | 'snow'; line: string };
}
/** The start card: the cafés, the one played last first; and the Canadian café's price. */
export interface StartState {
  tiles: CafeTile[];
  price: number;
  /** The first run's lesson is still ahead (a café not started says so). */
  lesson: boolean;
}
/** The Buy question: the price, the Japanese café's coins, and where it is asked from. */
export interface BuyCafeState {
  price: number;
  coins: number;
  /** Asked in the trial: what was played there is kept. */
  trial: boolean;
  /** Asked in the Japanese café's Shop: the run goes on after. */
  fromJapan: boolean;
}
export interface SettingsState {
  music: number;
  sounds: number;
  /** Seat hints: the seats meeting a carried guest's wishes glow (off by default). */
  hints: boolean;
}
/** The pause card: the level, and guests served in it of the number that passes it. */
export interface PauseState {
  level: number;
  served: number;
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
export interface WarnState {
  /** The café a new game is for. */
  cafe: string;
  coins: number;
  staff: number;
  level: number;
}


/**
 * The cafés' pictures on the start card: the Japanese café's cover, and the
 * Canadian café from a seat (`top`: a share of the picture's height cropped
 * away at the top, for a picture with a caption strip).
 */
const ART: Record<CafeId, { file: string; top: number }> = {
  japan: { file: 'ui/cover.jpg', top: 0 },
  // From the seat (models/27-cafe-canada/previews/seat.png), the café as the player first sees it.
  canada: { file: 'ui/canada-card.jpg', top: 0 },
};
const covers: Partial<Record<CafeId, HTMLImageElement>> = {};
const coverListeners: (() => void)[] = [];
if (typeof Image !== 'undefined') {
  for (const id of Object.keys(ART) as CafeId[]) {
    const img = new Image();
    img.onload = () => {
      covers[id] = img;
      for (const f of coverListeners) f();
    };
    img.src = `${import.meta.env.BASE_URL}${ART[id].file}`;
  }
}

/** The brand's 3D logo (assets/meta-store/logo.png, web size), the start card's title. */
let logo: HTMLImageElement | null = null;
if (typeof Image !== 'undefined') {
  const img = new Image();
  img.onload = () => {
    logo = img;
    for (const f of coverListeners) f();
  };
  img.src = `${import.meta.env.BASE_URL}ui/logo.png`;
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
  sheetKind: 'none' | 'settings' | 'warn' | 'quit' | 'buy' | 'leave' = 'none';
  /** What the card shows: the start menu, or (in a run) the pause card or the shop. */
  cardKind: 'start' | 'pause' | 'failed' = 'start';
  private seed = 1;
  private clock = 0;
  private start: StartState = { tiles: [], price: 0, lesson: true };
  private settings: SettingsState = { music: 2, sounds: 3, hints: false };
  private warn: WarnState = { cafe: '', coins: 0, staff: 1, level: 1 };
  private readonly k: number;
  /**
   * The café row: how far it is scrolled (design units), where it is
   * heading, and where it was when a drag began (null: no drag).
   */
  private scroll = 0;
  private scrollTo = 0;
  private dragFrom: number | null = null;
  /** The row's buttons and where each sits in the row (design units), to move them as it scrolls. */
  private rowButtons: { b: Button; x: number; y: number; w: number; h: number; whole: boolean }[] = [];
  private arrows: { prev: Button | null; next: Button | null } = { prev: null, next: null };
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
    this.card.topmostHit = true;
    this.card.resize(PICKER_SIZE.width, PICKER_SIZE.height);
    this.layoutStart();
    this.card.show(true);
  }

  /** The pause card (in a run). */
  showPause(state: PauseState): void {
    this.cardKind = 'pause';
    this.card.topmostHit = false;
    this.card.resize(START_SIZE.width, START_SIZE.height);
    this.layoutPause(state);
    this.card.show(true);
  }


  /** The café's happiness ran out: the level starts again (TRY AGAIN), or back to the menu. */
  showFailed(state: FailState): void {
    this.cardKind = 'failed';
    this.card.topmostHit = false;
    this.card.resize(START_SIZE.width, START_SIZE.height);
    this.layoutFailed(state);
    this.card.show(true);
  }



  openSettings(state: SettingsState): void {
    this.sheet.resize(MENU_SIZE.width, MENU_SIZE.sheetHeight);
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

  /** The Canadian café's Buy question (or, short of coins, how many more). */
  openBuy(state: BuyCafeState): void {
    this.sheetKind = 'buy';
    const can = state.coins >= state.price;
    const after = state.trial ? ' You keep your trial progress.' : state.fromJapan ? '' : ' It starts at level 1.';
    if (can)
      this.layoutQuestion('Buy the Canadian café?', `It costs ${state.price} coins from the Japanese café. You will have ${(state.coins - state.price).toLocaleString('en')} coins left there.${after}`, [
        { id: 'buy-yes', kind: 'primary', label: `BUY · ${state.price} COINS` },
        { id: 'buy-no', kind: 'secondary', label: 'GO BACK' },
      ]);
    else
      this.layoutQuestion('Not enough coins', `The Canadian café costs ${state.price} coins. The Japanese café has ${state.coins.toLocaleString('en')}. Earn ${(state.price - state.coins).toLocaleString('en')} more there.`, [{ id: 'buy-no', kind: 'primary', label: 'GO BACK' }]);
    this.sheet.show(true);
  }

  /** Leave the trial? Its progress is not saved. */
  openLeave(): void {
    this.sheetKind = 'leave';
    this.layoutQuestion('Leave the trial?', 'Your trial progress is not saved.', [
      { id: 'leave-no', kind: 'primary', label: 'KEEP PLAYING' },
      { id: 'leave-yes', kind: 'danger', label: 'LEAVE' },
    ]);
    this.sheet.show(true);
  }

  /** A question on the sheet: its title, a sentence (wrapped), and one or two wide buttons under it. */
  private layoutQuestion(title: string, sentence: string, choices: { id: string; kind: 'primary' | 'secondary' | 'danger'; label: string }[]): void {
    // Fitted to its content: the title, the sentence, then the buttons a block gap under it, PAD at the bottom as at
    // the sides (a one-line sentence leaves no empty paper above the buttons).
    const ctx = this.sheet.ctx;
    // Each sentence starts its own line (one idea a line, ASD-STE100), wrapped only if it is too long for one.
    const lines = sentence.split(/(?<=\.)\s+/).flatMap((one) => this.wrap(ctx, one, 32, false, W - PAD * 2));
    const textTop = 150;
    const top = textTop + (lines.length - 1) * 44 + 22 + 48;
    const H = top + choices.length * 120 + (choices.length - 1) * TOUCH_GAP + PAD + 14;
    this.sheet.resize(MENU_SIZE.width, (H * this.k) / PPM);
    const buttons = choices.map((c, i) => this.button(this.sheet, c.id, PAD, top + i * (120 + TOUCH_GAP), W - PAD * 2, 120, c.kind, c.label));
    this.sheet.set((c) => {
      c.clearRect(0, 0, this.sheet.width, this.sheet.height);
      c.save();
      c.scale(this.k, this.k);
      this.paper(c, pen(this.sheet.canvas), 0, H);
      text(c, title, W / 2, 80, 48, SKETCH.ink);
      lines.forEach((l, i) => text(c, l, W / 2, textTop + i * 44, 32, SKETCH.soft, 'center', false));
      c.restore();
    }, buttons);
  }

  /** Are you sure? before leaving the headset view. */
  openQuit(): void {
    this.sheet.resize(MENU_SIZE.width, MENU_SIZE.sheetHeight);
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
    // The café row easing to where it was sent (an arrow, or let go after a drag).
    if (this.cardKind === 'start' && this.card.open && this.dragFrom === null && this.scroll !== this.scrollTo) {
      this.scroll += (this.scrollTo - this.scroll) * (1 - Math.exp(-14 * delta));
      if (Math.abs(this.scrollTo - this.scroll) < 0.5) this.scroll = this.scrollTo;
      this.placeRow();
      this.card.paint();
    }
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
  private button(panel: Panel, id: string, x: number, y: number, w: number, h: number, kind: 'primary' | 'secondary' | 'danger' | 'off' | 'busy', label: string, sub?: string, glyph = false, size?: number): Button {
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
        // 'busy' (waiting on something, a café still loading): a deeper paper, its words in the soft ink (6:1, readable;
        // the pale 'off' ink is only for a control that cannot go further, its state shown by the control beside it).
        const fill = kind === 'primary' ? SKETCH.moss : kind === 'busy' ? SKETCH.paperDeep : kind === 'off' ? SKETCH.paper : !hover ? SKETCH.paper : kind === 'danger' ? HOVER.danger : HOVER.plain;
        const stroke = kind === 'primary' ? SKETCH.mossDeep : kind === 'danger' ? SKETCH.koi : kind === 'off' ? '#b6a993' : kind === 'busy' ? SKETCH.soft : SKETCH.ink;
        rc.rectangle(x, y + dip, w, h, this.o({ fill, fillStyle: 'solid', stroke, seed: this.seed + Math.round(x + y) }));
        if (hover && kind !== 'off' && kind !== 'busy') this.lantern(ctx, x, y + dip, w, h);
        const ink = kind === 'primary' ? '#f2ebdd' : kind === 'danger' ? SKETCH.koi : kind === 'off' ? '#b6a993' : kind === 'busy' ? SKETCH.soft : SKETCH.ink;
        if (sub) {
          text(ctx, label, x + w / 2, y + h * 0.4 + dip, Math.round(h * 0.34), ink);
          text(ctx, sub, x + w / 2, y + h * 0.73 + dip, 28, kind === 'primary' ? '#f2ebdd' : SKETCH.soft, 'center', false);
        } else text(ctx, label, x + w / 2, y + h / 2 + 2 + dip, size ?? (glyph ? 50 : Math.round(Math.min(h >= 140 ? 60 : 40, h * 0.42))), ink);
        ctx.restore();
      },
    };
  }

  /**
   * The start card (see the drawing at the top of this file): the outer box,
   * the three corner buttons, the logo, and the café row, which scrolls
   * sideways inside its window and is never drawn past it.
   *
   * The row is the cafés (`start.tiles`, in their order) and a café still to
   * come. Pinching a café's card plays there as its one button did (Start,
   * Continue, or the Canadian café's free trial); a small tag on its picture
   * does the rest (New game for a café with a save, Buy for the Canadian café
   * not owned yet). The café to come has no button.
   */
  private layoutStart(): void {
    const st = this.start;
    const { W: SW, H, view } = START;
    const step = START.cardW + START.cardGap;
    const entries: (CafeTile | null)[] = [...st.tiles, null];
    this.scrollMax = Math.max(0, entries.length * step - START.cardGap - view.w);
    this.scrollTo = this.clampScroll(this.scrollTo);
    this.scroll = this.clampScroll(this.scroll);
    const buttons: Button[] = [];
    this.rowButtons = [];
    // The café cards: each draws itself (its picture, the shadow and its name) where the row is scrolled to.
    entries.forEach((t, i) => {
      const x = i * step;
      if (!t) return;
      const b: Button = {
        id: `play-${t.id}`, label: t.name, x: 0, y: 0, w: 0, h: 0, bare: true,
        draw: (ctx, _b, hover, pressed) => {
          ctx.save();
          ctx.scale(this.k, this.k);
          this.drawRowCard(ctx, x, t, !!hover, !!pressed);
          ctx.restore();
        },
      };
      buttons.push(b);
      this.rowButtons.push({ b, x, y: view.y, w: START.cardW, h: view.h, whole: false });
    });
    // The tags on the pictures (pressed only while the whole tag is in the window).
    entries.forEach((t, i) => {
      if (!t || t.loading || (t.owned && !t.started)) return;
      // Narrow, in the picture's top right corner, clear of the café's sign.
      const tw = 170;
      const th = 80;
      const x = i * step + START.cardW - 16 - tw;
      const y = view.y + 16;
      const id = t.owned ? `new-${t.id}` : `buy-${t.id}`;
      const label = t.owned ? 'New game' : `Buy · ${st.price}`;
      const b: Button = { id, label, x: 0, y: 0, w: 0, h: 0, bare: true, draw: (ctx, _b, hover, pressed) => this.drawTag(ctx, x, y, tw, th, label, !!hover, !!pressed) };
      buttons.push(b);
      this.rowButtons.push({ b, x, y, w: tw, h: th, whole: true });
    });
    // The arrows at the window's ends, over the cards: shown while the row can go that way.
    const ay = view.y + (view.h - START.arrow) / 2;
    const prev = this.arrowButton('carousel-prev', view.x + 14, ay, -1);
    const next = this.arrowButton('carousel-next', view.x + view.w - 14 - START.arrow, ay, 1);
    buttons.push(prev, next);
    this.arrows = { prev, next };
    // The corner buttons.
    const c = START.corner;
    const right = SW - START.cornerX - c;
    buttons.push(this.cornerButton('quit', START.cornerX, 'quit'));
    buttons.push(this.cornerButton('help', right - TOUCH_GAP - c, 'help'));
    buttons.push(this.cornerButton('gear', right, 'gear'));
    this.placeRow();
    this.card.set((ctx) => {
      ctx.clearRect(0, 0, this.card.width, this.card.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      // The outer box: timber rim round the paper, a margin of clear space outside it.
      const m = START.margin;
      roundRect(ctx, m, m, SW - m * 2, H - m * 2, START.radius);
      ctx.fillStyle = SKETCH.timber;
      ctx.fill();
      roundRect(ctx, m + START.rim, m + START.rim, SW - (m + START.rim) * 2, H - (m + START.rim) * 2, START.radius - START.rim);
      ctx.fillStyle = SKETCH.paper;
      ctx.fill();
      // The logo between the corner buttons (the name in the lettering until it loads).
      const lh = 104;
      if (logo) {
        const lw = (lh * logo.width) / logo.height;
        ctx.drawImage(logo, (SW - lw) / 2, START.cornerY - 8, lw, lh);
      } else text(ctx, 'Café Chaos', SW / 2, START.cornerY + c / 2, 44, SKETCH.ink);
      // The corner buttons' names, under each.
      const ly = START.cornerY + c + 22;
      text(ctx, 'Quit', START.cornerX + c / 2, ly, START.label, SKETCH.soft);
      text(ctx, 'How to play', right - TOUCH_GAP - c / 2, ly, START.label, SKETCH.soft);
      text(ctx, 'Settings', right + c / 2, ly, START.label, SKETCH.soft);
      // The café to come (no button: it cannot be picked).
      const soon = entries.length - 1;
      this.drawRowCard(ctx, soon * step, null, false, false);
      text(ctx, this.scrollMax > 0 ? 'Pinch a café to play  ·  drag the row for more' : 'Pinch a café to play', SW / 2, START.hintY, 24, SKETCH.soft, 'center', false);
      ctx.restore();
    }, buttons);
  }

  /** How far the row can scroll (design units): its cards' width past the window. */
  private scrollMax = 0;

  private clampScroll(v: number): number {
    return Math.max(0, Math.min(this.scrollMax, v));
  }

  /** Where the row comes to rest: each card's left edge at the window's, as far as the row goes. */
  private get stops(): number[] {
    const step = START.cardW + START.cardGap;
    const out: number[] = [];
    for (let i = 0; i * step < this.scrollMax; i++) out.push(i * step);
    out.push(this.scrollMax);
    return out;
  }

  /**
   * Move the row's buttons to where it is scrolled: each card's press area is
   * the part of it inside the window (none once it has left), a tag's only
   * while it is all inside; the arrows show while the row can go their way.
   */
  private placeRow(): void {
    const { view } = START;
    const k = this.k;
    for (const r of this.rowButtons) {
      const x = view.x + r.x - this.scroll;
      const l = Math.max(x, view.x);
      const rr = Math.min(x + r.w, view.x + view.w);
      const show = r.whole ? l === x && rr === x + r.w : rr - l > 8;
      r.b.x = show ? l * k : -1e4;
      r.b.w = show ? (rr - l) * k : 0;
      r.b.y = r.y * k;
      r.b.h = r.h * k;
    }
    const { prev, next } = this.arrows;
    if (prev) prev.w = this.scroll > 1 ? START.arrow * k : 0;
    if (next) next.w = this.scroll < this.scrollMax - 1 ? START.arrow * k : 0;
  }

  /** The row one stop along (`by` +1 or -1), easing there. */
  carouselStep(by: number): void {
    const stops = this.stops;
    const at = this.scrollTo;
    const to = by > 0 ? stops.find((s) => s > at + 1) : [...stops].reverse().find((s) => s < at - 1);
    if (to === undefined) return;
    this.scrollTo = to;
  }

  /** Is a point of the card (canvas pixels) in the café row's window? */
  inCarousel(px: number, py: number): boolean {
    if (this.cardKind !== 'start') return false;
    const { view } = START;
    const x = px / this.k;
    const y = py / this.k;
    return x >= view.x && x <= view.x + view.w && y >= view.y && y <= view.y + view.h;
  }

  /** A café's card in the row (pressed on letting go, so the row can be dragged from it). */
  isCafeCard(id: string): boolean {
    return id.startsWith('play-');
  }

  /** How far a pinch must move along the card (canvas pixels) before it drags the row and presses nothing. */
  get dragSlop(): number {
    return 22 * this.k;
  }

  /** A pinch on the row: it starts to drag. */
  dragBegin(): void {
    this.dragFrom = this.scroll;
  }

  /** The pinch has moved `dx` canvas pixels along the card since it began: the row follows it (a little give past its ends). */
  dragBy(dx: number): void {
    if (this.dragFrom === null) return;
    const v = this.dragFrom - dx / this.k;
    const give = 40;
    this.scroll = v < 0 ? -give * (1 - Math.exp(v / give)) : v > this.scrollMax ? this.scrollMax + give * (1 - Math.exp(-(v - this.scrollMax) / give)) : v;
    this.scrollTo = this.scroll;
    this.placeRow();
    this.card.paint();
  }

  /** The pinch let go: the row eases to the stop it was dragged towards (or the nearest). */
  dragEnd(): void {
    if (this.dragFrom === null) return;
    const from = this.dragFrom;
    this.dragFrom = null;
    const stops = this.stops;
    const moved = this.scroll - from;
    let to = stops.reduce((best, s) => (Math.abs(s - this.scroll) < Math.abs(best - this.scroll) ? s : best), stops[0] ?? 0);
    // A short flick still goes one stop the way it was dragged.
    if (Math.abs(moved) > 40 && to === stops.reduce((best, s) => (Math.abs(s - from) < Math.abs(best - from) ? s : best), stops[0] ?? 0)) {
      to = (moved > 0 ? stops.find((s) => s > from + 1) : [...stops].reverse().find((s) => s < from - 1)) ?? to;
    }
    this.scrollTo = this.clampScroll(to);
  }

  /**
   * A card in the row, `x` along it (design units): the café's picture
   * filling a rounded card, a dark shadow up from its bottom, and its name
   * and state over the shadow in cream. No café (`t` null): the café to
   * come, a placeholder picture and Coming Soon. Clipped to the window.
   */
  private drawRowCard(ctx: CanvasRenderingContext2D, x0: number, t: CafeTile | null, hover: boolean, pressed: boolean): void {
    const { view } = START;
    const w = START.cardW;
    const h = view.h;
    const x = view.x + x0 - this.scroll;
    if (x + w < view.x || x > view.x + view.w) return;
    const dip = pressed ? 6 : 0;
    const y = view.y + dip;
    // (Drawn in design units: the caller has scaled the canvas.)
    ctx.save();
    // The window: nothing of the row is drawn outside it.
    ctx.beginPath();
    ctx.rect(view.x, view.y - 4, view.w, view.h + 12);
    ctx.clip();
    ctx.save();
    roundRect(ctx, x, y, w, h, START.cardRadius);
    ctx.clip();
    ctx.fillStyle = '#2a2420';
    ctx.fillRect(x, y, w, h);
    const img = t ? covers[t.id] : null;
    if (t && img) {
      // Cover the card: cropped from the middle, never stretched.
      const top = img.height * ART[t.id].top;
      const ih0 = img.height - top;
      const s = Math.max(w / img.width, h / ih0);
      const iw = w / s;
      const ih = h / s;
      ctx.drawImage(img, (img.width - iw) / 2, top + (ih0 - ih) / 2, iw, ih, x, y, w, h);
    } else if (!t) this.drawSoon(ctx, x, y, w, h);
    // The shadow the words sit on.
    const g = ctx.createLinearGradient(0, y + h * 0.42, 0, y + h);
    g.addColorStop(0, 'rgba(18, 12, 8, 0)');
    g.addColorStop(0.55, 'rgba(18, 12, 8, 0.62)');
    g.addColorStop(1, 'rgba(18, 12, 8, 0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // Today's forecast (the Canadian café), a paper band above the name.
    if (t?.forecast) this.forecastBand(ctx, t.forecast, x, y + h - 104, w);
    if (t?.loading) {
      ctx.fillStyle = 'rgba(18, 12, 8, 0.45)';
      ctx.fillRect(x, y, w, h);
    }
    if (hover) {
      const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 0.75);
      glow.addColorStop(0, 'rgba(255,214,140,.22)');
      glow.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    // Its edge: ink, or lantern light while a hand is on it.
    roundRect(ctx, x, y, w, h, START.cardRadius);
    ctx.lineWidth = hover ? 7 : 3.5;
    ctx.strokeStyle = hover ? SKETCH.lantern : t ? SKETCH.ink : 'rgba(22,23,29,.55)';
    ctx.stroke();
    // The name and its state.
    const name = t ? t.name.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Coming Soon';
    const state = !t ? 'A new café is on its way' : t.loading ? 'Loading…' : !t.owned ? 'Free trial' : t.started ? `Level ${t.level} · ${t.coins.toLocaleString('en')} coins` : this.start.lesson ? 'New · starts with a lesson' : 'New';
    this.fitText(ctx, name, x + 22, y + h - 66, 42, w - 44, CREAM, true);
    this.fitText(ctx, state, x + 22, y + h - 26, 26, w - 44, t ? '#e8dcc6' : '#cfc3ae', false);
    ctx.restore();
  }

  /** Text that fits `width` (design units): smaller if it must be. */
  private fitText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, width: number, color: string, heavy: boolean): void {
    ctx.font = font(size, heavy);
    const over = ctx.measureText(s).width / width;
    text(ctx, s, x, y, over > 1 ? Math.floor(size / over) : size, color, 'left', heavy);
  }

  /** The café to come (a Brazilian café): a placeholder, warm hills under a sunset over the sea, toned down. */
  private drawSoon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const sky = ctx.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#2f6f6a');
    sky.addColorStop(0.5, '#d99a4a');
    sky.addColorStop(0.62, '#e8b765');
    sky.addColorStop(0.63, '#2f7d78');
    sky.addColorStop(1, '#1d4e4b');
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h);
    // The sun, low over the sea.
    ctx.fillStyle = 'rgba(250, 222, 150, 0.9)';
    ctx.beginPath();
    ctx.arc(x + w * 0.66, y + h * 0.58, w * 0.12, Math.PI, 0);
    ctx.fill();
    // Two rounded peaks by the shore, and a palm.
    ctx.fillStyle = '#1f3b2c';
    ctx.beginPath();
    ctx.moveTo(x - 10, y + h * 0.63);
    ctx.bezierCurveTo(x + w * 0.05, y + h * 0.3, x + w * 0.24, y + h * 0.2, x + w * 0.3, y + h * 0.4);
    ctx.bezierCurveTo(x + w * 0.34, y + h * 0.52, x + w * 0.38, y + h * 0.6, x + w * 0.42, y + h * 0.63);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + h * 0.63);
    ctx.bezierCurveTo(x + w * 0.36, y + h * 0.46, x + w * 0.46, y + h * 0.44, x + w * 0.52, y + h * 0.63);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1f3b2c';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    const px = x + w * 0.86;
    const py = y + h * 0.63;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px - 6, py - h * 0.18, px - 2, py - h * 0.34);
    ctx.stroke();
    ctx.lineWidth = 5;
    for (const [dx, dy] of [[-40, 6], [-30, 26], [36, 4], [30, 26], [4, -18]] as const) {
      ctx.beginPath();
      ctx.moveTo(px - 2, py - h * 0.34);
      ctx.quadraticCurveTo(px - 2 + dx * 0.6, py - h * 0.34 - 14, px - 2 + dx, py - h * 0.34 + dy);
      ctx.stroke();
    }
    // Toned down: not open yet.
    ctx.fillStyle = 'rgba(40, 36, 32, 0.35)';
    ctx.fillRect(x, y, w, h);
  }

  /** A tag on a café's picture (New game, Buy): paper, ink, a lantern glow when lit. Clipped to the window. */
  private drawTag(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, label: string, hover: boolean, pressed: boolean): void {
    const { view } = START;
    const x = view.x + x0 - this.scroll;
    if (x + w < view.x || x > view.x + view.w) return;
    const y = y0 + (pressed ? 6 : 0);
    ctx.save();
    ctx.scale(this.k, this.k);
    ctx.beginPath();
    ctx.rect(view.x, view.y - 4, view.w, view.h + 12);
    ctx.clip();
    roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = hover ? HOVER.plain : 'rgba(217, 207, 190, 0.94)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = SKETCH.ink;
    ctx.stroke();
    if (hover) this.lantern(ctx, x, y, w, h);
    ctx.font = font(28);
    const size = Math.min(28, Math.floor((28 * (w - 32)) / ctx.measureText(label).width));
    text(ctx, label, x + w / 2, y + h / 2 + 2, size, SKETCH.ink);
    ctx.restore();
  }

  /** An arrow at an end of the café row (a round paper button with a chevron), hidden while the row cannot go that way. */
  private arrowButton(id: string, x: number, y: number, dir: number): Button {
    const k = this.k;
    const d = START.arrow;
    return {
      id, label: dir > 0 ? 'More cafés' : 'Back', x: x * k, y: y * k, w: d * k, h: d * k, bare: true,
      draw: (ctx, b, hover, pressed) => {
        if (b.w === 0) return;
        ctx.save();
        ctx.scale(k, k);
        const cx = x + d / 2;
        const cy = y + d / 2 + (pressed ? 4 : 0);
        ctx.beginPath();
        ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
        ctx.fillStyle = hover ? HOVER.plain : 'rgba(217, 207, 190, 0.94)';
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = SKETCH.ink;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - dir * 8, cy - 16);
        ctx.lineTo(cx + dir * 10, cy);
        ctx.lineTo(cx - dir * 8, cy + 16);
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
      },
    };
  }

  /** A small square corner button (Quit, How to play, Settings): its colour, a cream picture, lighter when lit. */
  private cornerButton(id: 'quit' | 'help' | 'gear', x: number, kind: keyof typeof CORNER): Button {
    const k = this.k;
    const s = START.corner;
    const y = START.cornerY;
    const c = CORNER[kind];
    const label = kind === 'quit' ? 'Quit' : kind === 'help' ? 'How to play' : 'Settings';
    return {
      id, label, x: x * k, y: y * k, w: s * k, h: s * k, bare: true,
      draw: (ctx, _b, hover, pressed) => {
        ctx.save();
        ctx.scale(k, k);
        const dy = y + (pressed ? 5 : 0);
        roundRect(ctx, x, dy, s, s, 20);
        ctx.fillStyle = hover ? c.lit : c.fill;
        ctx.fill();
        ctx.lineWidth = hover ? 6 : 3.5;
        ctx.strokeStyle = hover ? SKETCH.lantern : c.deep;
        ctx.stroke();
        const cx = x + s / 2;
        const cy = dy + s / 2;
        ctx.strokeStyle = CREAM;
        ctx.fillStyle = CREAM;
        ctx.lineCap = 'round';
        ctx.lineWidth = 6;
        if (kind === 'quit') {
          // A power sign: a ring open at the top, and a stroke through the gap.
          ctx.beginPath();
          ctx.arc(cx, cy + 3, 21, -Math.PI / 2 + 0.75, -Math.PI / 2 - 0.75 + Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy - 23);
          ctx.lineTo(cx, cy - 2);
          ctx.stroke();
        } else if (kind === 'help') {
          text(ctx, '?', cx, cy + 3, 54, CREAM);
        } else {
          // A gear: eight teeth round a ring.
          ctx.save();
          ctx.translate(cx, cy);
          for (let i = 0; i < 8; i++) {
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-5.5, -27, 11, 12);
          }
          ctx.restore();
          ctx.beginPath();
          ctx.arc(cx, cy, 17, 0, Math.PI * 2);
          ctx.lineWidth = 9;
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  }

  /**
   * Today's forecast over the foot of a café's picture (docs/CANADA-CHALLENGES.md):
   * a paper band, the weather's icon and its one line, `bottom` the picture's foot.
   */
  private forecastBand(ctx: CanvasRenderingContext2D, f: { id: 'sunny' | 'snap' | 'snow'; line: string }, x: number, bottom: number, w: number): void {
    const H = 44;
    const y = bottom - H;
    ctx.save();
    ctx.fillStyle = 'rgba(244, 236, 220, 0.92)';
    ctx.fillRect(x, y, w, H);
    const r = 15;
    const cx = x + 10 + r;
    const cy = y + H / 2;
    weatherIcon(ctx, f.id, cx, cy, r);
    // 27 units at most (the card's smallest reading size), smaller only if the line would not fit.
    let size = 27;
    const room = w - (cx + r + 10 - x) - 8;
    ctx.font = font(size, false);
    while (size > 22 && ctx.measureText(f.line).width > room) ctx.font = font(--size, false);
    // Still too long (the start card's narrower café cards): cut at a word, with an ellipsis.
    let line = f.line;
    while (ctx.measureText(line).width > room && line.includes(' ')) line = `${line.slice(0, line.lastIndexOf(' ')).replace(/[.,;:]$/, '')}…`.replace(/……$/, '…');
    text(ctx, line, cx + r + 10, cy + 1, size, SKETCH.ink, 'left', false);
    ctx.restore();
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
    const rows = { music: 170, sounds: 170 + 84 + 100, hints: 170 + (84 + 100) * 2 - 40 };
    const closeY = rows.hints + 84 + TOUCH_GAP + 8;
    // Fitted to its rows: Music, Sounds, Seat hints, CLOSE, PAD under it.
    const fit = closeY + 90 + PAD;
    if (fit !== H) {
      this.sheet.resize(MENU_SIZE.width, (fit * this.k) / PPM);
      this.layoutSettings();
      return;
    }
    const buttons: Button[] = [];
    this.stepper(buttons, null, null, 'music', rows.music, 'Music', s.music);
    this.stepper(buttons, null, null, 'sounds', rows.sounds, 'Sounds', s.sounds);
    // Seat hints: a switch, moss when on (the words say On or Off: not by colour alone).
    const tw = 200;
    buttons.push(this.button(this.sheet, 'hints', W - PAD - tw, rows.hints, tw, 84, s.hints ? 'primary' : 'secondary', s.hints ? 'On' : 'Off', undefined, false, 34));
    buttons.push(this.button(this.sheet, 'close', PAD, closeY, W - PAD * 2, 90, 'primary', 'CLOSE'));
    this.sheet.set((ctx) => {
      ctx.clearRect(0, 0, this.sheet.width, this.sheet.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      const rc = pen(this.sheet.canvas);
      this.paper(ctx, rc, 0, H);
      text(ctx, 'Settings', W / 2, 74, 56, SKETCH.ink);
      this.stepper([], ctx, rc, 'music', rows.music, 'Music', s.music);
      this.stepper([], ctx, rc, 'sounds', rows.sounds, 'Sounds', s.sounds);
      text(ctx, 'Seat hints', PAD + 8, rows.hints + 30, 36, SKETCH.ink, 'left');
      text(ctx, 'Seats that match glow.', PAD + 8, rows.hints + 66, 26, SKETCH.soft, 'left', false);
      ctx.restore();
    }, buttons);
  }

  /**
   * New game: the safe choice first and moss (GO BACK), the one that deletes
   * under it in koi red, as Leave the trial and Quit (NN/g: a dangerous
   * action is never the default).
   */
  private layoutWarn(): void {
    const s = this.warn;
    const lost = [`${s.coins.toLocaleString('en')} coins`, `${s.staff} ${s.staff === 1 ? 'barista' : 'baristas'}`].concat(s.level > 1 ? [`level ${s.level}`] : []);
    const sentence = `This deletes its ${lost.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
    this.layoutQuestion(`Start the ${s.cafe} again?`, sentence, [
      { id: 'keep', kind: 'primary', label: 'GO BACK' },
      { id: 'fresh', kind: 'danger', label: 'DELETE AND START' },
    ]);
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
}

/** The forecast's icon, centred at (x, y), radius r: a sun, a snowflake on blue (cold snap), a snow cloud. */
function weatherIcon(ctx: CanvasRenderingContext2D, id: 'sunny' | 'snap' | 'snow', x: number, y: number, r: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  if (id === 'sunny') {
    ctx.strokeStyle = '#d9822b';
    ctx.lineWidth = r * 0.16;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
      ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#f2b62e';
    ctx.fill();
  } else if (id === 'snap') {
    snowflake(ctx, x, y - 1, r);
  } else {
    // A grey cloud and three flakes under it.
    ctx.fillStyle = '#8c98a6';
    ctx.beginPath();
    ctx.arc(x - r * 0.4, y - r * 0.15, r * 0.38, 0, Math.PI * 2);
    ctx.arc(x + r * 0.05, y - r * 0.35, r * 0.48, 0, Math.PI * 2);
    ctx.arc(x + r * 0.5, y - r * 0.12, r * 0.36, 0, Math.PI * 2);
    ctx.rect(x - r * 0.75, y - r * 0.15, r * 1.6, r * 0.38);
    ctx.fill();
    ctx.fillStyle = '#3f86c9';
    for (const dx of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.arc(x + dx * r, y + r * 0.62 + (dx === 0 ? r * 0.15 : 0), r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
