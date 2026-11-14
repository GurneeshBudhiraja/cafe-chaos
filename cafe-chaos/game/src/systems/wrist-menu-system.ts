/**
 * WristMenuSystem: the menu that comes to hand. Turn the left palm toward
 * the face and hold it there a moment: a small sketch-pen menu appears
 * beside the wrist (never on the palm, so the other hand presses it
 * without covering the first, which hand tracking handles badly):
 *
 *   menu            (coin) 46
 *   [ pause ]   (or resume)
 *   [ hire a server · 120 ]   (or the savings toward the next one)
 *   [ how to play ]
 *
 * Pressed with the right index fingertip, like every other button
 * (ui/panel.ts). Lower the hand, or turn it away, and the menu goes. It
 * is there during a run and while paused; never on the title, the first
 * run's teaching or the closing card.
 *
 * It opens only for a steady palm (`OPEN.hold` seconds facing the eyes),
 * never for a hand that is pinching, carrying a guest or holding the
 * café, so a hand passing by does not open it. A small pause tab at the
 * table's edge (GameSystem) is there as well, for anyone who never tries
 * the gesture or whose tracking misses it.
 *
 * Why the wrist: it is always in reach, needs no aiming, covers nothing,
 * and works with any field of view, since the player brings it into
 * view (docs/PLAN.md).
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { readJoint } from '../lib/hand-pinch.js';
import { Panel } from '../ui/panel.js';
import { sketchButton } from '../ui/sketch-button.js';
import { line, pen, scrawl, SKETCH, sketchCoin, sketchFontReady } from '../ui/sketch.js';
import { GameSystem } from './game-system.js';
import { GuestSystem } from './guest-system.js';
import { HoldSystem } from './hold-system.js';
import { ScoreSystem } from './score-system.js';
import { ShopSystem } from './shop-system.js';

/** The menu's size (real metres), and where it sits from the wrist: up the hand and out to the side, toward the body's middle. */
export const WRIST = { width: 0.12, height: 0.15, up: 0.05, side: 0.105 };
/** How squarely the palm must face the eyes (the cosine of the angle), and for how long (seconds) to open; how long it may look away before the menu goes. */
export const OPEN = { facing: 0.55, hold: 0.3, grace: 0.35 };
/** How tightly the menu follows the wrist (per second): steady, but never trailing. */
const FOLLOW = 14;

export class WristMenuSystem extends createSystem({}) {
  readonly panel = new Panel('WristMenu', WRIST.width, WRIST.height);
  /** True while the menu is up. */
  open = false;
  /** The palm's facing this frame (for the checks): the cosine between its normal and the way to the eyes. */
  facing = -1;
  private game!: GameSystem;
  private score!: ScoreSystem;
  private shop!: ShopSystem;
  private guests!: GuestSystem;
  private hold: HoldSystem | null = null;
  private facingFor = 0;
  private awayFor = 0;
  private readonly wrist = new Vector3();
  private readonly index = new Vector3();
  private readonly pinky = new Vector3();
  private readonly middle = new Vector3();
  private readonly normal = new Vector3();
  private readonly up = new Vector3();
  private readonly side = new Vector3();
  private readonly head = new Vector3();
  private readonly target = new Vector3();
  private readonly scratch = new Vector3();
  private placed = false;
  private shown = '';

  init(): void {
    this.game = this.world.getSystem(GameSystem)!;
    this.score = this.world.getSystem(ScoreSystem)!;
    this.shop = this.world.getSystem(ShopSystem)!;
    this.guests = this.world.getSystem(GuestSystem)!;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    this.panel.frame = false;
    this.panel.onTop = true;
    this.world.createTransformEntity(this.panel.mesh);
    this.hold?.claims.push((point) => this.open && this.panel.covers(point));
    this.layout();
    void sketchFontReady.then(() => this.layout());
  }

  update(frameDelta: number): void {
    const delta = Math.min(0.1, frameDelta);
    this.player.head.getWorldPosition(this.head);
    const allowed = this.game.phase === 'run' || this.game.phase === 'paused';
    const steady = allowed && this.readPalm();
    if (steady) {
      this.facingFor += delta;
      this.awayFor = 0;
    } else {
      this.awayFor += delta;
      this.facingFor = 0;
    }
    if (!this.open && steady && this.facingFor >= OPEN.hold) {
      this.open = true;
      this.placed = false;
      this.game.wristOpens++;
    }
    if (this.open && (!allowed || this.awayFor >= OPEN.grace)) this.open = false;
    if (this.open && steady) this.follow(delta);
    this.panel.show(this.open);
    if (!this.panel.update(delta, this.head)) return;
    // Its buttons: the right fingertip (the left hand holds the menu).
    const tip = this.hold?.tip.right;
    const touch = this.panel.touch('right', this.open && tip?.tracked && !this.guests.carriedBy('right') ? tip.point : null);
    this.panel.setHover(touch.over?.id ?? null);
    if (touch.pressed) {
      this.panel.press(touch.pressed.id);
      this.press(touch.pressed.id);
    }
    const now = `${this.game.phase}|${this.game.resuming > 0}|${this.score.bank}|${this.shop.price}`;
    if (now !== this.shown) {
      this.shown = now;
      this.layout();
    }
  }

