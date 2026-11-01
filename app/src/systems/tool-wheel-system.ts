/**
 * ToolWheelSystem: the tool wheel, opened while writing with the pen.
 *
 * Opening it (only while the pen is in hand):
 * - with the pen hand: a double-tap on the pen (a quick open-and-close of
 *   the holding fingers, twice; PenSystem reports it), or
 * - with the free hand: a pinch.
 *
 * It appears just in front of the pen's nib, facing the eyes, with the
 * current tool's segment rimmed in glowing clay. Moving the nib aims: like
 * a game's weapon wheel, the direction from where the nib was when the
 * wheel opened picks a segment (the hub, in the middle, picks nothing).
 *
 * Picking what is aimed at: a single tap on the pen, or (free hand) letting
 * go of the pinch. A tool becomes the current tool; undo and redo run once.
 * The wheel stays open, so several picks can follow; it fades away when
 * the hub is picked, the nib touches the page, the pen is put down or the
 * page closes. The pen never inks while the wheel is open (ToolState).
 */

import { createSystem, Matrix4, Mesh, Vector3, type Entity, type Object3D } from '@iwsdk/core';
import { isAction, WHEEL_ITEMS, type WheelItemId } from '../ink/tool-catalog.js';
import {
  createPinchReading,
  PINCH_CLOSED_M,
  PINCH_OPEN_M,
  readPinch,
  type Hand,
  type HandFrame,
} from '../input/hand-pinch.js';
import {
  TOOL_WHEEL_INNER_RADIUS_M,
  TOOL_WHEEL_RADIUS_M,
  toolWheelPrototype,
  wheelSegmentAt,
} from '../scene-assets/tool-wheel.scene-asset.js';
import { SURFACE_HEIGHT_M, SURFACE_WIDTH_M, WRITING_SURFACE_NAME } from '../scene-assets/tablet.scene-asset.js';
import { getNoteView } from '../ui/note-view.js';
import { getPen, type PenState, type PenTap } from '../ui/pen-state.js';
import { getTools, type ToolState } from '../ui/tool-state.js';
import { ToolWheelView } from '../ui/tool-wheel-view.js';
import { easeInCubic, easeOutCubic, getTweens, type Tweens } from '../ui/tweens.js';
import { playUiSound } from '../ui/ui-sounds.js';

const TABLET_NODE = 'tablet';
/** The wheel's size in the room: the asset is 20 cm across; this makes it 13 cm. */
const WHEEL_SCALE = 0.65;
/** How far in front of the nib (toward the eyes) the wheel opens (metres). */
const TOWARD_EYES_M = 0.06;
/** The wheel's lowest edge stays at least this far above the page (metres). */
const CLEAR_OF_PAGE_M = 0.02;
/** The nib this close to the page puts the wheel away: the user is writing again (metres). */
const TOUCHING_PAGE_M = 0.004;
const FADE_IN_MS = 180;
const FADE_OUT_MS = 150;

/** How the wheel was opened, which decides how a pick is made. */
type Opener = 'pen-hand' | 'free-hand';

export class ToolWheelSystem extends createSystem({}) {
  private pen!: PenState;
  private tools!: ToolState;
  private tweens!: Tweens;
  private surface!: Mesh;
  private view!: ToolWheelView;
  private wheel!: Object3D;
  private opener: Opener | null = null;
  /** The aimed-at segment (index into WHEEL_ITEMS), or null for the hub. */
  private hovered: number | null = null;
  /** Where the nib was when the wheel opened, in the wheel's own (asset) space: aiming is relative to it. */
  private readonly aimOrigin = new Vector3();
  /** The free hand's pinch, read each frame while the pen is held. */
  private readonly freeHand = createPinchReading();
  private freeHandClosed = false;
  private readonly handFrame: HandFrame = { frame: null!, space: null!, origin: new Matrix4() };
  private readonly head = new Vector3();
  private readonly local = new Vector3();

  init(): void {
    const tablet: Entity | undefined = this.world.getSceneEntity(TABLET_NODE);
    const surface = tablet?.object3D?.getObjectByName(WRITING_SURFACE_NAME);
    if (!(surface instanceof Mesh)) {
      console.warn('[ToolWheelSystem] Tablet missing from the scene.');
      return;
    }
    this.surface = surface;
    this.pen = getPen(this.world);
    this.tools = getTools(this.world);
    this.tweens = getTweens(this.world);

    this.wheel = toolWheelPrototype.clone();
    this.wheel.scale.setScalar(WHEEL_SCALE);
    this.wheel.visible = false;
    this.world.createTransformEntity(this.wheel);
    this.view = new ToolWheelView(this.wheel);
    this.showCurrentTool();

    this.cleanupFuncs.push(
      this.pen.onTap((tap) => this.onPenTap(tap)),
      this.tools.subscribe((change) => {
        if (change !== 'wheel') this.showCurrentTool();
      }),
      getNoteView(this.world).subscribe((open) => {
        if (!open) this.close();
      }),
      () => {
        this.tweens.cancel('tool-wheel');
        this.view.dispose();
      },
    );
  }

