/**
 * The start menu: a card that stands at the edge of the player's table,
 * facing them, within reach (pressed with a fingertip, like every button
 * in the game). It is drawn in the café's own colours with a timber frame
 * round shoji paper, and its lines boil (redrawn with a new seed ten times
 * a second) while it is up.
 *
 *   ┌────────────────────────────┐
 *   │ [BEST 6:12]  cover art [Quit]│
 *   │        CAFÉ CHAOS          │
 *   │ [        CONTINUE        ] │   40 coins · 2 baristas
 *   │ [        NEW GAME        ] │
 *   │         (?) How to play    │
 *   └────────────────────────────┘
 *
 * The first time (no save) there is only NEW GAME, and the card is shorter
 * (it stands on the table, so it is drawn from the bottom up). With no best
 * time there is no badge. Quit sits in the cover art's top corner, out of
 * the way of the buttons pressed often, and asks first. Settings, the New
 * Game warning and the Quit question open on a
 * second card in front of it (`sheet`): the card behind is dimmed and does
 * not take presses until the sheet closes.
 *
 * Everything is drawn in design units (720 across) and scaled to the panel.
 */

import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import { Panel, type Button } from './panel.js';
import { hand, pen, SKETCH, sketchCoin } from './sketch.js';

/** The two cards' sizes (metres). The start card is 24 cm across; the sheet the same width. */
export const MENU_SIZE = { width: 0.24, height: 0.28, sheetHeight: 0.21 };
/**
 * How to play: the same card as on the web page (index.html #how), wider for
 * its three steps side by side: 33 cm across, drawn in 1080 design units.
 * Its paper is centred on the panel and only as tall as what is on it (the
 * panel leaves room for longer text).
 */
export const HOW_SIZE = { width: 0.33, height: 0.32 };
const HW = 1080;
/** One step of How to play: a picture (drawn once loaded), a title and a line. */
export interface HowStep {
  title: string;
  text: string;
}
/** Design units across. */
const W = 720;
const PAD = 36;
const GAP = 24;
/** Between two things you press: 40 design units (about 13 mm), over Meta's 12 mm. */
const TOUCH_GAP = 40;
const ART_H = 330;
const BOIL_HZ = 10;
/** Volume and size steps. */
export const LEVELS = 5;

export interface StartState {
  /** 'first': no save. 'returning': a save to continue. */
  kind: 'first' | 'returning';
  coins: number;
  staff: number;
  /** Best time as m:ss, or null. */
  best: string | null;
}
export interface SettingsState {
  music: number;
  sounds: number;
}
/** The pause card: the time open, and the best time (m:ss, or null). */
export interface PauseState {
  time: string;
  best: string | null;
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
  best: string | null;
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
  readonly card = new Panel('StartCard', MENU_SIZE.width, MENU_SIZE.height);
  readonly sheet = new Panel('MenuSheet', MENU_SIZE.width, MENU_SIZE.sheetHeight);
  readonly how = new Panel('HowCard', HOW_SIZE.width, HOW_SIZE.height);
  /** How to play's pictures, by step, once loaded (the game loads them; set one and paint `how`). */
  readonly howPictures: (HTMLImageElement | null)[] = [];
  private howSteps: HowStep[] = [];
  /** What the sheet shows ('none' when it is closed). */
  sheetKind: 'none' | 'settings' | 'warn' | 'quit' = 'none';
  /** What the card shows: the start menu, or (in a run) the pause card, the shop, or the count back in. */
  cardKind: 'start' | 'pause' | 'shop' | 'count' = 'start';
  private seed = 1;
  private clock = 0;
  private start: StartState = { kind: 'first', coins: 0, staff: 1, best: null };
  private settings: SettingsState = { music: 2, sounds: 3 };
  private warn: WarnState = { coins: 0, staff: 1, best: null };
  private readonly k: number;
  /** How to play's scale (metres per design unit). */
  private readonly kh: number;