  /** The left palm this frame: true when it faces the eyes squarely and the hand is free. */
  private readPalm(): boolean {
    const hold = this.hold;
    const pinch = hold?.pinch.left;
    if (!pinch || pinch.gap === Infinity || pinch.closed || pinch.ghost || hold.holding.includes('left') || this.guests.carriedBy('left')) {
      this.facing = -1;
      return false;
    }
    const source = this.world.input.xr.getPrimaryInputSource('left');
    const space = this.xrManager.getReferenceSpace();
    const origin = this.player.matrixWorld;
    const frame = this.xrFrame;
    if (
      !readJoint(source, frame, space, origin, 'wrist', this.wrist) ||
      !readJoint(source, frame, space, origin, 'index-finger-metacarpal', this.index) ||
      !readJoint(source, frame, space, origin, 'pinky-finger-metacarpal', this.pinky) ||
      !readJoint(source, frame, space, origin, 'middle-finger-metacarpal', this.middle)
    ) {
      this.facing = -1;
      return false;
    }
    // Out of the palm, for a left hand: (index - wrist) x (pinky - wrist).
    this.normal.copy(this.index).sub(this.wrist).cross(this.scratch.copy(this.pinky).sub(this.wrist)).normalize();
    this.facing = this.normal.dot(this.scratch.copy(this.head).sub(this.wrist).normalize());
    return this.facing >= OPEN.facing;
  }

  /** Beside the wrist: up the hand a little, out toward the body's middle, turned to the eyes. */
  private follow(delta: number): void {
    this.up.copy(this.middle).sub(this.wrist).normalize();
    this.side.copy(this.up).cross(this.normal).normalize();
    this.target.copy(this.wrist).addScaledVector(this.up, WRIST.up).addScaledVector(this.side, WRIST.side);
    const mesh = this.panel.mesh;
    if (!this.placed) {
      mesh.position.copy(this.target);
      this.placed = true;
    } else mesh.position.lerp(this.target, 1 - Math.exp(-FOLLOW * delta));
  }

  private press(id: string): void {
    if (id === 'w-pause') // Mid-count back from a pause, it pauses again.
    this.game.click(this.game.phase === 'paused' && this.game.resuming <= 0 ? 'resume' : 'pause');
    if (id === 'w-hire') this.game.click('hire');
    if (id === 'w-how') this.game.click('how');
  }

  private layout(): void {
    const { width: w, height: h, canvas } = this.panel;
    const paused = this.game?.phase === 'paused' && this.game.resuming <= 0;
    const price = this.shop?.price ?? null;
    const bank = this.score?.bank ?? 0;
    const canPay = price !== null && bank >= price;
    const bx = w * 0.07;
    const bw = w * 0.86;
    const bh = h * 0.2;
    const buttons = [
      sketchButton(canvas, 'w-pause', paused ? 'resume' : 'pause', bx, h * 0.22, bw, bh, 811, paused ? 'go' : 'plain'),
      price === null
        ? sketchButton(canvas, 'w-hire', 'full staff', bx, h * 0.47, bw, bh, 812)
        : canPay
          ? sketchButton(canvas, 'w-hire', `hire · ${price}`, bx, h * 0.47, bw, bh, 812, 'go')
          : sketchButton(canvas, 'w-hire', '', bx, h * 0.47, bw, bh, 812, 'plain', (ctx, b) => {
              const rc = pen(canvas);
              scrawl(ctx, 'next server', b.x + b.w * 0.07, b.y + b.h * 0.32, b.h * 0.24, { color: SKETCH.soft });
              scrawl(ctx, `${bank}/${price}`, b.x + b.w * 0.93, b.y + b.h * 0.32, b.h * 0.24, { align: 'right' });
              rc.rectangle(b.x + b.w * 0.07, b.y + b.h * 0.58, b.w * 0.86, b.h * 0.2, line(813, 2));
              ctx.fillStyle = SKETCH.gold;
              ctx.fillRect(b.x + b.w * 0.07 + 3, b.y + b.h * 0.58 + 3, Math.max(0, (b.w * 0.86 - 6) * Math.min(1, bank / price)), b.h * 0.2 - 6);
            }),
      sketchButton(canvas, 'w-how', 'how to play', bx, h * 0.72, bw, bh, 814),
    ];
    this.panel.set((ctx) => {
      const rc = pen(canvas);
      const lw = Math.max(2, h * 0.012);
      rc.rectangle(lw * 2, lw * 2, w - lw * 4, h - lw * 4, line(801, lw * 1.3, { fill: SKETCH.paper, fillStyle: 'solid', roughness: 1.3 }));
      scrawl(ctx, 'menu', w * 0.08, h * 0.1, h * 0.085);
      sketchCoin(rc, w * 0.62, h * 0.1, h * 0.07, 802, lw);
      scrawl(ctx, `${bank}`, w * 0.68, h * 0.105, h * 0.08);
    }, buttons);
  }
}
