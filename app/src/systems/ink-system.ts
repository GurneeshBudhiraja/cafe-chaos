/**
 * InkSystem: turns pointer input on a tablet into ink, and shows the page's
 * strokes.
 *
 * Two kinds of input:
 * - The pen in hand (PenSystem, PenState): the page is touched while its
 *   nib is on it, like a real pen on paper. While the pen is held, rays do
 *   not touch the page, so the hand's ray cannot draw alongside it.
 * - IWSDK's pointer events (RayInteractable on the tablet): a desktop mouse,
 *   XR controller rays, hand rays, and hand pokes (index finger touching
 *   the surface).
 *
 * A touch (a "contact", from touch-down to lift) does what the current tool
 * does (ToolState, set on the tool wheel):
 * - pen, marker, highlighter: draws a stroke in the tool's colour and width;
 * - eraser: rubs out every stroke it passes over (its ring shows its size
 *   while the pen hovers); one rub is one undoable edit.
 * Undo and redo, picked on the wheel, reverse and re-apply ink edits.
 *
 * Interaction rules from the product plan:
 * - Ink starts only on the writing surface and stops when the pointer leaves.
 * - Only one contact is active at a time.
 * - While a tablet handle is grabbed (tablet moving), no ink is created.
 * - A large jump between samples splits the stroke instead of drawing a long
 *   accidental line (tracking loss and recovery).
 *
 * The system renders the active page of the NoteSession and hands edits to
 * it; it never writes note data itself.
 */

