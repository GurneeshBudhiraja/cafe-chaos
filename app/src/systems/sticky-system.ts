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
 * - Carrying: pinch a sticky note (with a hand not holding the pen) and it
 *   follows the pinch, facing you. Brought near a wall, desk or other
 *   surface Quest knows (Space Setup), it lies flat on it (surface-snap.ts),
 *   so you see where it will stick; let go and it stays there. Let go in
 *   mid-air and it floats where you left it.
 * - Throwing away: while a note is carried, a bin shows at the bottom of
 *   the view (sticky-bin.ts). Over it, the bin grows and opens; let go and
 *   the note drops in, with an Undo on the toast in case of a slip.
 * - Sticky notes belong to the room, not to a note: they stay where they
 *   are, whether or not a note is open, and from one session to the next.
 *   Their places are kept relative to the room's anchor (a fixed point Quest
 *   keeps in your real room, restored each session: IWSDK's XRAnchor), so
 *   a note on the wall is on the same spot of the wall tomorrow. Without an
 *   anchor (no support for it), places are kept in the scene's own space.
 *
 * The board (sticky-board.ts) keeps and saves them; this system shows them.
 */

import {
  createSystem,
  Matrix4,
  Quaternion,
  Vector3,
  Object3D,
  XRAnchor,
  XRPlane as DetectedPlane,
  type Entity,
  type Group,
} from '@iwsdk/core';
import { getInkSurfaces, type InkSurfaces } from '../ink/ink-surfaces.js';
import { getPinchTargets } from '../input/pinch-targets.js';
import {
  createPinchReading,
  HANDS,
  PINCH_CLOSED_M,
  PINCH_OPEN_M,
  readPinch,
  type Hand,
  type HandFrame,
} from '../input/hand-pinch.js';
import { WritingSurface } from '../note-components.js';
import { stickyPadPrototype } from '../scene-assets/sticky-pad.scene-asset.js';
import { TABLET_BACK_M, TABLET_HALF_WIDTH_M } from '../scene-assets/tablet.scene-asset.js';
import { getStickyBoard, type StickyBoard } from '../stickies/sticky-board.js';
import { STICKY_KINDS, type StickyKind, type StickyNote } from '../stickies/sticky-model.js';
import { createStickyObject, disposeStickyObject, stickySize } from '../stickies/sticky-object.js';
import { StickyBin } from '../stickies/sticky-bin.js';
import { snapToSurface } from '../stickies/surface-snap.js';
import type { DetectedSurface } from '../ui/desk-placement.js';
import { faceViewer } from '../ui/drag.js';
import { getToasts, type ToastService } from '../ui/toasts.js';
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
/** How long a new note takes to peel off and float up (ms), and to drop into the bin. */
const PEEL_MS = 380;
const DROP_MS = 260;
/** A pinch this close to a sticky note (metres: off its face, or past its edges) picks it up. */
const GRAB_OFF_FACE_M = 0.04;
const GRAB_PAST_EDGE_M = 0.02;
/** Notes kept relative to the anchor wait this long for it (ms) before showing where the scene puts them. */
const ANCHOR_WAIT_MS = 4000;

interface StickyView {
  sticky: StickyNote;
  entity: Entity;
  object: Group;
  /** Its pose relative to the room's anchor, while it is kept there (null: kept in the scene's space). */
  inRoom: Matrix4 | null;
  /** Being carried or animated: its pose is set by that, not by the anchor. */
  moving: boolean;
}

/** A sticky note being carried: by which hand, and where on it the pinch holds it (its own space). */
interface Carry {
  view: StickyView;
  hand: Hand;
  grip: Vector3;
}

