/**
 * InkSystem: turns pointer input on a tablet into strokes.
 *
 * Input comes from IWSDK's pointer events (RayInteractable on the tablet), so
 * the same code handles a desktop mouse, XR controller rays, hand rays, and
 * hand pokes (index finger touching the surface).
 *
 * Interaction rules from the product plan:
 * - Ink starts only on the writing surface and stops when the pointer leaves.
 * - Only one stroke is active at a time.
 * - While a tablet handle is grabbed (tablet moving), no ink is created.
 * - A large jump between samples splits the stroke instead of drawing a long
 *   accidental line (tracking loss and recovery).
 *
 * The system renders the active page of the NoteSession and hands finished
 * strokes to it; it never writes note data itself.
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
import { classifySample, isOnPage } from '../ink/stroke-sampling.js';
import { StrokeMesh, type SurfaceSize } from '../ink/stroke-mesh.js';
import { createStroke, type Page, type Stroke } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
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

const SURFACE_SIZE: SurfaceSize = {
  widthM: SURFACE_WIDTH_M,
  heightM: SURFACE_HEIGHT_M,
};

/** Per-tablet runtime state. */
interface TabletInk {
  entity: Entity;
  surface: Mesh;
  inkLayer: Group;
  /** The page currently rendered, or null while no note is open. */
  page: Page | null;
  meshes: Map<string, StrokeMesh>;
  active: { pointerId: number; mesh: StrokeMesh } | null;
  detach: () => void;
}

export class InkSystem extends createSystem({
  tablets: { required: [WritingSurface] },
  movingHandles: { required: [TabletHandle, Grabbed] },
}) {
  private readonly tablets = new Map<Entity, TabletInk>();
  private readonly localPoint = new Vector3();
  private document!: InkDocument;

  init(): void {
    this.document = getNoteSession(this.world);

    // 'qualify' only reports entities that match later, so attach the tablets
    // that already exist (the level loads before app systems register).
    for (const entity of this.queries.tablets.entities) this.attachTablet(entity);

    this.cleanupFuncs.push(
      // Re-render when another note is opened (or the first one loads).
      this.document.subscribe((change) => {
        if (change === 'active') this.showPage(this.document.getActivePage());
      }),
      this.queries.tablets.subscribe('qualify', (entity) =>
        this.attachTablet(entity),
      ),
      this.queries.tablets.subscribe('disqualify', (entity) =>
        this.detachTablet(entity),
      ),
      // Starting to move the tablet ends any stroke in progress.
      this.queries.movingHandles.subscribe('qualify', () => {
        for (const tablet of this.tablets.values()) this.endStroke(tablet);
      }),
      () => {
        for (const entity of [...this.tablets.keys()]) this.detachTablet(entity);
      },
    );
  }

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
      page: null,
      meshes: new Map(),
      active: null,
      detach: () => {},
    };

    const onDown: PointerListener = (e) => this.handleDown(tablet, e);
    const onMove: PointerListener = (e) => this.handleMove(tablet, e);
    const onEnd: PointerListener = (e) => {
      if (tablet.active?.pointerId === e.pointerId) this.endStroke(tablet);
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
    tablet.inkLayer.removeFromParent();
    this.tablets.delete(entity);
  }

  private handleDown(tablet: TabletInk, event: InkPointerEvent): void {
    if (tablet.active || !tablet.page) return; // One stroke; a note is open.
    if (this.queries.movingHandles.entities.size > 0) return; // Tablet moving.
    if (event.object !== tablet.surface) return; // Bezel, not page.
    if (!this.toPageCoords(tablet, event.point)) return;
    this.startStroke(tablet, event.pointerId);
  }

  private handleMove(tablet: TabletInk, event: InkPointerEvent): void {
    const active = tablet.active;
    if (!active || active.pointerId !== event.pointerId) return;

    // Leaving the page (or crossing onto the bezel) ends the stroke.
    if (event.object !== tablet.surface || !this.toPageCoords(tablet, event.point)) {
      this.endStroke(tablet);
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
      this.endStroke(tablet);
      this.startStroke(tablet, event.pointerId);
      return;
    }
    points.push(x, y);
    active.mesh.appendLatestPoint();
  }

  /** Start a stroke at the page point stored in `this.localPoint`. */
  private startStroke(tablet: TabletInk, pointerId: number): void {
    const color = tablet.entity.getValue(WritingSurface, 'inkColor') as string;
    const width = tablet.entity.getValue(WritingSurface, 'inkWidth') as number;
    const stroke = createStroke(color, width);
    stroke.points.push(this.localPoint.x, this.localPoint.y);
    const mesh = this.addStrokeMesh(tablet, stroke);
    tablet.active = { pointerId, mesh };
  }

  private endStroke(tablet: TabletInk): void {
    const active = tablet.active;
    if (!active) return;
    tablet.active = null;
    const stroke = active.mesh.stroke;
    // The session appends the stroke to the active page and autosaves.
    this.document.commitStroke(stroke);
    devLog(
      'ink',
      `stroke committed: ${stroke.points.length / 2} points, page has ${tablet.page?.strokes.length ?? 0} strokes`,
    );
  }

  private addStrokeMesh(tablet: TabletInk, stroke: Stroke): StrokeMesh {
    const mesh = new StrokeMesh(stroke, SURFACE_SIZE);
    tablet.meshes.set(stroke.id, mesh);
    tablet.inkLayer.add(mesh.mesh);
    return mesh;
  }

  private clearMeshes(tablet: TabletInk): void {
    for (const mesh of tablet.meshes.values()) {
      mesh.mesh.removeFromParent();
      mesh.dispose();
    }
    tablet.meshes.clear();
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
