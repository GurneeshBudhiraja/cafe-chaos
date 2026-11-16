/**
 * StripSystem: the scoreboard, drawn in sketch pen and hung at the
 * player's eye level, above the back of the café, turned to the player. It
 * is the one place to read how the evening is going:
 *
 *   [⏸] | (clock) 3:42 | (face) [▨▨▨▨▨▨▨□□□] | (coin) 46 [shop]
 *
 * - Pause, at the left end, and Shop, at the right end by the coins: the
 *   bar is out of reach, so they are pressed with the hand ray (point and
 *   pinch, GameSystem and hands/hand-ray.ts), or a fingertip if it is near.
 *   Each lights from inside when aimed at. Shop has a lantern dot with a +
 *   while the bank can pay for the next barista, and a moss check once all
 *   three work. Both are pale (and do nothing) outside a run.
 * - The clock, counting up, with the longest evening under it ("new
 *   record!" once this run has passed it).
 * - Happiness: a face and ten hatched segments, calm above 60 %, warn
 *   down to 30 %, danger below; the percentage beside them.
 * - The bank.
 *
 * The lines are hand-drawn but still (ui/sketch.ts): nothing wobbles. It
 * moves only when something happens: a segment lost drains away over half
 * a second (one gained fills in), coins coming in make the number pop,
 * and under 30 % the lit segments pulse slowly, once a second.
 *
 * At eye level, straight ahead over the café, it can be read without
 * looking down or away from the guests, and it is never under a hand. It
 * follows the player's eye height slowly (a lean or a nod does not move
 * it), stays above the café's tallest point, and keeps its real size
 * whatever the café's scale (ui/panel.ts). GameSystem shows it.
 */

import { Color, createSystem, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, Euler } from '@iwsdk/core';
import { HAPPINESS } from '../game/rules.js';
import { Panel, type Button } from '../ui/panel.js';
import { hand, line, moodInk, pen, scrawl, SKETCH, sketchCoin, sketchFace, sketchFontReady } from '../ui/sketch.js';
import { clockText } from '../game/clock.js';
import { CafeSystem } from './cafe-system.js';
import { ScoreSystem } from './score-system.js';
import { ShopSystem } from './shop-system.js';

/**
 * Its size (real metres), and where it hangs: over the café's back edge,
 * `below` under the eyes (a touch under eye level reads most comfortably),
 * never lower than `clear` above the café's tallest point (the cherry
 * tree, 0.405 m in café space) so nothing of the café hides it.
 */
export const STRIP = { width: 0.72, height: 0.103, below: 0.03, clear: 0.03, back: -0.33, top: 0.405 };
/** How long a segment takes to drain or fill, and a coin pop lasts (seconds); the pulse under 30 % (times a second); how quickly it follows the eyes' height (per second). */
const MOTION = { segment: 0.5, pop: 0.3, pulse: 1, follow: 1.2 };
const SEGMENTS = 10;
/**
 * The bar's two buttons (Pause, Shop): their side as a share of the bar's
 * height (6.8 cm: about 4.6 degrees at the bar's distance, over Meta's 2.5 to
 * 3 degrees for a ray), and the margin at each end.
 */
const BAR_BUTTON = { size: 0.66, pad: 0.14 };
/** The tag over a lit bar button: its size (metres) and how far its middle stands above the bar's top edge. */
const BAR_TAG = { width: 0.15, height: 0.05, above: 0.034 };
/** The confetti: how many scraps, how long they fly (seconds), how fast they leave (m/s), gravity (m/s²). */
const CONFETTI = { count: 60, seconds: 1.6, speed: 0.55, gravity: 1.1 };
/** The scraps' colours: the café's moss, lantern, koi and paper. */
const CONFETTI_COLOURS = ['#3d6136', '#f0c987', '#9a2208', '#f2ebdd', '#66462f'];
/**
 * Where it hangs: 'eye' (at eye level, the default), or 'low' (just above
 * the café's tallest point), for a narrow field of view where looking
 * down at the café would leave an eye-level board out of sight
 * (`?board=low` in the address).
 */
