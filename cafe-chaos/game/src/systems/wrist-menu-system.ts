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
 * (ui/panel.ts). It opens where the wrist is and then stays still in the
 * air, turned to the eyes (Meta: spawn a menu from the wrist, but do not
 * anchor it to a moving hand), so it does not slide away under the other
 * hand's finger. It stays while the left hand is near it or the palm is
 * still roughly toward the eyes, and goes once the hand has been lowered
 * or taken away for most of a second. It
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

/**
 * Off for now (the gesture was not steady enough on the headset): pause,
 * hire and How to play are on the pause card, from the round button by
 * the café. `?wrist` in the address turns the wrist menu back on.
 */
export const WRIST_MENU_ON = typeof location !== 'undefined' && new URLSearchParams(location.search).has('wrist');

/** The menu's size (real metres), and where it sits from the wrist: up the hand and out to the side, toward the body's middle. */
export const WRIST = { width: 0.12, height: 0.15, up: 0.05, side: 0.105 };
/** How squarely the palm must face the eyes (the cosine of the angle), and for how long (seconds), to open. */
export const OPEN = { facing: 0.55, hold: 0.3 };
/**
 * Once open it stays while the palm still faces the eyes this much, or the
 * wrist is within `near` metres of the menu; it goes after `grace` seconds
 * of neither (a hand lowered or taken away, or lost to tracking).
 */
export const STAY = { facing: 0.15, near: 0.25, grace: 0.8 };
/** How quickly the palm's measured direction is smoothed (per second): tracking noise must not flicker the menu. */
const SMOOTH = 12;

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
    const allowed = WRIST_MENU_ON && (this.game.phase === 'run' || this.game.phase === 'paused');
    const tracked = allowed && this.readPalm(delta);
    const steady = tracked && this.facing >= OPEN.facing;
    this.facingFor = steady ? this.facingFor + delta : 0;
    // Open, it stays while the hand is still with it: the palm roughly toward the eyes, or the wrist by the menu.
    const staying = tracked && (this.facing >= STAY.facing || this.wrist.distanceTo(this.panel.mesh.position) <= STAY.near);
    this.awayFor = (this.open ? staying : steady) ? 0 : this.awayFor + delta;
    if (!this.open && steady && this.facingFor >= OPEN.hold) {
      this.open = true;
      this.placed = false;
      this.game.wristOpens++;
    }
    if (this.open && (!allowed || this.awayFor >= STAY.grace)) this.open = false;
    // Put where the wrist is when it opens, then left still.
    if (this.open && !this.placed && tracked) this.place();
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

  /** The left palm this frame: true when the hand is free and tracked (its facing, smoothed, in `facing`). */
  private readPalm(delta: number): boolean {
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
    this.scratch.copy(this.index).sub(this.wrist).cross(this.side.copy(this.pinky).sub(this.wrist)).normalize();
    // Smoothed: a jittery joint must not flicker the menu open and shut.
    if (this.normal.lengthSq() < 0.5) this.normal.copy(this.scratch);
    else this.normal.lerp(this.scratch, 1 - Math.exp(-SMOOTH * delta)).normalize();
    this.facing = this.normal.dot(this.scratch.copy(this.head).sub(this.wrist).normalize());
    return true;
  }

  /** Beside the wrist: up the hand a little, out toward the body's middle, turned to the eyes (once, as it opens). */
  private place(): void {
    this.up.copy(this.middle).sub(this.wrist).normalize();
    this.side.copy(this.up).cross(this.normal).normalize();
    this.target.copy(this.wrist).addScaledVector(this.up, WRIST.up).addScaledVector(this.side, WRIST.side);
    this.panel.mesh.position.copy(this.target);
    this.placed = true;
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
