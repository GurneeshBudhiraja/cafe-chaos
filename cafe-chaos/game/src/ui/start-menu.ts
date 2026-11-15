/**
 * The start menu: a card that stands at the edge of the player's table,
 * facing them, within reach (pressed with a fingertip, like every button
 * in the game). It is drawn in the café's own colours with a timber frame
 * round shoji paper, and its lines boil (redrawn with a new seed ten times
 * a second) while it is up.
 *
 *   ┌────────────────────────────┐
 *   │ [BEST 6:12]   cover art  ⚙ │
 *   │        CAFÉ CHAOS          │
 *   │ [        CONTINUE        ] │   40 coins · 2 baristas
 *   │ [        NEW GAME        ] │
 *   │         (?) How to play    │
 *   └────────────────────────────┘
 *
 * The first time (no save) there is only NEW GAME, and the card is shorter
 * (it stands on the table, so it is drawn from the bottom up). With no best
 * time there is no badge. Settings and the New Game warning open on a
 * second card in front of it (`sheet`): the card behind is dimmed and does
 * not take presses until the sheet closes.
 *
 * Everything is drawn in design units (720 across) and scaled to the panel.
 */

import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import { Panel, type Button } from './panel.js';
import { hand, pen, SKETCH } from './sketch.js';

/** The two cards' sizes (metres). The start card is 24 cm across; the sheet the same width. */
export const MENU_SIZE = { width: 0.24, height: 0.267, sheetHeight: 0.22 };
/** Design units across. */
const W = 720;
const PAD = 36;
const GAP = 24;
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
  /** Café size as a percentage. */
  size: number;
  canGrow: boolean;
  canShrink: boolean;
  /** Offer "Move the café" (before a run only). */
  move: boolean;
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
  /** What the sheet shows ('none' when it is closed). */
  sheetKind: 'none' | 'settings' | 'warn' = 'none';
  private seed = 1;
  private clock = 0;
  private start: StartState = { kind: 'first', coins: 0, staff: 1, best: null };
  private settings: SettingsState = { music: 2, sounds: 3, size: 100, canGrow: true, canShrink: true, move: true };
  private warn: WarnState = { coins: 0, staff: 1, best: null };
  private readonly k: number;

  constructor() {
    for (const p of [this.card, this.sheet]) {
      p.frame = false;
      p.turn = 3;
    }
    this.k = this.card.width / W;
    coverListeners.push(() => this.card.paint());
  }

  /** Draw the start card for this state (and put it up). */
  showStart(state: StartState): void {
    this.start = state;
    this.layoutStart();
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
  }

  // ----------------------------------------------------------- drawing

  private o(more: Options = {}): Options {
    return { seed: this.seed, roughness: 1.3, bowing: 1.1, strokeWidth: 3.5, stroke: SKETCH.ink, ...more };
  }

  /** A card's paper: a timber frame round shoji paper, from `top` (design units) down to `h`. */
  private paper(ctx: CanvasRenderingContext2D, rc: RoughCanvas, top: number, h: number): void {
    ctx.fillStyle = SKETCH.timber;
    ctx.fillRect(0, top, W, h - top);
    rc.rectangle(14, top + 14, W - 28, h - top - 28, this.o({ fill: SKETCH.paper, fillStyle: 'solid', stroke: SKETCH.timber, strokeWidth: 3 }));
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
    const k = this.k;
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

  private round(panel: Panel, id: string, cx: number, cy: number, r: number, glyph: string): Button {
    const k = this.k;
    return {
      id, label: glyph, x: (cx - r) * k, y: (cy - r) * k, w: 2 * r * k, h: 2 * r * k, bare: true,
      draw: (ctx, _b, hover, pressed) => {
        const rc = pen(panel.canvas);
        ctx.save();
        ctx.scale(k, k);
        const dip = pressed ? 4 : 0;
        rc.circle(cx, cy + dip, 2 * r, this.o({ fill: hover ? SKETCH.lantern : SKETCH.paper, fillStyle: 'solid', seed: this.seed + cx }));
        text(ctx, glyph, cx, cy + 2 + dip, Math.round(r * 1.1), SKETCH.ink);
        ctx.restore();
      },
    };
  }

  private layoutStart(): void {
    const s = this.start;
    const returning = s.kind === 'returning';
    const used = PAD + ART_H + GAP + 150 + (returning ? GAP + 100 : 0) + GAP + 72 + PAD;
    const H = Math.round(this.card.height / this.k);
    const top = H - used;
    const buttons: Button[] = [];
    const ax = PAD;
    const ay = top + PAD;
    const aw = W - PAD * 2;
    buttons.push(this.round(this.card, 'gear', ax + aw - 56, ay + 56, 38, '⚙'));
    let y = ay + ART_H + GAP;
    if (returning) buttons.push(this.button(this.card, 'continue', PAD, y, W - PAD * 2, 150, 'primary', 'CONTINUE', `${s.coins.toLocaleString('en')} coins · ${s.staff} ${s.staff === 1 ? 'barista' : 'baristas'}`));
    else buttons.push(this.button(this.card, 'new', PAD, y, W - PAD * 2, 150, 'primary', 'NEW GAME'));
    y += 150;
    if (returning) {
      y += GAP;
      buttons.push(this.button(this.card, 'new', PAD, y, W - PAD * 2, 100, 'secondary', 'NEW GAME'));
      y += 100;
    }
    y += GAP;
    const helpY = y;
    const k = this.k;
    buttons.push({
      id: 'help', label: 'How to play', x: (W / 2 - 160) * k, y: helpY * k, w: 320 * k, h: 72 * k, bare: true,
      draw: (ctx, _b, hover, pressed) => {
        const rc = pen(this.card.canvas);
        ctx.save();
        ctx.scale(k, k);
        const dip = pressed ? 4 : 0;
        if (hover) this.lantern(ctx, W / 2 - 160, helpY, 320, 72);
        rc.circle(W / 2 - 112, helpY + 36 + dip, 52, this.o({ fill: SKETCH.paper, fillStyle: 'solid', strokeWidth: 3, seed: this.seed + 99 }));
        text(ctx, '?', W / 2 - 112, helpY + 38 + dip, 32, SKETCH.ink);
        text(ctx, 'How to play', W / 2 - 72, helpY + 37 + dip, 34, SKETCH.ink, 'left');
        ctx.restore();
      },
    });
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

  /** A row of −, a five-step bar and +. */
  private stepper(buttons: Button[], ctx: CanvasRenderingContext2D | null, rc: RoughCanvas | null, id: string, y: number, label: string, level: number, max = LEVELS, readout?: string): void {
    const bx = 250;
    const size = 84;
    const right = W - PAD - size;
    if (!ctx || !rc) {
      buttons.push(this.button(this.sheet, `${id}-`, bx, y - size / 2, size, size, level <= 0 ? 'off' : 'secondary', '−', undefined, true));
      buttons.push(this.button(this.sheet, `${id}+`, right, y - size / 2, size, size, level >= max ? 'off' : 'secondary', '+', undefined, true));
      return;
    }
    text(ctx, label, PAD, y, 34, SKETCH.ink, 'left');
    const x0 = bx + size + 18;
    const x1 = right - 18;
    if (readout) {
      text(ctx, readout, (x0 + x1) / 2, y + 2, 40, SKETCH.ink);
      return;
    }
    const n = LEVELS;
    const gap = 10;
    const sw = (x1 - x0 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const on = i < level;
      rc.rectangle(x0 + i * (sw + gap), y - 26, sw, 52, this.o({ fill: on ? SKETCH.moss : '#cfc3ae', fillStyle: 'solid', stroke: on ? SKETCH.mossDeep : '#b6a993', seed: this.seed + y + i }));
    }
    if (level === 0) text(ctx, 'OFF', (x0 + x1) / 2, y + 2, 30, SKETCH.soft);
  }

  private layoutSettings(): void {
    const s = this.settings;
    const H = Math.round(this.sheet.height / this.k);
    const rows = { music: 150, sounds: 250, size: 350 };
    const buttons: Button[] = [];
    this.stepper(buttons, null, null, 'music', rows.music, 'Music', s.music);
    this.stepper(buttons, null, null, 'sounds', rows.sounds, 'Sounds', s.sounds);
    this.stepper(buttons, null, null, 'size', rows.size, 'Café size', s.canShrink ? 1 : 0, s.canGrow ? 2 : 1);
    // The size buttons are − and + only: off at the ends.
    const half = (W - PAD * 2 - GAP) / 2;
    const actionsY = 418;
    if (s.move) {
      buttons.push(this.button(this.sheet, 'move', PAD, actionsY, half, 84, 'secondary', 'Move the café'));
      buttons.push(this.button(this.sheet, 'how', PAD + half + GAP, actionsY, half, 84, 'secondary', 'How to play'));
    } else buttons.push(this.button(this.sheet, 'how', PAD, actionsY, W - PAD * 2, 84, 'secondary', 'How to play'));
    buttons.push(this.button(this.sheet, 'close', PAD, actionsY + 84 + GAP, W - PAD * 2, 84, 'primary', 'CLOSE'));
    this.sheet.set((ctx) => {
      ctx.clearRect(0, 0, this.sheet.width, this.sheet.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      const rc = pen(this.sheet.canvas);
      this.paper(ctx, rc, 0, H);
      text(ctx, 'Settings', PAD, 70, 56, SKETCH.ink, 'left');
      this.stepper([], ctx, rc, 'music', rows.music, 'Music', s.music);
      this.stepper([], ctx, rc, 'sounds', rows.sounds, 'Sounds', s.sounds);
      this.stepper([], ctx, rc, 'size', rows.size, 'Café size', 0, LEVELS, `${s.size}%`);
      ctx.restore();
    }, buttons);
  }

  private layoutWarn(): void {
    const s = this.warn;
    const H = Math.round(this.sheet.height / this.k);
    const lost = [`${s.coins.toLocaleString('en')} coins`, `${s.staff} ${s.staff === 1 ? 'barista' : 'baristas'}`].concat(s.best ? [`best time (${s.best})`] : []);
    const sentence = `This deletes your ${lost.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
    const buttons: Button[] = [
      this.button(this.sheet, 'keep', PAD, 300, W - PAD * 2, 150, 'primary', 'KEEP MY CAFÉ'),
      this.button(this.sheet, 'fresh', PAD, 300 + 150 + GAP, W - PAD * 2, 100, 'danger', 'DELETE AND START'),
    ];
    this.sheet.set((ctx) => {
      ctx.clearRect(0, 0, this.sheet.width, this.sheet.height);
      ctx.save();
      ctx.scale(this.k, this.k);
      const rc = pen(this.sheet.canvas);
      this.paper(ctx, rc, 0, H);
      text(ctx, 'Start a new café?', PAD, 80, 54, SKETCH.ink, 'left');
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
      lines.forEach((l, i) => text(ctx, l, PAD, 160 + i * 48, 34, SKETCH.soft, 'left', false));
      ctx.restore();
    }, buttons);
  }
}