  update(): void {
    if (!this.view) return;
    if (!this.pen.held) {
      this.freeHandClosed = false;
      if (this.opener) this.close();
      return;
    }
    this.readFreeHand();
    if (!this.opener) return;
    if (this.nibTouchesPage()) {
      this.close();
      return;
    }
    this.aim();
  }

  // ------------------------------------------------------------ gestures

  /** The pen hand: a double-tap opens the wheel; once open, a tap picks. */
  private onPenTap(tap: PenTap): void {
    if (!this.opener) {
      if (tap === 'double-tap') this.open('pen-hand');
      return;
    }
    this.pick();
  }

  /** The free hand: pinching opens the wheel; letting go picks what is aimed at. */
  private readFreeHand(): void {
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    const freeHand: Hand = this.pen.holder === 'left' ? 'right' : 'left';
    if (!frame || !space) return;
    this.handFrame.frame = frame;
    this.handFrame.space = space;
    this.handFrame.origin.copy(this.player.matrixWorld);
    readPinch(this.world.input.xr.getPrimaryInputSource(freeHand), this.handFrame, this.freeHand);
    // Hysteresis: pinched below the closed distance, let go above the open one.
    const wasClosed = this.freeHandClosed;
    if (this.freeHand.gap < PINCH_CLOSED_M) this.freeHandClosed = true;
    else if (this.freeHand.gap > PINCH_OPEN_M) this.freeHandClosed = false;
    if (this.freeHandClosed && !wasClosed && !this.opener) this.open('free-hand');
    else if (!this.freeHandClosed && wasClosed && this.opener) this.pick();
  }

  // ------------------------------------------------------------- opening

  private open(opener: Opener): void {
    this.opener = opener;
    this.tools.setWheelOpen(true);
    this.place();
    this.hovered = null;
    this.view.setHovered(null);
    this.wheel.visible = true;
    this.view.fade.set(0);
    this.tweens.play(FADE_IN_MS, (t) => this.view.fade.set(easeOutCubic(t)), { key: 'tool-wheel' });
  }

  private close(): void {
    if (!this.opener) return;
    this.opener = null;
    this.tools.setWheelOpen(false);
    this.tweens.play(FADE_OUT_MS, (t) => this.view.fade.set(1 - easeInCubic(t)), {
      key: 'tool-wheel',
      done: () => {
        this.wheel.visible = false;
        this.view.fade.set(1);
      },
    });
  }

  /** In front of the nib, toward the eyes, facing them; lifted clear of the page if needed. */
  private place(): void {
    this.player.head.getWorldPosition(this.head);
    const nib = this.pen.nib;
    const wheel = this.wheel;
    wheel.position.copy(this.head).sub(nib).normalize().multiplyScalar(TOWARD_EYES_M).add(nib);
    // Keep the whole wheel above the page (the tablet lies flat on a desk).
    this.surface.getWorldPosition(this.local);
    const lowestEdge = wheel.position.y - TOOL_WHEEL_RADIUS_M * WHEEL_SCALE;
    const floor = this.local.y + CLEAR_OF_PAGE_M;
    if (lowestEdge < floor) wheel.position.y += floor - lowestEdge;
    wheel.lookAt(this.head);
    wheel.updateMatrixWorld();
    // Aim from where the nib is now, wherever the wheel ended up.
    wheel.worldToLocal(this.aimOrigin.copy(nib));
  }

  // -------------------------------------------------------- aiming, picking

  /** The nib's offset from where it started picks a segment by direction; near the start, the hub. */
  private aim(): void {
    this.wheel.worldToLocal(this.local.copy(this.pen.nib)).sub(this.aimOrigin);
    const distance = Math.hypot(this.local.x, this.local.y);
    const hovered = distance < TOOL_WHEEL_INNER_RADIUS_M ? null : wheelSegmentAt(Math.atan2(this.local.y, this.local.x));
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.view.setHovered(hovered);
  }

  private pick(): void {
    if (this.hovered === null) {
      this.close();
      return;
    }
    const item: WheelItemId = WHEEL_ITEMS[this.hovered];
    playUiSound('press');
    if (isAction(item)) this.tools.runAction(item);
    else this.tools.selectTool(item);
  }

  /** Whether the nib is down on the page: writing again puts the wheel away. */
  private nibTouchesPage(): boolean {
    this.surface.updateWorldMatrix(true, false);
    const local = this.surface.worldToLocal(this.local.copy(this.pen.nib));
    const overPage = Math.abs(local.x) <= SURFACE_WIDTH_M / 2 && Math.abs(local.y) <= SURFACE_HEIGHT_M / 2;
    return overPage && local.z < TOUCHING_PAGE_M;
  }

  private showCurrentTool(): void {
    this.view.setCurrent(this.tools.tool, this.tools.colour());
  }
}
