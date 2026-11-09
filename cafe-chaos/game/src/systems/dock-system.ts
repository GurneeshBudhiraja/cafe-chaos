/**
 * DockSystem: the signboard of buttons beside the café. It stands just in
 * front of the café's front-right corner, at a constant size whatever the
 * café's size, leaning back to face the player, and follows the café
 * wherever it goes (holding still while a finger is at it, so pressing a
 * button never moves the buttons). A fingertip poking a tile presses it (the tile lights up as the
 * finger nears, sinks and flashes on the press): Turn turns the café a
 * step, Smaller and Bigger resize it a step (growing from its base), and
 * Reset puts it back on the table at its first size. Pinching the Move
 * handle and dragging carries the café, exactly as pinching the café
 * itself does (HoldSystem does the carrying).
 */

import { createSystem, Euler, Vector3 } from '@iwsdk/core';
import { buildDock, type Tile } from '../dock/board.js';
import { AHEAD_M, BOARD_H, BOARD_W, EASE, FOLLOW, HANDLE_REACH_M, HOVER_DEPTH_M, LEAN, POKE_MARGIN_M, PRESS_DEPTH_M, RAISE_M, REARM_DEPTH_M, SINK_M, SINK_SECONDS, SIZE_STEP, STILL_DEPTH_M, STILL_MARGIN_M, TILE_GLOW, TILE_M, TURN_STEP, type DockAction } from '../dock/dock.js';
import { SCALE_MAX, SCALE_MIN } from '../hold/hold.js';
import { HANDS, readJoint, type Hand } from '../lib/hand-pinch.js';
import { CafeSystem } from './cafe-system.js';
import { HoldSystem } from './hold-system.js';

