/**
 * StickySystem: sticky notes around the room.
 *
 * - The pad: five small stacks of sticky notes on the desk, along the
 *   tablet's left edge (they come and go with the note page, like the pen).
 *   Pinch a stack (with a hand not holding the pen) or tap it with a ray:
 *   a new sticky note of that kind peels off and floats up in front of you,
 *   to the left of the page, ready to write on.
 * - Writing: each sticky note is a writing surface with its own page
 *   (StickyBoard), so the pen, the tool wheel, the eraser, the lasso and
 *   undo work on it as on the tablet.
 * - Sticky notes belong to the room, not to a note: they stay where they
 *   are, whether or not a note is open.
 *
 * The board (sticky-board.ts) keeps and saves them; this system shows them.
 */

import {
  createSystem,
  Matrix4,
  Quaternion,
  Vector3,
  type Entity,
  type Group,
  type Object3D,
} from '@iwsdk/core';
import { getInkSurfaces, type InkSurfaces } from '../ink/ink-surfaces.js';
import {
  createPinchReading,
  HANDS,
  PINCH_CLOSED_M,
  readPinch,
  type Hand,
  type HandFrame,
} from '../input/hand-pinch.js';
import { WritingSurface } from '../note-components.js';
import { stickyPadPrototype } from '../scene-assets/sticky-pad.scene-asset.js';
import { TABLET_BACK_M, TABLET_HALF_WIDTH_M } from '../scene-assets/tablet.scene-asset.js';
import { getStickyBoard, type StickyBoard } from '../stickies/sticky-board.js';
import { STICKY_KINDS, type StickyKind, type StickyNote } from '../stickies/sticky-model.js';
import { createStickyObject, disposeStickyObject } from '../stickies/sticky-object.js';
import { faceViewer } from '../ui/drag.js';
import { getPen, type PenState } from '../ui/pen-state.js';
import { easeOutCubic, getTweens, type Tweens } from '../ui/tweens.js';
import { playUiSound } from '../ui/ui-sounds.js';
import { devLog } from '../util/dev-log.js';

const TABLET_NODE = 'tablet';
/** The pad's centre, off the tablet's left edge, on the desk (tablet-local metres). */
const PAD_GAP_M = 0.045;
/** A pinch this close to a stack's top (metres) peels a note off it. */
const PICK_RADIUS_M = 0.04;
/** Where a new sticky note floats: from the page toward the eyes, up, and to the left (metres). */
const TOWARD_EYES = 0.3;
const UP_M = 0.06;
const LEFT_M = 0.16;
/** How long a new note takes to peel off and float up (ms). */
const PEEL_MS = 380;

interface StickyView {
  sticky: StickyNote;
  entity: Entity;
  object: Group;
}

export class StickySystem extends createSystem({}) {
  private board!: StickyBoard;
  private surfaces!: InkSurfaces;
  private pen!: PenState;
  private tweens!: Tweens;
  private tablet!: Object3D;
  private pad!: Object3D;
  private readonly views = new Map<string, StickyView>();
  private readonly readings = { left: createPinchReading(), right: createPinchReading() };
  private readonly wasClosed: Record<Hand, boolean> = { left: false, right: false };
  private readonly handFrame: HandFrame = { frame: null!, space: null!, origin: new Matrix4() };
  private readonly head = new Vector3();
  private readonly point = new Vector3();
  private readonly target = new Vector3();
  private readonly fromPosition = new Vector3();
  private readonly fromQuaternion = new Quaternion();
  private readonly toQuaternion = new Quaternion();

  init(): void {
    const tabletEntity = this.world.getSceneEntity(TABLET_NODE);
    if (!tabletEntity?.object3D) {
      console.warn('[StickySystem] Tablet missing from the scene.');
      return;
    }
    this.board = getStickyBoard(this.world);
    this.surfaces = getInkSurfaces(this.world);
    this.pen = getPen(this.world);
    this.tweens = getTweens(this.world);
    this.tablet = tabletEntity.object3D;

    // The pad is part of the tablet (a child entity, like the pen): it lies
    // on the desk off its left edge and comes and goes with the note page.
    this.pad = stickyPadPrototype.clone();
    this.pad.position.set(-(TABLET_HALF_WIDTH_M + PAD_GAP_M), 0, -TABLET_BACK_M);
    this.world.createTransformEntity(this.pad, { parent: tabletEntity });
    for (const kind of STICKY_KINDS) {
      const stack = this.pad.getObjectByName(`StickyPad-${kind}`);
      // A ray tap on a stack (pointer events bubble up from its meshes).
      const target = stack as unknown as { addEventListener(type: string, listener: () => void): void };
      target?.addEventListener('click', () => this.peelOff(kind));
    }

    this.cleanupFuncs.push(
      this.board.subscribe((event) => {
        if (event.kind === 'added') this.show(event.sticky);
        else this.hide(event.sticky.id);
      }),
      () => {
        for (const id of [...this.views.keys()]) this.hide(id);
      },
    );
    for (const sticky of this.board.all()) this.show(sticky);
    void this.board.load();
  }