export const STRIP_HEIGHT: 'eye' | 'low' = typeof location !== 'undefined' && new URLSearchParams(location.search).get('board') === 'low' ? 'low' : 'eye';

export class StripSystem extends createSystem({}) {
  readonly panel = new Panel('ScoreStrip', STRIP.width, STRIP.height);
  /**
   * The name of the button the beam is on (Pause, Resume or Shop): a small
   * paper tag just above it, shown only while it is lit, so what the icon
   * does is never a guess. Above, not below: below it would sit over the café.
   */
  readonly tag = new Panel('BarTag', BAR_TAG.width, BAR_TAG.height);
  private tagText = '';
  /** The longest evening before this run (seconds), and whether a run is on: the game sets them. */
  best = 0;
  live = false;
  /** What the bar's buttons do now (the game sets it): 'live' in a run, 'paused' while paused (Pause shows play), 'off' otherwise (pale). */
  controls: 'live' | 'paused' | 'off' = 'off';
  /** Times a new best time was celebrated (the sound system plays the chime). */
  celebrations = 0;
  /** True once this run has passed the best time (celebrated once). */
  private celebrated = false;
  /** The confetti: a burst of paper scraps from the board, once, when the best time is passed. */
  private readonly confetti = new InstancedMesh(new PlaneGeometry(0.009, 0.005), new MeshBasicMaterial({ side: DoubleSide, toneMapped: false, transparent: true }), CONFETTI.count);
  private readonly bits = Array.from({ length: CONFETTI.count }, () => ({ p: new Vector3(), v: new Vector3(), r: new Euler(), spin: new Vector3() }));
  private confettiAge = Infinity;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly one = new Vector3(1, 1, 1);
  private cafe!: CafeSystem;
  private score!: ScoreSystem;
  private shop!: ShopSystem;
  private readonly head = new Vector3();
  private readonly spot = new Vector3();
  /** The height it hangs at (world), eased toward the eyes. */
  private height = NaN;
  /** Each segment's fill as shown (0 to 1), eased toward what the happiness says. */
  private readonly fill: number[] = Array.from({ length: SEGMENTS }, () => 1);
  private bank = 0;
  private popAge = Infinity;
  private time = 0;
  private shown = '';

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.score = this.world.getSystem(ScoreSystem)!;
    this.shop = this.world.getSystem(ShopSystem)!;
    this.cafe.cafe.add(this.panel.mesh);
    this.panel.frame = false;
    this.panel.onTop = true;
    this.panel.turn = 2.5;
    this.bank = this.score.bank;
    this.panel.set((ctx, w, h) => this.draw(ctx, w, h), this.barButtons());
    this.tag.frame = false;
    this.tag.onTop = true;
    this.panel.mesh.add(this.tag.mesh);
    const colour = new Color();
    for (let i = 0; i < CONFETTI.count; i++) this.confetti.setColorAt(i, colour.set(CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]));
    this.confetti.visible = false;
    this.confetti.frustumCulled = false;
    this.confetti.renderOrder = 41;
    this.world.createTransformEntity(this.confetti);
    void sketchFontReady.then(() => this.panel.paint());
  }

  update(frameDelta: number): void {
    const delta = Math.min(0.1, frameDelta);
    this.player.head.getWorldPosition(this.head);
    this.place(delta);
    this.flyConfetti(delta);
    const up = this.panel.update(delta, this.head);
    this.showTag(delta);
    if (!up) return;
    this.time += delta;
    const s = this.score;
    // Past the best time: celebrate once (confetti and a chime), then only the green.
    if (this.live && this.best > 0 && s.clock > this.best && !this.celebrated) {
      this.celebrated = true;
      this.celebrations++;
      this.burst();
    }
    const want = (s.happiness / HAPPINESS.max) * SEGMENTS;
    let moving = false;
    for (let i = 0; i < SEGMENTS; i++) {
      const target = Math.max(0, Math.min(1, want - i));
      const f = this.fill[i];
      if (Math.abs(target - f) > 0.001) {
        this.fill[i] = f + Math.sign(target - f) * Math.min(Math.abs(target - f), delta / MOTION.segment);
        moving = true;
      }
    }
    if (s.bank > this.bank) this.popAge = 0;
    this.bank = s.bank;
    if (this.popAge < MOTION.pop) {
      this.popAge += delta;
      moving = true;
    }
    const low = this.live && s.happiness / HAPPINESS.max <= 0.3 && s.happiness > 0;
    const shopNow = this.shop.price === null ? 'full' : this.shop.affordable ? 'can' : 'not';
    const now = `${Math.round(s.happiness)}|${s.bank}|${Math.floor(s.clock)}|${this.best}|${this.live}|${this.controls}|${shopNow}`;
    if (moving || low || now !== this.shown) {
      this.shown = now;
      this.panel.paint();
    }
  }

  /** Jump the segments to the happiness at once (a new run starts full). */
  settle(): void {
    const want = (this.score.happiness / HAPPINESS.max) * SEGMENTS;
    for (let i = 0; i < SEGMENTS; i++) this.fill[i] = Math.max(0, Math.min(1, want - i));
    this.bank = this.score.bank;
    this.popAge = Infinity;
    this.height = NaN;
    this.celebrated = false;
  }

  /** Throw the confetti from the board. */
  private burst(): void {
    this.panel.mesh.getWorldPosition(this.spot);
    for (const b of this.bits) {
      b.p.copy(this.spot);
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.8;
      const sp = CONFETTI.speed * (0.5 + Math.random() * 0.7);
      b.v.set(Math.cos(a) * sp * 0.8, up * sp, Math.sin(a) * sp * 0.5);
      b.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
    }
    this.confettiAge = 0;
    this.confetti.visible = true;
  }

  private flyConfetti(delta: number): void {
    if (this.confettiAge >= CONFETTI.seconds) return;
    this.confettiAge += delta;
    if (this.confettiAge >= CONFETTI.seconds) {
      this.confetti.visible = false;
      return;
    }
    const mat = this.confetti.material as MeshBasicMaterial;
    mat.opacity = Math.min(1, 3 * (1 - this.confettiAge / CONFETTI.seconds));
    this.bits.forEach((b, i) => {
      b.v.y -= CONFETTI.gravity * delta;
      b.v.multiplyScalar(1 - 1.2 * delta);
      b.p.addScaledVector(b.v, delta);
      b.r.x += b.spin.x * delta;
      b.r.y += b.spin.y * delta;
      b.r.z += b.spin.z * delta;
      this.confetti.setMatrixAt(i, this.m4.compose(b.p, this.q.setFromEuler(b.r), this.one));
    });
    this.confetti.instanceMatrix.needsUpdate = true;
  }

  /** Over the café's back edge, at (just under) eye height, but always clear above the café. */
  private place(delta: number): void {
    const cafe = this.cafe.cafe;
    const scale = cafe.scale.x || 1;
    // The world height the eyes want, eased so a nod or a lean does not move it.
    const eyes = this.head.y - STRIP.below;
    this.height = Number.isNaN(this.height) ? eyes : this.height + (eyes - this.height) * (1 - Math.exp(-MOTION.follow * delta));
    cafe.localToWorld(this.spot.set(0, 0, STRIP.back));
    this.spot.y = this.height;
    cafe.worldToLocal(this.spot);
    const lowest = STRIP.top + (STRIP.clear + STRIP.height / 2) / scale;
    this.panel.mesh.position.set(0, STRIP_HEIGHT === 'low' ? lowest : Math.max(lowest, this.spot.y), STRIP.back);
  }

  private draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const rc = pen(this.panel.canvas);
    const s = this.score;
    const mood = s.happiness / HAPPINESS.max;
    const lw = Math.max(2, h * 0.016);
    // The paper, with a marker border.
    rc.rectangle(lw * 2, lw * 2, w - lw * 4, h - lw * 4, line(11, lw * 1.2, { fill: SKETCH.paper, fillStyle: 'solid', roughness: 1.3 }));
    // Laid out left to right with room between every part; the time and the bank are given room for their widest so nothing shifts as they change.
    const inner = h * 0.12, around = h * 0.15;
    const icon = h * 0.36, timeSize = h * 0.36, bankSize = h * 0.34;
    // The widest time ('59:59') in the hand font, as drawn on the headset; the bank as wide as it is drawn
    // (measured, two digits at least), so a small number leaves no gap before the shop and a big one never
    // runs into it. The bar's segments give way only when the bank gains a digit.
    const timeW = h * 0.9;
    ctx.font = hand(bankSize, 700);
    const bankW = ctx.measureText(`${s.bank}`.padStart(2, '0')).width;
    // Pause at the left end: the clock starts after it and a divider.
    const btn = h * BAR_BUTTON.size;
    let x = h * BAR_BUTTON.pad + btn + around;
    rc.line(x, h * 0.17, x + 2, h * 0.83, line(20, lw * 0.8));
    x += around;
    // The clock: a drawn clock face and the time.
    const cx = x + icon / 2, cy = h * 0.5;
    rc.circle(cx, cy, icon, line(12, lw, { fill: SKETCH.paper, fillStyle: 'solid' }));
    rc.line(cx, cy, cx, cy - icon * 0.32, line(13, lw * 0.9));
    rc.line(cx, cy, cx + icon * 0.24, cy + icon * 0.06, line(14, lw * 0.9));
    x += icon + inner;
    const record = this.live && this.best > 0 && s.clock > this.best;
    if (this.best > 0) {
      scrawl(ctx, clockText(s.clock), x, h * 0.4, h * 0.32, { color: record ? SKETCH.moss : SKETCH.ink });
      scrawl(ctx, record ? 'NEW BEST!' : `BEST ${clockText(this.best)}`, x, h * 0.78, h * 0.18, { color: record ? SKETCH.moss : SKETCH.soft });
    } else scrawl(ctx, clockText(s.clock), x, h * 0.53, timeSize);
    x += timeW + around;
    rc.line(x, h * 0.17, x + 2, h * 0.83, line(21, lw * 0.8));
    x += around;
    // Happiness: the face and the segments, up to the coins' divider.
    const face = h * 0.4;
    sketchFace(rc, x + face / 2, h * 0.5, face, mood, 31, lw);
    x += face + inner;
    // Shop at the right end, mirroring Pause at the left: the button, a divider `around` before it, then the coins.
    const shopLine = w - h * BAR_BUTTON.pad - btn - around;
    rc.line(shopLine, h * 0.17, shopLine - 2, h * 0.83, line(23, lw * 0.8));
    const right = shopLine - around - bankW - inner - icon - around;
    rc.line(right, h * 0.17, right - 2, h * 0.83, line(22, lw * 0.8));
    const x0 = x;
    const span = right - around - x0;
    const gap = span * 0.03;
    const sw = (span - gap * (SEGMENTS - 1)) / SEGMENTS;
    const sy = h * 0.27;
    const sh = h * 0.46;
    const low = this.live && mood <= 0.3 && mood > 0;
    const pulse = low ? 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(this.time * MOTION.pulse * Math.PI * 2)) : 1;
    for (let i = 0; i < SEGMENTS; i++) {
      const x = x0 + i * (sw + gap);
      const f = this.fill[i];
      if (f > 0.005) {
        // Hatched in, filling from the bottom and draining from the top.
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - lw, sy + sh * (1 - f), sw + lw * 2, sh * f + lw);
        ctx.clip();
        ctx.globalAlpha = pulse;
        rc.rectangle(x, sy, sw, sh, line(50 + i, lw * 0.9, { stroke: 'transparent', fill: moodInk(mood), fillStyle: 'hachure', hachureGap: sw * 0.18, fillWeight: lw * 1.1, hachureAngle: -41 + i * 7 }));
        ctx.restore();
      }
      rc.rectangle(x, sy, sw, sh, line(60 + i, lw * 0.85, f > 0.005 ? {} : { stroke: SKETCH.empty }));
    }
    // The bank, popping for a moment when coins come in.
    const pop = this.popAge < MOTION.pop ? 1 + 0.22 * Math.sin((this.popAge / MOTION.pop) * Math.PI) : 1;
    const coinX = right + around + icon / 2;
    sketchCoin(rc, coinX, h * 0.5, icon * pop, 41, lw);
    scrawl(ctx, `${s.bank}`, coinX + icon / 2 + inner, h * 0.53, bankSize * pop);
  }

  /** The tag over the lit button: its word, where it stands (over that button), shown while the button is lit. */
  private showTag(delta: number): void {
    const id = this.panel.open && this.controls !== 'off' ? this.panel.hover : null;
    const b = id ? this.panel.buttons.find((x) => x.id === id) : undefined;
    const word = !b ? '' : b.id === 'bar-shop' ? 'Shop' : this.controls === 'paused' ? 'Resume' : 'Pause';
    if (word && word !== this.tagText) {
      this.tagText = word;
      this.tag.set((ctx, w, h) => {
        const lw = Math.max(2, h * 0.05);
        pen(this.tag.canvas).rectangle(lw * 1.5, lw * 1.5, w - lw * 3, h - lw * 3, line(130, lw, { fill: SKETCH.paper, fillStyle: 'solid', roughness: 1.1 }));
        scrawl(ctx, word, w / 2, h * 0.56, h * 0.56, { align: 'center' });
      });
    }
    if (b) this.tag.mesh.position.set(((b.x + b.w / 2) / this.panel.width - 0.5) * STRIP.width, STRIP.height / 2 + BAR_TAG.above, 0.002);
    this.tag.show(!!b);
    this.tag.update(delta, this.head);
  }

  /** The bar's two buttons: they draw themselves (Panel calls `draw` with the hover and the press). */
  private barButtons(): Button[] {
    const w = this.panel.width;
    const h = this.panel.height;
    const size = h * BAR_BUTTON.size;
    const y = (h - size) / 2;
    const pad = h * BAR_BUTTON.pad;
    return [
      { id: 'bar-pause', label: 'Pause', x: pad, y, w: size, h: size, bare: true, draw: (ctx, b, hover, pressed) => this.drawPause(ctx, b, !!hover, !!pressed) },
      { id: 'bar-shop', label: 'Shop', x: w - pad - size, y, w: size, h: size, bare: true, draw: (ctx, b, hover, pressed) => this.drawShop(ctx, b, !!hover, !!pressed) },
    ];
  }

  /** A bar button's square: paper, ink rim (pale when off), lit from inside when aimed at, a little down when pressed. */
  private square(ctx: CanvasRenderingContext2D, b: Button, hover: boolean, pressed: boolean, seed: number): { cx: number; cy: number; s: number; ink: string } {
    const rc = pen(this.panel.canvas);
    const lw = Math.max(2, this.panel.height * 0.016);
    const off = this.controls === 'off';
    const dip = pressed ? b.h * 0.04 : 0;
    // Lit: a deeper tan, as on the menu cards, so the button aimed at is plain to see.
    rc.rectangle(b.x, b.y + dip, b.w, b.h, line(seed, lw * 1.1, { fill: hover && !off ? '#c4b397' : SKETCH.paper, fillStyle: 'solid', roughness: 1.2, stroke: off ? SKETCH.empty : SKETCH.ink }));
    if (hover && !off) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x + 3, b.y + dip + 3, b.w - 6, b.h - 6);
      ctx.clip();
      const g = ctx.createRadialGradient(b.x + b.w / 2, b.y + dip + b.h / 2, 0, b.x + b.w / 2, b.y + dip + b.h / 2, b.w * 0.62);
      g.addColorStop(0, 'rgba(255,214,140,.55)');
      g.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y + dip, b.w, b.h);
      ctx.restore();
    }
    return { cx: b.x + b.w / 2, cy: b.y + dip + b.h / 2, s: b.w, ink: off ? SKETCH.empty : SKETCH.ink };
  }

  /** Pause: two bars; a play arrow while paused (it carries on). */
  private drawPause(ctx: CanvasRenderingContext2D, b: Button, hover: boolean, pressed: boolean): void {
    const rc = pen(this.panel.canvas);
    const lw = Math.max(2, this.panel.height * 0.016);
    const { cx, cy, s, ink } = this.square(ctx, b, hover, pressed, 70);
    if (this.controls === 'paused') {
      rc.polygon([[cx - s * 0.16, cy - s * 0.24], [cx + s * 0.24, cy], [cx - s * 0.16, cy + s * 0.24]], line(71, lw * 0.9, { fill: ink, fillStyle: 'solid', stroke: ink }));
      return;
    }
    for (const side of [-1, 1]) rc.rectangle(cx + side * s * 0.12 - s * 0.06, cy - s * 0.22, s * 0.12, s * 0.44, line(72 + side, lw * 0.9, { fill: ink, fillStyle: 'solid', stroke: ink }));
  }

  /**
   * Shop: a little shop front (a striped awning over a window and a door);
   * a lantern dot with + while a hire is affordable, a moss check once all
   * are hired.
   */
  private drawShop(ctx: CanvasRenderingContext2D, b: Button, hover: boolean, pressed: boolean): void {
    const rc = pen(this.panel.canvas);
    const lw = Math.max(2, this.panel.height * 0.016);
    const sq = this.square(ctx, b, hover, pressed, 80);
    const { s, ink } = sq;
    // A little left of and below the middle, clear of the badge in the top right corner.
    const cx = sq.cx - s * 0.06;
    const cy = sq.cy + s * 0.04;
    const off = this.controls === 'off';
    const stripe = off ? SKETCH.empty : SKETCH.red;
    // The front: a wall, its window (lit) and its door.
    const fw = s * 0.52;
    const fTop = cy - s * 0.06;
    const fBottom = cy + s * 0.3;
    rc.rectangle(cx - fw / 2, fTop, fw, fBottom - fTop, line(83, lw, { fill: SKETCH.paper, fillStyle: 'solid', stroke: ink }));
    rc.rectangle(cx - fw / 2 + s * 0.06, fTop + s * 0.08, s * 0.18, s * 0.13, line(84, lw * 0.8, { fill: off ? SKETCH.paper : SKETCH.lantern, fillStyle: 'solid', stroke: ink }));
    rc.rectangle(cx + s * 0.04, fTop + s * 0.07, s * 0.14, fBottom - fTop - s * 0.07, line(85, lw * 0.8, { fill: off ? SKETCH.paper : SKETCH.timber, fillStyle: 'solid', stroke: ink }));
    // The awning: four stripes, red and paper, with a scalloped edge.
    const aw = s * 0.62;
    const aTop = cy - s * 0.27;
    const aBottom = cy - s * 0.06;
    const n = 4;
    const sw = aw / n;
    for (let i = 0; i < n; i++) {
      const x = cx - aw / 2 + i * sw;
      rc.polygon([[x, aTop], [x + sw, aTop], [x + sw, aBottom], [x, aBottom]], line(86 + i, lw * 0.7, { fill: i % 2 === 0 ? stripe : SKETCH.paper, fillStyle: 'solid', stroke: ink }));
      rc.arc(x + sw / 2, aBottom, sw, sw * 0.8, 0, Math.PI, false, line(90 + i, lw * 0.7, { fill: i % 2 === 0 ? stripe : SKETCH.paper, fillStyle: 'solid', stroke: ink }));
    }
    if (off) return;
    const r = s * 0.11;
    const bx = b.x + b.w - r - s * 0.04;
    const by = b.y + r + s * 0.04 + (pressed ? b.h * 0.04 : 0);
    if (this.shop.price === null) {
      rc.circle(bx, by, r * 2, line(92, lw * 0.9, { fill: SKETCH.moss, fillStyle: 'solid', stroke: SKETCH.mossDeep }));
      rc.linearPath([[bx - r * 0.45, by], [bx - r * 0.1, by + r * 0.4], [bx + r * 0.5, by - r * 0.4]], line(93, lw * 1.1, { stroke: '#f2ebdd' }));
    } else if (this.shop.affordable) {
      rc.circle(bx, by, r * 2, line(94, lw * 0.9, { fill: SKETCH.lantern, fillStyle: 'solid', stroke: SKETCH.timber }));
      scrawl(ctx, '+', bx, by + 2, r * 1.6, { align: 'center' });
    }
  }
}