import {
  createSystem,
  Grabbed,
  Group,
  Mesh,
  Object3D,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { EraserCursor } from '../ink/eraser-cursor.js';
import { strokeTouchesCircle } from '../ink/stroke-hit.js';
import { classifySample, isOnPage } from '../ink/stroke-sampling.js';
import { StrokeMesh, type SurfaceSize } from '../ink/stroke-mesh.js';
import { isInkTool, type ActionId } from '../ink/tool-catalog.js';
import { createStroke, type Page, type Stroke } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
import { getPen, type PenState } from '../ui/pen-state.js';
import { getTools, type ToolState } from '../ui/tool-state.js';
import type { InkDocument } from '../notes/note-session.js';
import { TabletHandle, WritingSurface } from '../note-components.js';
import { devLog } from '../util/dev-log.js';
import {
  SURFACE_HEIGHT_M,
  SURFACE_WIDTH_M,
  WRITING_SURFACE_NAME,
} from '../scene-assets/tablet.scene-asset.js';

/** The subset of a pmndrs pointer event this system reads. */
interface InkPointerEvent {
  pointerId: number;
  /** World-space hit point. */
  point: Vector3;
  /** The mesh that was hit. */
  object: Object3D;
}

type PointerListener = (event: InkPointerEvent) => void;
interface PointerEventTarget {
  addEventListener(type: string, listener: PointerListener): void;
  removeEventListener(type: string, listener: PointerListener): void;
}

/** Ink floats this far in front of the page (meters) to avoid z-fighting. */
const INK_OFFSET_M = 0.0012;
/** The pen's nib touches the page within this height of it, and lifts off above LIFT (metres). */
const PEN_TOUCH_M = 0.003;
const PEN_LIFT_M = 0.006;
/** The eraser's ring shows while the nib hovers this close to the page (metres). */
const ERASER_RING_HOVER_M = 0.03;
/** Stands in for a pointer id for the pen's contacts (pointer ids are not negative). */
const PEN_POINTER_ID = -1;

const SURFACE_SIZE: SurfaceSize = {
  widthM: SURFACE_WIDTH_M,
  heightM: SURFACE_HEIGHT_M,
};

/** A touch on the page, from touch-down to lift, and what the tool is doing with it. */
type Contact =
  | { kind: 'ink'; pointerId: number; mesh: StrokeMesh }
  /** The strokes rubbed out so far (hidden now, removed from the note on lift). */
  | { kind: 'erase'; pointerId: number; erased: Set<string> };

/** Per-tablet runtime state. */
interface TabletInk {
  entity: Entity;
  surface: Mesh;
  inkLayer: Group;
  eraserCursor: EraserCursor;
  /** The page currently rendered, or null while no note is open. */
  page: Page | null;
  meshes: Map<string, StrokeMesh>;
  active: Contact | null;
  detach: () => void;
}

export class InkSystem extends createSystem({
  tablets: { required: [WritingSurface] },
  movingHandles: { required: [TabletHandle, Grabbed] },
}) {
  private readonly tablets = new Map<Entity, TabletInk>();
  /** Scratch: a point in the surface's space, then (after toPageCoords) page coordinates. */
  private readonly localPoint = new Vector3();
  private document!: InkDocument;
  private pen!: PenState;
  private tools!: ToolState;

  init(): void {
    this.document = getNoteSession(this.world);
    this.pen = getPen(this.world);
    this.tools = getTools(this.world);

    // 'qualify' only reports entities that match later, so attach the tablets
    // that already exist (the level loads before app systems register).
    for (const entity of this.queries.tablets.entities) this.attachTablet(entity);

    this.cleanupFuncs.push(
      this.document.subscribe((change) => {
        // Another note opened (or the first one loaded): show its page.
        if (change === 'active') this.showPage(this.document.getActivePage());
        // The page's ink changed by an edit (erase, undo, redo): match it.
        if (change === 'strokes') for (const tablet of this.tablets.values()) this.syncMeshes(tablet);
      }),
      this.tools.onAction((action) => this.runAction(action)),
      this.queries.tablets.subscribe('qualify', (entity) =>
        this.attachTablet(entity),
      ),
      this.queries.tablets.subscribe('disqualify', (entity) =>
        this.detachTablet(entity),
      ),
      // Starting to move the tablet ends any contact in progress.
      this.queries.movingHandles.subscribe('qualify', () => {
        for (const tablet of this.tablets.values()) this.endContact(tablet);
      }),
      () => {
        for (const entity of [...this.tablets.keys()]) this.detachTablet(entity);
      },
    );
  }

  /** The pen: touch the page while its nib is on it. */
  update(): void {
    for (const tablet of this.tablets.values()) {
      const penContact = tablet.active?.pointerId === PEN_POINTER_ID;
      if (!this.penCanWrite() || !tablet.page) {
        tablet.eraserCursor.hide();
        if (penContact) this.endContact(tablet);
        continue;
      }
      tablet.surface.updateWorldMatrix(true, false);
      const local = tablet.surface.worldToLocal(this.localPoint.copy(this.pen.nib));
      this.showEraserCursor(tablet, local);
      const touching = local.z < (penContact ? PEN_LIFT_M : PEN_TOUCH_M);
      if (!touching || !this.toPageCoords(tablet, this.pen.nib)) {
        if (penContact) this.endContact(tablet);
        continue;
      }
      if (penContact) this.continueContact(tablet, PEN_POINTER_ID);
      else if (!tablet.active) this.startContact(tablet, PEN_POINTER_ID);
    }
  }

  /**
   * Whether the pen in hand may touch the page: not while the tablet moves,
   * the fingers are mid-tap (loosened), or the pen is aiming at the tool wheel.
   */
  private penCanWrite(): boolean {
    return (
      this.pen.held &&
      !this.pen.loosened &&
      !this.tools.wheelOpen &&
      this.queries.movingHandles.entities.size === 0
    );
  }

  /** The eraser's ring under a hovering nib (`local`: the nib in the surface's space). */
  private showEraserCursor(tablet: TabletInk, local: Vector3): void {
    const radius = this.tools.tool === 'eraser' ? this.tools.width() : null;
    const overPage = Math.abs(local.x) <= SURFACE_WIDTH_M / 2 && Math.abs(local.y) <= SURFACE_HEIGHT_M / 2;
    if (radius === null || !overPage || local.z > ERASER_RING_HOVER_M) {
      tablet.eraserCursor.hide();
      return;
    }
    tablet.eraserCursor.show(local.x, local.y, radius * SURFACE_WIDTH_M);
  }

  /** Undo or redo, picked on the tool wheel. */
  private runAction(action: ActionId): void {
    // An edit half-made (a stroke being drawn) is finished first, so it can be undone too.
    for (const tablet of this.tablets.values()) this.endContact(tablet);
    const done = action === 'undo' ? this.document.undo() : this.document.redo();
    devLog('ink', `${action}: ${done ? 'done' : 'nothing to ' + action}`);
  }

  // ------------------------------------------------------------ rendering

  /** Replace the page shown on every tablet (used when opening a note). */
  private showPage(page: Page | null): void {
    for (const tablet of this.tablets.values()) this.renderPage(tablet, page);
  }

  private renderPage(tablet: TabletInk, page: Page | null): void {
    // Drop (do not commit) an unfinished stroke, so it cannot land in the
    // newly opened note. Its mesh is removed with the others below.
    tablet.active = null;
    this.clearMeshes(tablet);
    tablet.page = page;
    for (const stroke of page?.strokes ?? []) this.addStrokeMesh(tablet, stroke);
  }

  /**
   * Make the meshes match the page after an edit: add strokes that came
   * back (undo), remove ones that went (erase), rebuild ones replaced by a
   * changed copy (a move), and keep the rest as they are.
   */
  private syncMeshes(tablet: TabletInk): void {
    const page = tablet.page;
    if (!page) return;
    const onPage = new Set<string>();
    for (const stroke of page.strokes) {
      onPage.add(stroke.id);
      const mesh = tablet.meshes.get(stroke.id);
      if (mesh?.stroke === stroke) {
        mesh.mesh.visible = true;
        continue;
      }
      if (mesh) this.removeStrokeMesh(tablet, stroke.id);
      this.addStrokeMesh(tablet, stroke);
    }
    for (const id of [...tablet.meshes.keys()]) {
      if (!onPage.has(id)) this.removeStrokeMesh(tablet, id);
    }
  }

  private addStrokeMesh(tablet: TabletInk, stroke: Stroke): StrokeMesh {
    const mesh = new StrokeMesh(stroke, SURFACE_SIZE);
    tablet.meshes.set(stroke.id, mesh);
    tablet.inkLayer.add(mesh.mesh);
    return mesh;
  }

  private removeStrokeMesh(tablet: TabletInk, id: string): void {
    const mesh = tablet.meshes.get(id);
    if (!mesh) return;
    mesh.mesh.removeFromParent();
    mesh.dispose();
    tablet.meshes.delete(id);
  }

  private clearMeshes(tablet: TabletInk): void {
    for (const id of [...tablet.meshes.keys()]) this.removeStrokeMesh(tablet, id);
  }

  // -------------------------------------------------------------- tablets

  private attachTablet(entity: Entity): void {
    if (this.tablets.has(entity)) return;
    const root = entity.object3D;
    const surface = root?.getObjectByName(WRITING_SURFACE_NAME);
    if (!root || !(surface instanceof Mesh)) {
      console.warn('[InkSystem] Tablet has no writing surface mesh.', entity);
      return;
    }

    const inkLayer = new Group();
    inkLayer.name = 'InkLayer';
    inkLayer.position.z = INK_OFFSET_M;
    root.add(inkLayer);

    const tablet: TabletInk = {
      entity,
      surface,
      inkLayer,
      eraserCursor: new EraserCursor(inkLayer),
      page: null,
      meshes: new Map(),
      active: null,
      detach: () => {},
    };

    const onDown: PointerListener = (e) => this.handleDown(tablet, e);
    const onMove: PointerListener = (e) => this.handleMove(tablet, e);
    const onEnd: PointerListener = (e) => {
      if (tablet.active?.pointerId === e.pointerId) this.endContact(tablet);
    };

    // Pointer events bubble from the hit mesh up to the entity root.
    const target = root as unknown as PointerEventTarget;
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onEnd);
    target.addEventListener('pointerleave', onEnd);
    target.addEventListener('pointercancel', onEnd);
    tablet.detach = () => {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onEnd);
      target.removeEventListener('pointerleave', onEnd);
      target.removeEventListener('pointercancel', onEnd);
    };

    this.tablets.set(entity, tablet);
    this.renderPage(tablet, this.document.getActivePage());
  }

  private detachTablet(entity: Entity): void {
    const tablet = this.tablets.get(entity);
    if (!tablet) return;
    tablet.detach();
    this.clearMeshes(tablet);
    tablet.eraserCursor.dispose();
    tablet.inkLayer.removeFromParent();
    this.tablets.delete(entity);
  }

  // ------------------------------------------------------- pointer input

  private handleDown(tablet: TabletInk, event: InkPointerEvent): void {
    if (tablet.active || !tablet.page) return; // One contact; a note is open.
    if (this.pen.held) return; // The pen writes; the ray does not.
    if (this.queries.movingHandles.entities.size > 0) return; // Tablet moving.
    if (event.object !== tablet.surface) return; // Bezel, not page.
    if (!this.toPageCoords(tablet, event.point)) return;
    this.startContact(tablet, event.pointerId);
  }

  private handleMove(tablet: TabletInk, event: InkPointerEvent): void {
    const active = tablet.active;
    if (!active || active.pointerId !== event.pointerId) return;

    // Leaving the page (or crossing onto the bezel) ends the contact.
    if (event.object !== tablet.surface || !this.toPageCoords(tablet, event.point)) {
      this.endContact(tablet);
      return;
    }
    this.continueContact(tablet, event.pointerId);
  }

  // ------------------------------------------------------------- contacts

  /** Touch down at the page point in `this.localPoint`: begin what the current tool does. */
  private startContact(tablet: TabletInk, pointerId: number): void {
    const tool = this.tools.tool;
    if (tool === 'eraser') {
      tablet.active = { kind: 'erase', pointerId, erased: new Set() };
      this.rubOut(tablet, tablet.active.erased);
      return;
    }
    const color = this.tools.colour();
    const width = this.tools.width();
    if (!isInkTool(tool) || color === null || width === null) return;
    const stroke = createStroke(color, width, tool);
    stroke.points.push(this.localPoint.x, this.localPoint.y);
    const mesh = this.addStrokeMesh(tablet, stroke);
    tablet.active = { kind: 'ink', pointerId, mesh };
  }

  /** The contact moved to the page point in `this.localPoint`. */
  private continueContact(tablet: TabletInk, pointerId: number): void {
    const active = tablet.active;
    if (!active) return;
    if (active.kind === 'erase') {
      this.rubOut(tablet, active.erased);
      return;
    }
    const points = active.mesh.stroke.points;
    const x = this.localPoint.x;
    const y = this.localPoint.y;
    const decision = classifySample(
      points[points.length - 2],
      points[points.length - 1],
      x,
      y,
    );
    if (decision === 'skip') return;
    if (decision === 'split') {
      // Treat a large jump as tracking recovery: start fresh at the new point.
      this.endContact(tablet);
      this.startContact(tablet, pointerId);
      return;
    }
    points.push(x, y);
    active.mesh.appendLatestPoint();
  }

  /** Lift: hand the finished stroke, or the rubbed-out strokes, to the note. */
  private endContact(tablet: TabletInk): void {
    const active = tablet.active;
    if (!active) return;
    tablet.active = null;
    if (active.kind === 'erase') {
      this.document.eraseStrokes(active.erased);
      if (active.erased.size > 0) devLog('ink', `erased ${active.erased.size} strokes`);
      return;
    }
    const stroke = active.mesh.stroke;
    // The session appends the stroke to the active page and autosaves.
    this.document.commitStroke(stroke);
    devLog(
      'ink',
      `stroke committed: ${stroke.points.length / 2} points, page has ${tablet.page?.strokes.length ?? 0} strokes`,
    );
  }

  /** Hide every stroke the eraser touches at the page point in `this.localPoint`, adding it to `erased`. */
  private rubOut(tablet: TabletInk, erased: Set<string>): void {
    const radius = this.tools.width();
    if (!tablet.page || radius === null) return;
    for (const stroke of tablet.page.strokes) {
      if (erased.has(stroke.id)) continue;
      if (!strokeTouchesCircle(stroke, this.localPoint.x, this.localPoint.y, radius)) continue;
      erased.add(stroke.id);
      const mesh = tablet.meshes.get(stroke.id);
      if (mesh) mesh.mesh.visible = false;
    }
  }

  /**
   * Convert a world-space hit point into page coordinates, stored in
   * `this.localPoint.x/y`. Returns false when the point is off the page.
   */
  private toPageCoords(tablet: TabletInk, worldPoint: Vector3): boolean {
    const local = tablet.surface.worldToLocal(this.localPoint.copy(worldPoint));
    const u = local.x / SURFACE_WIDTH_M + 0.5;
    const v = 0.5 - local.y / SURFACE_HEIGHT_M;
    local.set(u, v, 0);
    return isOnPage(u, v);
  }
}