  update(): void {
    if (!this.pad || !this.tablet.visible) return;
    this.pinchPad();
  }

  // ------------------------------------------------------------ the pad

  /** A pinch closing on a stack (with a hand not holding the pen) peels a note off it. */
  private pinchPad(): void {
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    if (!frame || !space) return;
    this.handFrame.frame = frame;
    this.handFrame.space = space;
    this.handFrame.origin.copy(this.player.matrixWorld);
    for (const hand of HANDS) {
      const reading = this.readings[hand];
      readPinch(this.world.input.xr.getPrimaryInputSource(hand), this.handFrame, reading);
      const closed = reading.gap < PINCH_CLOSED_M;
      const justPinched = closed && !this.wasClosed[hand];
      this.wasClosed[hand] = closed;
      if (!justPinched || this.pen.holder === hand) continue;
      const kind = this.stackNear(reading.point);
      if (kind) this.peelOff(kind);
    }
  }

  /** The stack whose top is within reach of a world point, if any. */
  private stackNear(point: Vector3): StickyKind | null {
    for (const kind of STICKY_KINDS) {
      const top = this.pad.getObjectByName(`StickyPad-${kind}`)?.getObjectByName('TopSheet');
      if (top && top.getWorldPosition(this.point).distanceTo(point) <= PICK_RADIUS_M) return kind;
    }
    return null;
  }

  /** A new sticky note of `kind` peels off its stack and floats up, facing you. */
  private peelOff(kind: StickyKind): void {
    playUiSound('press');
    const sticky = this.board.create(kind);
    const view = this.views.get(sticky.id);
    if (!view) return;
    const object = view.object;
    // From the stack's top sheet...
    const top = this.pad.getObjectByName(`StickyPad-${kind}`)?.getObjectByName('TopSheet');
    top?.getWorldPosition(this.fromPosition);
    top?.getWorldQuaternion(this.fromQuaternion);
    // ...up in front of you, left of the page, turned to face you.
    this.player.head.getWorldPosition(this.head);
    this.tablet.getWorldPosition(this.target);
    this.target.lerp(this.head, TOWARD_EYES);
    this.target.y += UP_M;
    this.point.set(-1, 0, 0).applyQuaternion(this.player.head.getWorldQuaternion(this.toQuaternion)).setY(0).normalize();
    this.target.addScaledVector(this.point, LEFT_M);
    object.position.copy(this.target);
    faceViewer(object, this.world);
    this.toQuaternion.copy(object.quaternion);
    const to = this.target.clone();
    object.position.copy(this.fromPosition);
    object.quaternion.copy(this.fromQuaternion);
    this.tweens.play(
      PEEL_MS,
      (t) => {
        const e = easeOutCubic(t);
        object.position.lerpVectors(this.fromPosition, to, e);
        object.quaternion.slerpQuaternions(this.fromQuaternion, this.toQuaternion, e);
      },
      { key: `sticky-peel-${sticky.id}`, done: () => this.recordPlace(view) },
    );
    devLog('stickies', `new ${kind} sticky note`);
  }

  // ---------------------------------------------------- the sticky notes

  /** Put a sticky note in the room, as a writing surface with its own page. */
  private show(sticky: StickyNote): void {
    if (this.views.has(sticky.id)) return;
    const ink = this.board.inkFor(sticky.id);
    if (!ink) return;
    const object = createStickyObject(sticky.kind, sticky.id);
    const placement = sticky.placement;
    if (placement) {
      object.position.fromArray(placement.position);
      object.quaternion.fromArray(placement.quaternion);
    }
    const entity = this.world.createTransformEntity(object);
    // Its own page first: InkSystem picks it up when the WritingSurface arrives.
    this.surfaces.register(entity, ink);
    entity.addComponent(WritingSurface);
    this.views.set(sticky.id, { sticky, entity, object });
  }

  private hide(id: string): void {
    const view = this.views.get(id);
    if (!view) return;
    this.views.delete(id);
    this.tweens.cancel(`sticky-peel-${id}`);
    this.surfaces.unregister(view.entity);
    view.entity.dispose();
    disposeStickyObject(view.object);
  }

  /** Remember where a sticky note is now. */
  private recordPlace(view: StickyView): void {
    const { position, quaternion } = view.object;
    this.board.place(view.sticky.id, {
      frame: 'world',
      position: [position.x, position.y, position.z],
      quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    });
  }
}