export class StickySystem extends createSystem({
  planes: { required: [DetectedPlane] },
}) {
  private board!: StickyBoard;
  private surfaces!: InkSurfaces;
  private pen!: PenState;
  private tweens!: Tweens;
  private toasts!: ToastService;
  private bin!: StickyBin;
  private tablet!: Object3D;
  private pad!: Object3D;
  private readonly views = new Map<string, StickyView>();
  private carry: Carry | null = null;
  /** The room's anchor: an empty at the anchor's pose once Quest has placed (or restored) it. */
  private room!: Object3D;
  private roomEntity!: Entity;
  private roomReady = false;
  private readonly startedAt = performance.now();
  private readonly roomInverse = new Matrix4();
  private readonly world4 = new Matrix4();
  // Bound once; reads the detected planes for surface-snap.ts.
  private readonly surfaceList: Iterable<DetectedSurface> = {
    [Symbol.iterator]: () => this.detectedSurfaces(),
  };
  private readonly readings = { left: createPinchReading(), right: createPinchReading() };
  private readonly wasClosed: Record<Hand, boolean> = { left: false, right: false };
  private readonly handFrame: HandFrame = { frame: null!, space: null!, origin: new Matrix4() };
  private readonly head = new Vector3();
  private readonly point = new Vector3();
  private readonly target = new Vector3();
  private readonly fromPosition = new Vector3();
  private readonly fromQuaternion = new Quaternion();
  private readonly toQuaternion = new Quaternion();
  private readonly free = new Vector3();
  private readonly headRotation = new Quaternion();
  private readonly snapPosition = new Vector3();
  private readonly snapQuaternion = new Quaternion();

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
    this.toasts = getToasts(this.world);
    this.bin = new StickyBin(this.world, this.tweens);
    this.tablet = tabletEntity.object3D;

    // The room's anchor: an empty that IWSDK's scene understanding hangs on
    // the persistent anchor (XRAnchor); once there, it is reset to sit
    // exactly at the anchor, so its world pose is the anchor's.
    this.room = new Object3D();
    this.room.name = 'StickyRoomAnchor';
    this.roomEntity = this.world.createTransformEntity(this.room);
    this.roomEntity.addComponent(XRAnchor);

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
      // A pinch on a stack or a sticky note picks it up: not an air gesture (the tool wheel's).
      getPinchTargets(this.world).register(
        (point) => (this.tablet.visible && this.stackNear(point) !== null) || this.stickyNear(point) !== null,
      ),
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

  update(delta: number): void {
    if (!this.pad) return;
    this.followRoom();
    if (!this.readHands()) return;
    if (this.carry) {
      this.updateCarry(this.carry, delta);
      return;
    }
    for (const hand of HANDS) {
      const reading = this.readings[hand];
      const closed = reading.gap < PINCH_CLOSED_M;
      const justPinched = closed && !this.wasClosed[hand];
      this.wasClosed[hand] = closed;
      // The hand holding the pen is writing, not picking things up.
      if (!justPinched || this.pen.holder === hand) continue;
      const kind = this.tablet.visible ? this.stackNear(reading.point) : null;
      if (kind) {
        this.peelOff(kind);
        return;
      }
      const view = this.stickyNear(reading.point);
      if (view) {
        this.pickUp(view, hand);
        return;
      }
    }
  }

  /** Read both hands' pinches for this frame; false outside an XR frame. */
  private readHands(): boolean {
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    if (!frame || !space) return false;
    this.handFrame.frame = frame;
    this.handFrame.space = space;
    this.handFrame.origin.copy(this.player.matrixWorld);
    for (const hand of HANDS) {
      readPinch(this.world.input.xr.getPrimaryInputSource(hand), this.handFrame, this.readings[hand]);
    }
    return true;
  }

  // ----------------------------------------------------- the room anchor

  /** Once the anchor is in place, keep every note kept there at its spot in the room. */
  private followRoom(): void {
    if (!this.roomReady && this.roomEntity.getValue(XRAnchor, 'attached')) {
      this.room.position.set(0, 0, 0);
      this.room.quaternion.identity();
      this.roomReady = true;
      devLog('stickies', 'room anchor ready');
    }
    const waitedEnough = performance.now() - this.startedAt > ANCHOR_WAIT_MS;
    if (!this.roomReady && !waitedEnough) return;
    this.room.updateWorldMatrix(true, false);
    for (const view of this.views.values()) {
      if (!view.inRoom || view.moving) continue;
      // World pose = the anchor's pose, then the note's pose relative to it.
      this.world4.multiplyMatrices(this.room.matrixWorld, view.inRoom);
      this.world4.decompose(view.object.position, view.object.quaternion, this.free.set(1, 1, 1));
      view.object.visible = true;
    }
  }

  // ------------------------------------------------------------ the pad


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
    view.moving = true;
    view.object.visible = true;
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
      {
        key: `sticky-peel-${sticky.id}`,
        done: () => {
          view.moving = false;
          this.recordPlace(view);
        },
      },
    );
    devLog('stickies', `new ${kind} sticky note`);
  }

  // ------------------------------------------------------------ carrying

  /** The sticky note a pinch at `point` would pick up: the nearest one it is on or just off. */
  private stickyNear(point: Vector3): StickyView | null {
    let best: StickyView | null = null;
    let bestDistance = GRAB_OFF_FACE_M;
    for (const view of this.views.values()) {
      const [width, height] = stickySize(view.sticky.kind);
      view.object.updateWorldMatrix(true, false);
      const local = view.object.worldToLocal(this.point.copy(point));
      const onIt = Math.abs(local.x) <= width / 2 + GRAB_PAST_EDGE_M && Math.abs(local.y) <= height / 2 + GRAB_PAST_EDGE_M;
      if (onIt && Math.abs(local.z) < bestDistance) {
        best = view;
        bestDistance = Math.abs(local.z);
      }
    }
    return best;
  }

  private pickUp(view: StickyView, hand: Hand): void {
    this.tweens.cancel(`sticky-peel-${view.sticky.id}`);
    view.object.updateWorldMatrix(true, false);
    const grip = view.object.worldToLocal(this.point.copy(this.readings[hand].point)).clone();
    grip.z = 0;
    this.carry = { view, hand, grip };
    view.moving = true;
    this.bin.show();
    playUiSound('press');
  }

  /** The note follows the pinch; over the bin it opens, near a surface it lies flat on it. Opening the pinch lets go. */
  private updateCarry(carry: Carry, delta: number): void {
    const reading = this.readings[carry.hand];
    if (!reading.tracked || reading.gap > PINCH_OPEN_M) {
      this.letGo(carry);
      return;
    }
    const object = carry.view.object;
    // Free: held by the pinch where it was gripped, turned to face you.
    faceViewer(object, this.world);
    this.free.copy(carry.grip).applyQuaternion(object.quaternion);
    object.position.copy(reading.point).sub(this.free);
    faceViewer(object, this.world);
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldQuaternion(this.headRotation);
    this.bin.follow(this.head, this.headRotation, delta);
    if (this.bin.over(object.position)) return;
    // Near a surface: flat on it instead.
    if (snapToSurface(this.surfaceList, object.position, this.head, this.snapPosition, this.snapQuaternion)) {
      object.position.copy(this.snapPosition);
      object.quaternion.copy(this.snapQuaternion);
    }
  }

  private letGo(carry: Carry): void {
    this.carry = null;
    carry.view.moving = false;
    this.wasClosed[carry.hand] = false;
    const intoBin = this.bin.over(carry.view.object.position);
    this.bin.hide();
    if (intoBin) {
      this.throwAway(carry.view);
      return;
    }
    this.recordPlace(carry.view);
    devLog('stickies', `sticky note put down at ${carry.view.object.position.toArray().map((n) => n.toFixed(2)).join(', ')}`);
  }

  /** The note drops into the bin, shrinking as it goes; the toast offers it back. */
  private throwAway(view: StickyView): void {
    const object = view.object;
    const id = view.sticky.id;
    view.moving = true;
    this.fromPosition.copy(object.position);
    const into = this.bin.mouthPosition(new Vector3());
    playUiSound('press');
    this.tweens.play(
      DROP_MS,
      (t) => {
        const e = easeOutCubic(t);
        object.position.lerpVectors(this.fromPosition, into, e);
        object.scale.setScalar(1 - 0.85 * e);
      },
      {
        key: `sticky-drop-${id}`,
        done: () => {
          this.board.remove(id);
          this.toasts.show({
            kind: 'info',
            title: 'Sticky note thrown away',
            action: { label: 'Undo', run: () => this.board.bringBack() },
          });
        },
      },
    );
    devLog('stickies', 'sticky note thrown away');
  }

  /** The detected planes, as surface-snap.ts reads them. */
  private *detectedSurfaces(): Generator<DetectedSurface> {
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(DetectedPlane, '_plane') as XRPlane | undefined;
      if (plane && entity.object3D) yield { object: entity.object3D, plane };
    }
  }

  // ---------------------------------------------------- the sticky notes

  /** Put a sticky note in the room, as a writing surface with its own page. */
  private show(sticky: StickyNote): void {
    if (this.views.has(sticky.id)) return;
    const ink = this.board.inkFor(sticky.id);
    if (!ink) return;
    const object = createStickyObject(sticky.kind, sticky.id);
    const placement = sticky.placement;
    let inRoom: Matrix4 | null = null;
    if (placement?.frame === 'anchor') {
      // Placed once the anchor is ready (followRoom); hidden until then, so it never jumps.
      inRoom = new Matrix4().compose(
        new Vector3().fromArray(placement.position),
        new Quaternion().fromArray(placement.quaternion),
        new Vector3(1, 1, 1),
      );
      object.visible = false;
    } else if (placement) {
      object.position.fromArray(placement.position);
      object.quaternion.fromArray(placement.quaternion);
    }
    const entity = this.world.createTransformEntity(object);
    // Its own page first: InkSystem picks it up when the WritingSurface arrives.
    this.surfaces.register(entity, ink);
    entity.addComponent(WritingSurface);
    this.views.set(sticky.id, { sticky, entity, object, inRoom, moving: false });
  }

  private hide(id: string): void {
    const view = this.views.get(id);
    if (!view) return;
    if (this.carry?.view === view) this.carry = null;
    this.views.delete(id);
    this.tweens.cancel(`sticky-peel-${id}`);
    this.tweens.cancel(`sticky-drop-${id}`);
    this.surfaces.unregister(view.entity);
    view.entity.dispose();
    disposeStickyObject(view.object);
  }

  /** Remember where a sticky note is now: relative to the room's anchor when there is one. */
  private recordPlace(view: StickyView): void {
    const object = view.object;
    if (!this.roomReady) {
      view.inRoom = null;
      this.board.place(view.sticky.id, {
        frame: 'world',
        position: object.position.toArray() as [number, number, number],
        quaternion: object.quaternion.toArray() as [number, number, number, number],
      });
      return;
    }
    this.room.updateWorldMatrix(true, false);
    object.updateMatrixWorld();
    view.inRoom ??= new Matrix4();
    view.inRoom.multiplyMatrices(this.roomInverse.copy(this.room.matrixWorld).invert(), object.matrixWorld);
    const position = new Vector3();
    const quaternion = new Quaternion();
    view.inRoom.decompose(position, quaternion, new Vector3());
    this.board.place(view.sticky.id, {
      frame: 'anchor',
      position: position.toArray() as [number, number, number],
      quaternion: quaternion.toArray() as [number, number, number, number],
    });
  }
}
