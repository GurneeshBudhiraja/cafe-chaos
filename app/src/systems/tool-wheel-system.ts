/**
 * ToolWheelSystem: the tool wheel, opened while writing with the pen.
 *
 * Opening it (only while the pen is in hand):
 * - with the pen hand: a double-tap on the pen (a quick open-and-close of
 *   the holding fingers, twice; PenSystem reports it), or
 * - with the free hand: a pinch.
 *
 * It appears beside the pen's nib, on the side away from the holding hand
 * (so the hand and pen never hide it), facing the eyes, with the current
 * tool's segment rimmed in glowing clay. Sliding the pen over the page
 * aims, like a game's weapon wheel: away from you for the wheel's top,
 * toward you for its bottom, left and right for its sides (the page's own
 * directions, so aiming never needs to come down onto the page). The
 * direction the nib has moved since the wheel opened picks a segment;
 * staying put picks the hub (nothing). A dot on the wheel shows the aim.
 *
 * Sliding further, past the segments, aims at the options ring outside
 * them: the current tool's colours (above) and sizes (below).
 *
 * Picking what is aimed at: a single tap on the pen, or (free hand) letting
 * go of the pinch. A tool becomes the current tool (the ring then shows its
 * colours and sizes); a colour or size applies to the current tool; undo
 * and redo run once.
 * The wheel stays open, so several picks can follow; it fades away when
 * the hub is picked, the nib touches the page (writing again), the pen is
 * put down or the page closes.
 * The pen never inks while the wheel is open (ToolState).
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
  toolWheelPrototype,
  wheelSegmentAt,
} from '../scene-assets/tool-wheel.scene-asset.js';
import { SURFACE_HEIGHT_M, SURFACE_WIDTH_M, WRITING_SURFACE_NAME } from '../scene-assets/tablet.scene-asset.js';
import { getNoteView } from '../ui/note-view.js';
import { getPen, type PenState, type PenTap } from '../ui/pen-state.js';
import { getTools, type ToolState } from '../ui/tool-state.js';
import { OPTIONS_AIM_FROM_M, OPTIONS_RING_RADIUS_M, sameOption, type ToolOption } from '../ui/tool-options-ring.js';
import { ToolWheelView } from '../ui/tool-wheel-view.js';
import { easeInCubic, easeOutCubic, getTweens, type Tweens } from '../ui/tweens.js';
import { playUiSound } from '../ui/ui-sounds.js';

const TABLET_NODE = 'tablet';
/** The wheel's size in the room: the asset is 20 cm across; this makes it 17 cm (labels readable at arm's length). */
const WHEEL_SCALE = 0.85;
/** How far in front of the nib (toward the eyes) the wheel opens (metres). */
const TOWARD_EYES_M = 0.08;
/** How far to the side of the nib, away from the holding hand, the wheel's centre opens (metres). */
const BESIDE_NIB_M = 0.11;
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
  /** The aimed-at segment (index into WHEEL_ITEMS), or null. */
  private hovered: number | null = null;
  /** The aimed-at colour or size on the options ring, or null. */
  private hoveredOption: ToolOption | null = null;
  /** Where the nib was when the wheel opened, in the page's space: aiming is relative to it. */
  private readonly aimOrigin = new Vector3();
  /** The free hand's pinch, read each frame while the pen is held. */
  private readonly freeHand = createPinchReading();
  private freeHandClosed = false;
  private readonly handFrame: HandFrame = { frame: null!, space: null!, origin: new Matrix4() };
  private readonly head = new Vector3();
  private readonly headRight = new Vector3();
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
    this.setHover(null, null);
    this.view.setAim(0, 0);
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

  /** Beside the nib, toward the eyes, facing them; lifted clear of the page if needed. */
  private place(): void {
    this.player.head.getWorldPosition(this.head);
    this.headRight.set(1, 0, 0).applyQuaternion(this.player.head.getWorldQuaternion(this.wheel.quaternion));
    const nib = this.pen.nib;
    const wheel = this.wheel;
    const awayFromHand = this.pen.holder === 'left' ? 1 : -1;
    wheel.position
      .copy(this.head)
      .sub(nib)
      .normalize()
      .multiplyScalar(TOWARD_EYES_M)
      .add(nib)
      .addScaledVector(this.headRight, awayFromHand * BESIDE_NIB_M);
    // Keep the whole wheel above the page (the tablet lies flat on a desk).
    this.surface.getWorldPosition(this.local);
    const lowestEdge = wheel.position.y - OPTIONS_RING_RADIUS_M * WHEEL_SCALE;
    const floor = this.local.y + CLEAR_OF_PAGE_M;
    if (lowestEdge < floor) wheel.position.y += floor - lowestEdge;
    wheel.lookAt(this.head);
    // Aim from where the nib is now.
    this.surface.updateWorldMatrix(true, false);
    this.surface.worldToLocal(this.aimOrigin.copy(nib));
  }

  // -------------------------------------------------------- aiming, picking

  /**
   * The nib's slide over the page since the wheel opened aims by its
   * direction: a short slide, the hub (nothing); further, a segment;
   * further still, past the segments, the options ring.
   */
  private aim(): void {
    // The page's x is to the right, its y away from the viewer (toward its top edge).
    this.surface.worldToLocal(this.local.copy(this.pen.nib)).sub(this.aimOrigin);
    // In the wheel's own (asset) units, so the zones match what is drawn.
    const x = this.local.x / WHEEL_SCALE;
    const y = this.local.y / WHEEL_SCALE;
    this.view.setAim(x, y);
    const distance = Math.hypot(x, y);
    const angle = Math.atan2(y, x);
    if (distance < TOOL_WHEEL_INNER_RADIUS_M) this.setHover(null, null);
    else if (distance < OPTIONS_AIM_FROM_M) this.setHover(wheelSegmentAt(angle), null);
    else this.setHover(null, this.view.optionAt(angle));
  }

  private setHover(segment: number | null, option: ToolOption | null): void {
    if (segment !== this.hovered) {
      this.hovered = segment;
      this.view.setHovered(segment);
    }
    if (!sameOption(option, this.hoveredOption)) {
      this.hoveredOption = option;
      this.view.setHoveredOption(option);
    }
  }

  private pick(): void {
    const option = this.hoveredOption;
    if (option) {
      playUiSound('press');
      if (option.kind === 'swatch') this.tools.selectSwatch(option.index);
      else this.tools.selectSize(option.size);
      return;
    }
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
    this.view.showOptions(this.tools.tool, this.tools.style());
    // Rebuilt options are new objects: aim at them afresh.
    this.hoveredOption = null;
  }
}