export class DockSystem extends createSystem({}) {
  readonly dock = buildDock();
  /** Each hand's index fingertip this frame (world), and whether it was tracked. */
  readonly tips: Record<Hand, { point: Vector3; tracked: boolean }> = {
    left: { point: new Vector3(), tracked: false },
    right: { point: new Vector3(), tracked: false },
  };
  /** Presses so far, by action (the dev harness reads this); `move` counts handle grabs the café's own pinch did not already take. */
  readonly presses: Record<DockAction, number> = { move: 0, turn: 0, smaller: 0, bigger: 0, reset: 0 };
  /** Where the café is heading after a press (scale and turn). */
  scaleTarget = 1;
  yawTarget = 0;
  private cafe: CafeSystem | null = null;
  private hold: HoldSystem | null = null;
  /** Per hand: the tile whose face the finger is at or through, until it draws back. */
  private readonly pressing: Record<Hand, Tile | null> = { left: null, right: null };
  private readonly sinking = new Map<Tile, number>();
  private readonly target = new Vector3();
  private readonly head = new Vector3();
  private readonly local = new Vector3();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly previousPinch: Record<Hand, boolean> = { left: false, right: false };
  private synced = false;

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem) ?? null;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    this.dock.group.visible = false;
    this.world.createTransformEntity(this.dock.group);
  }

  update(delta: number): void {
    const cafe = this.cafe;
    const hold = this.hold;
    const shown = !!cafe && !!hold && cafe.placed && this.world.renderer.xr.isPresenting;
    this.dock.group.visible = shown;
    if (!shown) {
      this.synced = false;
      return;
    }
    for (const hand of HANDS) this.readTip(hand);
    this.follow(delta);
    this.poke();
    this.handle();
    this.ease(delta);
    this.light(delta);
  }

  // ------------------------------------------------------------ placing

  /** Stand in front of the café's front-right corner, leaning back toward the head. */
  private follow(delta: number): void {
    const cafe = this.cafe!.cafe;
    const bounds = this.hold!.bounds;
    const s = cafe.scale.x;
    const group = this.dock.group;
    // The board's centre in café space (the café's own metres, so the dock's size is divided by the scale):
    // its right end at the base's right edge, out past the front edge, standing on the base's level.
    this.local.set(bounds.max.x - BOARD_W / 2 / s, (RAISE_M + (BOARD_H / 2) * Math.cos(LEAN)) / s, bounds.max.z + (AHEAD_M + (BOARD_H / 2) * Math.sin(LEAN)) / s);
    cafe.localToWorld(this.target.copy(this.local));
    // Still while a finger is at the board (unless the café is being carried: then the board goes with it).
    const still = this.hold!.holding.length === 0 && HANDS.some((hand) => this.tips[hand].tracked && this.atBoard(this.tips[hand].point));
    if (!still) group.position.lerp(this.target, Math.min(1, FOLLOW * delta));
    this.player.head.getWorldPosition(this.head);
    const yaw = Math.atan2(this.head.x - group.position.x, this.head.z - group.position.z);
    this.euler.set(-LEAN, yaw, 0, 'YXZ');
    group.quaternion.setFromEuler(this.euler);
    group.scale.setScalar(1);
  }

  /** Is this world point just in front of the board (or at it)? */
  private atBoard(point: Vector3): boolean {
    this.dock.group.worldToLocal(this.local.copy(point));
    return Math.abs(this.local.x) <= BOARD_W / 2 + STILL_MARGIN_M && Math.abs(this.local.y) <= BOARD_H / 2 + STILL_MARGIN_M && this.local.z > -REARM_DEPTH_M && this.local.z < STILL_DEPTH_M;
  }

  // -------------------------------------------------------------- pokes

  private readTip(hand: Hand): void {
    const tip = this.tips[hand];
    const source = this.world.input.xr.getPrimaryInputSource(hand);
    tip.tracked = readJoint(source, this.xrFrame, this.xrManager.getReferenceSpace(), this.player.matrixWorld, 'index-finger-tip', tip.point);
  }

  /** A fingertip at or through a tile's face presses it once; it must draw back before pressing again. */
  private poke(): void {
    for (const hand of HANDS) {
      const tip = this.tips[hand];
      const was = this.pressing[hand];
      if (!tip.tracked) {
        this.pressing[hand] = null;
        continue;
      }
      if (was) {
        this.toTile(was, tip.point);
        if (this.local.z > REARM_DEPTH_M || !this.within(this.local, POKE_MARGIN_M * 3)) this.pressing[hand] = null;
        continue;
      }
      for (const tile of this.dock.tiles) {
        this.toTile(tile, tip.point);
        if (this.local.z <= PRESS_DEPTH_M && this.local.z > -REARM_DEPTH_M && this.within(this.local, POKE_MARGIN_M)) {
          this.pressing[hand] = tile;
          this.press(tile);
          break;
        }
      }
    }
  }

  /** The point in the tile's space (x, y across its face; z out of it). */
  private toTile(tile: Tile, point: Vector3): void {
    tile.mesh.worldToLocal(this.local.copy(point));
  }

  private within(p: Vector3, margin: number): boolean {
    const half = TILE_M / 2 + margin;
    return Math.abs(p.x) <= half && Math.abs(p.y) <= half;
  }

  private press(tile: Tile): void {
    this.sinking.set(tile, SINK_SECONDS);
    // The Move handle is for pinching (see handle()); a poke only makes it bob.
    if (tile.action === 'move') return;
    this.presses[tile.action]++;
    const cafe = this.cafe!;
    this.sync();
    switch (tile.action) {
      case 'turn':
        this.yawTarget += TURN_STEP;
        break;
      case 'smaller':
        this.scaleTarget = Math.max(SCALE_MIN, this.scaleTarget / SIZE_STEP);
        break;
      case 'bigger':
        this.scaleTarget = Math.min(SCALE_MAX, this.scaleTarget * SIZE_STEP);
        break;
      case 'reset':
        cafe.resetPose();
        this.synced = false;
        break;
    }
  }

  // ------------------------------------------------------------- handle

  /** A pinch closing at the Move handle takes the café, as a pinch on the café does. */
  private handle(): void {
    const hold = this.hold!;
    const tile = this.dock.tiles[0];
    for (const hand of HANDS) {
      const pinch = hold.pinch[hand];
      const fresh = pinch.closed && !this.previousPinch[hand];
      this.previousPinch[hand] = pinch.closed;
      if (!fresh || hold.holding.includes(hand)) continue;
      this.toTile(tile, pinch.point);
      if (this.local.length() <= HANDLE_REACH_M) {
        hold.holdWith(hand);
        this.presses.move++;
        this.sinking.set(tile, SINK_SECONDS);
      }
    }
  }

  // -------------------------------------------------------------- easing

  /** Take the café's current size and turn as the targets (so a press steps from where it is). */
  private sync(): void {
    const cafe = this.cafe!.cafe;
    if (this.synced) return;
    this.scaleTarget = cafe.scale.x;
    this.yawTarget = cafe.rotation.y;
    this.synced = true;
  }

  /** Play out a press's change; while a hand holds the café, or it is arriving, its pose is theirs. */
  private ease(delta: number): void {
    const cafe = this.cafe!;
    if (this.hold!.holding.length > 0 || cafe.arriving) {
      this.synced = false;
      return;
    }
    this.sync();
    const k = Math.min(1, EASE * delta);
    const c = cafe.cafe;
    const ds = this.scaleTarget - c.scale.x;
    if (Math.abs(ds) > 1e-5) c.scale.setScalar(Math.abs(ds) < 1e-4 ? this.scaleTarget : c.scale.x + ds * k);
    const dy = this.yawTarget - c.rotation.y;
    if (Math.abs(dy) > 1e-5) c.rotation.y = Math.abs(dy) < 1e-4 ? this.yawTarget : c.rotation.y + dy * k;
  }

  // -------------------------------------------------------------- lights

  /** Tiles glow under a nearing finger, sink and flash when pressed. */
  private light(delta: number): void {
    for (const tile of this.dock.tiles) {
      let hover = false;
      for (const hand of HANDS) {
        const tip = this.tips[hand];
        if (!tip.tracked) continue;
        this.toTile(tile, tip.point);
        if (this.local.z > -REARM_DEPTH_M && this.local.z < HOVER_DEPTH_M && this.within(this.local, POKE_MARGIN_M * 2)) hover = true;
      }
      const sink = this.sinking.get(tile) ?? 0;
      if (sink > 0) this.sinking.set(tile, sink - delta);
      const pressed = sink > 0;
      const m = tile.mesh.material;
      const target = pressed ? TILE_GLOW.pressed : hover ? TILE_GLOW.hover : TILE_GLOW.rest;
      m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, 16 * delta);
      tile.mesh.position.z = tile.restZ - (pressed ? SINK_M * Math.min(1, sink / (SINK_SECONDS * 0.5)) : 0);
    }
  }
}
