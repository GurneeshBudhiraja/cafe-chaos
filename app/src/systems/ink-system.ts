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
 *   while the pen hovers); one rub is one undoable edit;
 * - lasso: draws a loop that selects the strokes inside it; a touch inside
 *   the selection's box then drags it, and lifting moves it (lasso.ts).
 *   Delete (on the lasso's options ring) removes the selection.
 * Undo and redo, picked on the wheel, reverse and re-apply ink edits.
 *
 * Interaction rules from the product plan:
 * - Ink starts only on the writing surface and stops when the pointer leaves.
 * - Only one contact is active at a time.
 * - While a tablet handle is grabbed (tablet moving), no ink is created.
 * - A large jump between samples splits the stroke instead of drawing a long
 *   accidental line (tracking loss and recovery).
 *
 * Every surface with a WritingSurface takes ink: the tablet shows the open
 * note (NoteSession); others, such as sticky notes, show their own page
 * (ink-surfaces.ts). Tool sizes are the same on every surface (set against
 * the tablet's page), so a pen line is as thick on a sticky note as on the
 * tablet. Undo and redo act on the surface written on last.
 *
 * The system renders each surface's page and hands edits to its document;
 * it never writes note data itself.
 */

import {
  createSystem,
  Grabbed,
  Group,
  Mesh,
  Object3D,
  Vector3,
  type Entity,
  type PlaneGeometry,
} from '@iwsdk/core';
import { getInkSurfaces, type InkSurfaces } from '../ink/ink-surfaces.js';
import { EraserCursor } from '../ink/eraser-cursor.js';
import { LassoSelection } from '../ink/lasso.js';
import { strokeTouchesCircle } from '../ink/stroke-hit.js';
import { classifySample, isOnPage } from '../ink/stroke-sampling.js';
import { StrokeMesh, type SurfaceSize } from '../ink/stroke-mesh.js';
import { isInkTool, type PageAction } from '../ink/tool-catalog.js';
import { createStroke, type Page, type Stroke } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
import { getPen, type PenState } from '../ui/pen-state.js';
import { getTools, type ToolState } from '../ui/tool-state.js';
import type { InkDocument, NoteSessionChange } from '../notes/note-session.js';
import { TabletHandle, WritingSurface } from '../note-components.js';
import { devLog } from '../util/dev-log.js';
import {
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
/** A nib further than this behind a surface is not touching it (it went past: metres). */
const PEN_BEHIND_M = 0.015;
/** Stands in for a pointer id for the pen's contacts (pointer ids are not negative). */
const PEN_POINTER_ID = -1;
/** Tool widths and eraser radii are fractions of the tablet's page width (tool-catalog.ts). */
const TOOL_SCALE_WIDTH_M = SURFACE_WIDTH_M;

/** A touch on the page, from touch-down to lift, and what the tool is doing with it. */
type Contact =
  | { kind: 'ink'; pointerId: number; mesh: StrokeMesh }
  /** The strokes rubbed out so far (hidden now, removed from the note on lift). */
  | { kind: 'erase'; pointerId: number; erased: Set<string> }
  /** Drawing a lasso loop. */
  | { kind: 'lasso'; pointerId: number }
  /** Dragging the lasso's selection. */
  | { kind: 'move'; pointerId: number };

/** Per-surface runtime state (the tablet, or a sticky note). */
interface TabletInk {
  entity: Entity;
  surface: Mesh;
  /** The page this surface shows and edits. */
  document: InkDocument;
  /** The writing area's size in metres, and its width / height. */
  size: SurfaceSize;
  aspect: number;
  inkLayer: Group;
  eraserCursor: EraserCursor;
  lasso: LassoSelection;
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
  /** The open note: what the tablet shows (and any surface without its own page). */
  private session!: InkDocument;
  private surfaces!: InkSurfaces;
  private pen!: PenState;
  private tools!: ToolState;
  /** The surface written on last: undo and redo act on it. */
  private focused: TabletInk | null = null;

  init(): void {
    this.session = getNoteSession(this.world);
    this.surfaces = getInkSurfaces(this.world);
    this.pen = getPen(this.world);
    this.tools = getTools(this.world);

    // 'qualify' only reports entities that match later, so attach the tablets
    // that already exist (the level loads before app systems register).
    for (const entity of this.queries.tablets.entities) this.attachTablet(entity);

    this.cleanupFuncs.push(
      this.tools.onAction((action) => this.runAction(action)),
      // The selection belongs to the lasso: picking another tool drops it.
      this.tools.subscribe((change) => {
        if (change !== 'tool' || this.tools.tool === 'lasso') return;
        for (const tablet of this.tablets.values()) tablet.lasso.clear(tablet.meshes);
      }),
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
      if (!tablet.surface.visible) continue;
      tablet.surface.updateWorldMatrix(true, false);
      const local = tablet.surface.worldToLocal(this.localPoint.copy(this.pen.nib));
      this.showEraserCursor(tablet, local);
      const touching = local.z < (penContact ? PEN_LIFT_M : PEN_TOUCH_M) && local.z > -PEN_BEHIND_M;
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
    const { widthM, heightM } = tablet.size;
    const overPage = Math.abs(local.x) <= widthM / 2 && Math.abs(local.y) <= heightM / 2;
    if (radius === null || !overPage || local.z > ERASER_RING_HOVER_M || local.z < -PEN_BEHIND_M) {
      tablet.eraserCursor.hide();
      return;
    }
    tablet.eraserCursor.show(local.x, local.y, radius * TOOL_SCALE_WIDTH_M);
  }

  /** Undo, redo or delete the selection, picked on the tool wheel. */
  private runAction(action: PageAction): void {
    // An edit half-made (a stroke being drawn) is finished first, so it can be undone too.
    for (const tablet of this.tablets.values()) this.endContact(tablet);
    if (action === 'delete-selection') {
      for (const tablet of this.tablets.values()) {
        const ids = new Set(tablet.lasso.ids);
        tablet.lasso.clear(tablet.meshes);
        tablet.document.eraseStrokes(ids);
      }
      return;
    }
    const document = this.focused?.document ?? this.session;
    const done = action === 'undo' ? document.undo() : document.redo();
    devLog('ink', `${action}: ${done ? 'done' : 'nothing to ' + action}`);
  }

  // ------------------------------------------------------------ rendering

  /** The surface's document changed: another page opened, or its ink was edited. */
  private onDocumentChange(tablet: TabletInk, change: NoteSessionChange): void {
    // Another note opened (or the first one loaded): show its page.
    if (change === 'active') this.renderPage(tablet, tablet.document.getActivePage());
    // The page's ink changed by an edit (erase, move, undo, redo): match it.
    if (change === 'strokes') {
      this.syncMeshes(tablet);
      if (tablet.page) tablet.lasso.refresh(tablet.page);
    }
  }

  private renderPage(tablet: TabletInk, page: Page | null): void {
    // Drop (do not commit) an unfinished stroke, so it cannot land in the
    // newly opened note. Its mesh is removed with the others below.
    tablet.active = null;
    tablet.lasso.clear(tablet.meshes);
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
    const mesh = new StrokeMesh(stroke, tablet.size);
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

    // Ink lies on the writing area itself, so it follows wherever that sits.
    const inkLayer = new Group();
    inkLayer.name = 'InkLayer';
    inkLayer.position.z = INK_OFFSET_M;
    surface.add(inkLayer);

    const { width, height } = writingAreaSize(surface);
    const size: SurfaceSize = { widthM: width, heightM: height };
    const tablet: TabletInk = {
      entity,
      surface,
      document: this.surfaces.documentFor(entity) ?? this.session,
      size,
      aspect: width / height,
      inkLayer,
      eraserCursor: new EraserCursor(inkLayer),
      lasso: new LassoSelection(inkLayer, size),
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
    const unsubscribe = tablet.document.subscribe((change) => this.onDocumentChange(tablet, change));
    tablet.detach = () => {
      unsubscribe();
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onEnd);
      target.removeEventListener('pointerleave', onEnd);
      target.removeEventListener('pointercancel', onEnd);
    };

    this.tablets.set(entity, tablet);
    this.renderPage(tablet, tablet.document.getActivePage());
  }

  private detachTablet(entity: Entity): void {
    const tablet = this.tablets.get(entity);
    if (!tablet) return;
    tablet.detach();
    tablet.lasso.dispose(tablet.meshes);
    this.clearMeshes(tablet);
    tablet.eraserCursor.dispose();
    tablet.inkLayer.removeFromParent();
    this.tablets.delete(entity);
    if (this.focused === tablet) this.focused = null;
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
    this.focused = tablet;
    const tool = this.tools.tool;
    const { x, y } = this.localPoint;
    if (tool === 'lasso') {
      // Inside the selection's box: drag it. Anywhere else: a new loop.
      if (tablet.lasso.contains(x, y)) {
        tablet.lasso.startMove(x, y);
        tablet.active = { kind: 'move', pointerId };
      } else {
        tablet.lasso.startLoop(x, y, tablet.meshes);
        tablet.active = { kind: 'lasso', pointerId };
      }
      return;
    }
    if (tool === 'eraser') {
      tablet.active = { kind: 'erase', pointerId, erased: new Set() };
      this.rubOut(tablet, tablet.active.erased);
      return;
    }
    const color = this.tools.colour();
    const width = this.tools.width();
    if (!isInkTool(tool) || color === null || width === null) return;
    const stroke = createStroke(color, this.onSurface(width, tablet), tool);
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
    if (active.kind === 'lasso') {
      tablet.lasso.extendLoop(this.localPoint.x, this.localPoint.y);
      return;
    }
    if (active.kind === 'move') {
      tablet.lasso.moveTo(this.localPoint.x, this.localPoint.y, tablet.meshes);
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

  /** Lift: hand the finished stroke, the rubbed-out strokes or the moved ones to the note; or close a loop. */
  private endContact(tablet: TabletInk): void {
    const active = tablet.active;
    if (!active) return;
    tablet.active = null;
    if (active.kind === 'lasso') {
      if (tablet.page) devLog('ink', `lasso selected ${tablet.lasso.finishLoop(tablet.page)} strokes`);
      return;
    }
    if (active.kind === 'move') {
      const moved = tablet.page ? tablet.lasso.finishMove(tablet.page) : null;
      if (moved) tablet.document.replaceStrokes(moved);
      return;
    }
    if (active.kind === 'erase') {
      tablet.document.eraseStrokes(active.erased);
      if (active.erased.size > 0) devLog('ink', `erased ${active.erased.size} strokes`);
      return;
    }
    const stroke = active.mesh.stroke;
    // The document appends the stroke to its page and autosaves.
    tablet.document.commitStroke(stroke);
    devLog(
      'ink',
      `stroke committed: ${stroke.points.length / 2} points, page has ${tablet.page?.strokes.length ?? 0} strokes`,
    );
  }

  /** Hide every stroke the eraser touches at the page point in `this.localPoint`, adding it to `erased`. */
  private rubOut(tablet: TabletInk, erased: Set<string>): void {
    const toolRadius = this.tools.width();
    if (!tablet.page || toolRadius === null) return;
    const radius = this.onSurface(toolRadius, tablet);
    for (const stroke of tablet.page.strokes) {
      if (erased.has(stroke.id)) continue;
      if (!strokeTouchesCircle(stroke, this.localPoint.x, this.localPoint.y, radius, tablet.aspect)) continue;
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
    const u = local.x / tablet.size.widthM + 0.5;
    const v = 0.5 - local.y / tablet.size.heightM;
    local.set(u, v, 0);
    return isOnPage(u, v);
  }

  /** A tool size (a fraction of the tablet's page width) as a fraction of this surface's width. */
  private onSurface(toolFraction: number, tablet: TabletInk): number {
    return (toolFraction * TOOL_SCALE_WIDTH_M) / tablet.size.widthM;
  }
}

/**
 * A writing area's size (metres): a code-built plane knows it; a loaded
 * model's (the Blender tablet) is measured from its bounds.
 */
function writingAreaSize(surface: Mesh): { width: number; height: number } {
  const parameters = (surface.geometry as Partial<PlaneGeometry>).parameters;
  if (parameters) return parameters;
  surface.geometry.computeBoundingBox();
  const box = surface.geometry.boundingBox!;
  return { width: box.max.x - box.min.x, height: box.max.y - box.min.y };
}