  constructor() {
    for (const p of [this.card, this.sheet, this.how]) {
      p.frame = false;
      p.turn = 3;
    }
    this.k = this.card.width / W;
    this.kh = this.how.width / HW;
    coverListeners.push(() => this.card.paint());
  }

  /** How to play, in front of the eyes where the start card stands (the game hides the card behind). */
  showHow(steps: HowStep[]): void {
    this.howSteps = steps;
    this.layoutHow();
    this.how.show(true);
  }

  /** Draw the start card for this state (and put it up). */
  showStart(state: StartState): void {
    this.cardKind = 'start';
    this.start = state;
    this.layoutStart();
    this.card.show(true);
  }

  /** The pause card (in a run). */
  showPause(state: PauseState): void {
    this.cardKind = 'pause';
    this.layoutPause(state);
    this.card.show(true);
  }

  /** The shop (in a run, paused). Shown again after each hire. */
  showShop(state: ShopState): void {
    this.cardKind = 'shop';
    this.layoutShop(state);
    this.card.show(true);
  }

  /** The count back in from a pause: one big number, on the pause card's paper. */
  showCount(n: number): void {
    this.cardKind = 'count';
    this.layoutCount(n);
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
  private button(panel: Panel, id: string, x: number, y: number, w: number, h: number, kind: 'primary' | 'secondary' | 'danger' | 'off', label: string, sub?: string, glyph = false): Button {
    const k = panel === this.how ? this.kh : this.k;
    return {
      id, label, x: x * k, y: y * k, w: w * k, h: h * k, bare: true,
      draw: (ctx, _b, hover, pressed) => {
        const rc = pen(panel.canvas);
        ctx.save();
        ctx.scale(k, k);
        const dip = pressed ? 6 : 0;
        const fill = kind === 'primary' ? SKETCH.moss : kind === 'off' ? SKETCH.paper : hover ? '#e4d9c6' : SKETCH.paper;
        const stroke = kind === 'primary' ? SKETCH.mossDeep : kind === 'danger' ? SKETCH.koi : kind === 'off' ? '#b6a993' : SKETCH.ink;
        rc.rectangle(x, y + dip, w, h, this.o({ fill, fillStyle: 'solid', stroke, seed: this.seed + Math.round(x + y) }));
        if (hover && kind !== 'off') this.lantern(ctx, x, y + dip, w, h);
        const ink = kind === 'primary' ? '#f2ebdd' : kind === 'danger' ? SKETCH.koi : kind === 'off' ? '#b6a993' : SKETCH.ink;
        if (sub) {
          text(ctx, label, x + w / 2, y + h * 0.4 + dip, Math.round(h * 0.34), ink);
          text(ctx, sub, x + w / 2, y + h * 0.73 + dip, 28, kind === 'primary' ? '#f2ebdd' : SKETCH.soft, 'center', false);
        } else text(ctx, label, x + w / 2, y + h / 2 + 2 + dip, glyph ? 50 : Math.round(Math.min(h >= 140 ? 60 : 40, h * 0.42)), ink);
        ctx.restore();
      },
    };
  }

  private layoutStart(): void {
    const s = this.start;
    const returning = s.kind === 'returning';
    const used = PAD + ART_H + GAP + 150 + (returning ? TOUCH_GAP + 100 : 0) + TOUCH_GAP + 84 + PAD;
    const H = Math.round(this.card.height / this.k);
    const top = H - used;
    const buttons: Button[] = [];
    const ax = PAD;
    const ay = top + PAD;
    const aw = W - PAD * 2;
    let y = ay + ART_H + GAP;
    if (returning) buttons.push(this.button(this.card, 'continue', PAD, y, W - PAD * 2, 150, 'primary', 'CONTINUE', `${s.coins.toLocaleString('en')} coins · ${s.staff} ${s.staff === 1 ? 'barista' : 'baristas'}`));
    else buttons.push(this.button(this.card, 'new', PAD, y, W - PAD * 2, 150, 'primary', 'NEW GAME'));
    y += 150;
    if (returning) {
      y += TOUCH_GAP;
      buttons.push(this.button(this.card, 'new', PAD, y, W - PAD * 2, 100, 'secondary', 'NEW GAME'));
      y += 100;
    }
    y += TOUCH_GAP;
    // How to play and Settings side by side, near the middle (little reach).
    const half = (W - PAD * 2 - TOUCH_GAP) / 2;
    buttons.push(this.button(this.card, 'help', PAD, y, half, 84, 'secondary', '? How to play'));
    buttons.push(this.button(this.card, 'gear', PAD + half + TOUCH_GAP, y, half, 84, 'secondary', '⚙ Settings'));
    // Quit: in the cover art's top corner, away from the buttons pressed often (it asks first).
    const qw = 170;
    buttons.push(this.button(this.card, 'quit', ax + aw - 18 - qw, ay + 18, qw, 84, 'secondary', 'Quit'));
    this.card.set((ctx) => {
      ctx.clearRect(0, 0, this.card.width, this.card.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      const rc = pen(this.card.canvas);
      this.paper(ctx, rc, top, H);
      // The cover art: only here, behind the name.
      if (cover) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(ax, ay, aw, ART_H);
        ctx.clip();
        ctx.drawImage(cover, ax, ay, aw, ART_H);
        const g = ctx.createLinearGradient(0, ay + ART_H * 0.45, 0, ay + ART_H);
        g.addColorStop(0, 'rgba(22,23,29,0)');
        g.addColorStop(1, 'rgba(22,23,29,.85)');
        ctx.fillStyle = g;
        ctx.fillRect(ax, ay, aw, ART_H);
        ctx.restore();
      } else {
        ctx.fillStyle = '#2a2420';
        ctx.fillRect(ax, ay, aw, ART_H);
      }
      rc.rectangle(ax, ay, aw, ART_H, this.o({ strokeWidth: 3, seed: this.seed + 3 }));
      text(ctx, 'CAFÉ CHAOS', W / 2, ay + ART_H - 58, 78, '#f2ebdd');
      // Your best time: a lantern-coloured badge, only once there is one.
      if (returning && s.best) {
        ctx.font = font(30);
        const lw = ctx.measureText('BEST').width;
        ctx.font = font(44);
        const tw = ctx.measureText(s.best).width;
        const bx = ax + 18;
        const by = ay + 18;
        const bw = 24 + lw + 18 + tw + 24;
        rc.rectangle(bx, by, bw, 84, this.o({ fill: SKETCH.lantern, fillStyle: 'solid', stroke: SKETCH.timber, seed: this.seed + 50 }));
        text(ctx, 'BEST', bx + 24, by + 44, 30, SKETCH.ink, 'left');
        text(ctx, s.best, bx + bw - 22, by + 44, 44, SKETCH.ink, 'right');
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
   * How to play, laid out as on the web page: the title; two notes for
   * before you start (sit at a table, put down your controllers); the three
   * steps side by side, each a picture, a numbered title and a line; CLOSE.
   */
  private layoutHow(): void {
    const ctx = this.how.ctx;
    const H = Math.round(this.how.height / this.kh);
    const P = 54;
    const CW = HW - P * 2;
    const GAP_H = 24;
    const before = ['Sit at a table. The café stands on the table.', 'Put down your controllers. Use only your hands.'];
    const bw = (CW - 18) / 2;
    const beforeLines = before.map((b) => this.wrap(ctx, b, 30, false, bw - 36));
    const bh = Math.max(...beforeLines.map((l) => l.length)) * 40 + 30;
    const sw = (CW - GAP_H * 2) / 3;
    const ph = Math.round(sw * 0.75);
    const BADGE = 48;
    const steps = this.howSteps.map((st) => ({
      title: this.wrap(ctx, st.title, 33, true, sw - BADGE - 14),
      text: this.wrap(ctx, st.text, 27, false, sw),
    }));
    const titleH = Math.max(BADGE, ...steps.map((st) => st.title.length * 38));
    const textH = Math.max(0, ...steps.map((st) => st.text.length * 37));
    const CLOSE_H = 104;
    const used = P + 60 + 20 + bh + GAP_H + ph + 16 + titleH + 12 + textH + 30 + CLOSE_H + P;
    const top = Math.max(0, Math.round((H - used) / 2));
    const yBefore = top + P + 80;
    const ySteps = yBefore + bh + GAP_H;
    const yClose = top + used - P - CLOSE_H;
    const buttons = [this.button(this.how, 'back', P, yClose, CW, CLOSE_H, 'primary', 'CLOSE')];
    this.how.set((c) => {
      c.clearRect(0, 0, this.how.canvas.width, this.how.canvas.height);
      c.save();
      c.scale(this.kh, this.kh);
      const rc = pen(this.how.canvas);
      this.paper(c, rc, top, H, HW);
      text(c, 'How to play', HW / 2, top + P + 30, 52, SKETCH.ink);
      beforeLines.forEach((lines, i) => {
        const x = P + i * (bw + 18);
        rc.rectangle(x, yBefore, bw, bh, this.o({ fill: '#e4d9c6', fillStyle: 'solid', strokeWidth: 3, seed: this.seed + 20 + i }));
        const y0 = yBefore + bh / 2 - ((lines.length - 1) * 40) / 2;
        lines.forEach((l, j) => text(c, l, x + bw / 2, y0 + j * 40, 30, SKETCH.ink, 'center', false));
      });
      steps.forEach((st, i) => {
        const x = P + i * (sw + GAP_H);
        const img = this.howPictures[i];
        c.fillStyle = '#2a2420';
        c.fillRect(x, ySteps, sw, ph);
        if (img) {
          // Cover the frame (crop, never stretch).
          const s = Math.max(sw / img.width, ph / img.height);
          const iw = sw / s;
          const ih = ph / s;
          c.drawImage(img, (img.width - iw) / 2, (img.height - ih) / 2, iw, ih, x, ySteps, sw, ph);
        }
        rc.rectangle(x, ySteps, sw, ph, this.o({ strokeWidth: 3, seed: this.seed + 30 + i }));
        const yt = ySteps + ph + 16;
        c.fillStyle = SKETCH.moss;
        c.fillRect(x, yt, BADGE, BADGE);
        text(c, `${i + 1}`, x + BADGE / 2, yt + BADGE / 2 + 2, 30, '#f2ebdd');
        const ty = yt + (st.title.length === 1 ? BADGE / 2 : 19);
        st.title.forEach((l, j) => text(c, l, x + BADGE + 14, ty + j * 38 + 2, 33, SKETCH.ink, 'left'));
        const py = yt + titleH + 12 + 18;
        st.text.forEach((l, j) => text(c, l, x, py + j * 37, 27, SKETCH.soft, 'left', false));
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
    const lost = [`${s.coins.toLocaleString('en')} coins`, `${s.staff} ${s.staff === 1 ? 'barista' : 'baristas'}`].concat(s.best ? [`best time (${s.best})`] : []);
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
      text(ctx, 'Your coins and baristas are saved.', W / 2, 170, 34, SKETCH.soft, 'center', false);
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

  /** The pause card's measures (design units), shared with the count so the card does not jump between them. */
  private static readonly PAUSE_H = PAD + 174 + 140 + TOUCH_GAP + 96 + TOUCH_GAP + 96 + PAD + 14;

  private layoutPause(s: PauseState): void {
    const H = Math.round(this.card.height / this.k);
    const top = H - StartMenu.PAUSE_H;
    let y = top + PAD + 174;
    const buttons: Button[] = [this.button(this.card, 'resume', PAD, y, W - PAD * 2, 140, 'primary', 'RESUME')];
    y += 140 + TOUCH_GAP;
    const half = (W - PAD * 2 - TOUCH_GAP) / 2;
    buttons.push(this.button(this.card, 'how', PAD, y, half, 96, 'secondary', '? How to play'));
    buttons.push(this.button(this.card, 'settings', PAD + half + TOUCH_GAP, y, half, 96, 'secondary', '⚙ Settings'));
    y += 96 + TOUCH_GAP;
    buttons.push(this.button(this.card, 'end', PAD, y, W - PAD * 2, 96, 'danger', 'END THE EVENING'));
    this.card.set((ctx) => {
      ctx.clearRect(0, 0, this.card.width, this.card.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      this.paper(ctx, pen(this.card.canvas), top, H);
      text(ctx, 'Paused', W / 2, top + PAD + 64, 64, SKETCH.ink);
      text(ctx, s.best ? `${s.time}   ·   BEST ${s.best}` : s.time, W / 2, top + PAD + 136, 34, SKETCH.soft, 'center', false);
      ctx.restore();
    }, buttons);
  }

  private layoutCount(n: number): void {
    const H = Math.round(this.card.height / this.k);
    const top = H - StartMenu.PAUSE_H;
    this.card.set((ctx) => {
      ctx.clearRect(0, 0, this.card.width, this.card.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      this.paper(ctx, pen(this.card.canvas), top, H);
      text(ctx, 'Back in', W / 2, top + PAD + 90, 44, SKETCH.soft, 'center', false);
      text(ctx, `${n}`, W / 2, top + StartMenu.PAUSE_H * 0.58, 260, SKETCH.moss);
      ctx.restore();
    }, []);
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

  private layoutShop(s: ShopState): void {
    const H = Math.round(this.card.height / this.k);
    const ROW = 124;
    const ROW_GAP = 20;
    const used = PAD + 180 + s.rows.length * (ROW + ROW_GAP) - ROW_GAP + TOUCH_GAP + 110 + PAD + 14;
    const top = Math.max(0, H - used);
    const buttons: Button[] = [];
    let y = top + PAD + 180;
    const bw = 290;
    const bh = 100;
    s.rows.forEach((r) => {
      if (r.status !== 'working' && r.price !== undefined) {
        buttons.push(this.priceButton(this.card, r.status === 'hire' ? 'hire' : 'hire-later', W - PAD - bw, y + (ROW - bh) / 2, bw, bh, r.status === 'hire' ? 'primary' : 'off', 'HIRE', r.price));
      }
      y += ROW + ROW_GAP;
    });
    buttons.push(this.button(this.card, 'shop-close', PAD, y - ROW_GAP + TOUCH_GAP, W - PAD * 2, 110, 'secondary', 'CLOSE'));
    const tints = ['#7a9a6e', '#d48a8a', '#8aa3c9'];
    this.card.set((ctx) => {
      ctx.clearRect(0, 0, this.card.width, this.card.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      const rc = pen(this.card.canvas);
      this.paper(ctx, rc, top, H);
      text(ctx, 'Hire baristas', W / 2, top + PAD + 56, 56, SKETCH.ink);
      const coins = `${s.coins.toLocaleString('en')} coins`;
      ctx.font = font(36);
      const cw = ctx.measureText(coins).width;
      sketchCoin(rc, W / 2 - cw / 2 - 24, top + PAD + 128, 38, this.seed + 3, 2.5);
      text(ctx, coins, W / 2 - cw / 2 + 6, top + PAD + 130, 36, SKETCH.ink, 'left');
      let ry = top + PAD + 180;
      s.rows.forEach((r, i) => {
        this.portrait(rc, PAD + 58, ry + ROW / 2, 100, tints[i % tints.length], this.seed + 100 + i * 10);
        text(ctx, r.name, PAD + 132, ry + ROW / 2 + 2, 44, SKETCH.ink, 'left');
        if (r.status === 'working') text(ctx, 'Works for you', W - PAD - 14, ry + ROW / 2 + 2, 32, SKETCH.moss, 'right');
        ry += ROW + ROW_GAP;
      });
      ctx.restore();
    }, buttons);
  }
}
