/**
 * CanvasGestureSystem: pan and zoom the page's infinite canvas by hand.
 *
 * Pinch the page (close the thumb and index finger on or just over it) and
 * the canvas is held where the fingers closed:
 * - one hand: move it to pan, as if sliding a sheet of paper;
 * - two hands: move them apart to zoom in and together to zoom out, around
 *   the point between them, and move them together to pan (like stretching
 *   a photo with two fingers, at the scale of the hands).
 * The canvas point under each pinch stays under it as the hands move.
 * Letting go keeps the view and saves it with the note.
 *
 * The hand holding the pen is writing, not gesturing: with the pen in
 * hand, the free hand pans. The note bar's zoom readout shows how close the
 * view is; tapping it goes back to the first page's area (HOME_VIEW).
 *
 * A pinch on the page counts as pinching something (PinchTargets), so it
 * does not open the tool wheel. Works on the tablet and on the floating page
 * in Type mode alike.
 */

import { createSystem, Matrix4, Mesh, Vector3, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { createPinchReading, HANDS, PINCH_CLOSED_M, PINCH_OPEN_M, readPinch, type Hand, type HandFrame, type PinchReading } from '../input/hand-pinch.js';
import { getPinchTargets } from '../input/pinch-targets.js';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import { clampZoom, HOME_VIEW, pageToCanvas, sameView, type PageView } from '../notes/page-view.js';
import { SURFACE_HEIGHT_M, SURFACE_WIDTH_M, WRITING_SURFACE_NAME } from '../scene-assets/tablet.scene-asset.js';
import { getCanvasGesture, type CanvasGestureState } from '../ui/canvas-gesture-state.js';
import { getNoteView, type NoteViewState } from '../ui/note-view.js';
import { OneEuroVector3, type OneEuroSettings } from '../ui/one-euro.js';
import { addStateColors, NEUTRAL_STATES, PanelBinding, setText } from '../ui/panel-helpers.js';
import { getPen, type PenState } from '../ui/pen-state.js';
import { easeInOutCubic, getTweens, type Tweens } from '../ui/tweens.js';

const TABLET_NODE = 'tablet';
const BAR_NODE = 'note-bar';
/** A pinch counts on the page when it closes within this distance of the page's plane (metres)... */
const REACH_M = 0.045;
/** ...and over the page or this close past its edges (metres). */
const EDGE_SLACK_M = 0.015;
/** Steadying the pinch points against hand-tracking shake: still hands hold still, moving ones follow quickly. */
const STEADY: OneEuroSettings = { minCutoffHz: 1.5, beta: 25, derivativeCutoffHz: 1 };
/** Going back to the home view (ms). */
const HOME_MS = 380;

/** One pinch holding the canvas. */
interface Grip {
  hand: Hand;
  /** The pinch point, steadied, in the page's plane (metres from its centre). */
  now: Vector3;
  filter: OneEuroVector3;
}

export class CanvasGestureSystem extends createSystem({}) {
  private session!: NoteSession;
  private noteView!: NoteViewState;
  private pen!: PenState;
  private gesture!: CanvasGestureState;
  private tweens!: Tweens;
  private surface!: Mesh;
  private zoomLabel: UIKit.Text | null = null;
  private readonly readings: Record<Hand, PinchReading> = { left: createPinchReading(), right: createPinchReading() };
  private readonly closed: Record<Hand, boolean> = { left: false, right: false };
  private readonly grips = new Map<Hand, Grip>();
  /** The view and the grips' points when the current hold began (or last changed hands). */
  private startView: PageView = { ...HOME_VIEW };
  private readonly startPoints = new Map<Hand, Vector3>();
  /** The view being set by the hands. */
  private readonly view: PageView = { ...HOME_VIEW };
  private readonly handFrame: HandFrame = { frame: null!, space: null!, origin: new Matrix4() };
  private readonly local = new Vector3();
  private readonly canvasPoint = { x: 0, y: 0 };
  private shownZoom = -1;

  init(): void {
    const surface = this.world.getSceneEntity(TABLET_NODE)?.object3D?.getObjectByName(WRITING_SURFACE_NAME);
    if (!(surface instanceof Mesh)) {
      console.warn('[CanvasGestureSystem] The tablet page is missing.');
      return;
    }
    this.surface = surface;
    this.session = getNoteSession(this.world);
    this.noteView = getNoteView(this.world);
    this.pen = getPen(this.world);
    this.gesture = getCanvasGesture(this.world);
    this.tweens = getTweens(this.world);
    this.bindZoomReadout();
    this.cleanupFuncs.push(
      // A pinch on the page is a hold on the canvas, not an air pinch for the tool wheel.
      getPinchTargets(this.world).register((point) => this.noteView.isOpen && this.onPage(point)),
      this.session.subscribe((change) => {
        if (change === 'view' || change === 'active') this.showZoom();
      }),
    );
  }

  update(delta: number): void {
    if (!this.surface) return;
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    if (!frame || !space || !this.noteView.isOpen || !this.session.active) {
      this.endHold();
      return;
    }
    this.handFrame.frame = frame;
    this.handFrame.space = space;
    this.handFrame.origin.copy(this.player.matrixWorld);
    this.surface.updateWorldMatrix(true, false);

    let changed = false;
    for (const hand of HANDS) {
      const reading = this.readings[hand];
      const tracked = readPinch(this.world.input.xr.getPrimaryInputSource(hand), this.handFrame, reading);
      const wasClosed = this.closed[hand];
      // Hysteresis: closed below CLOSED, open above OPEN.
      if (!tracked || reading.gap > PINCH_OPEN_M) this.closed[hand] = false;
      else if (reading.gap < PINCH_CLOSED_M) this.closed[hand] = true;
      const grip = this.grips.get(hand);
      // The pen's hand is holding the pen.
      const free = this.pen.holder !== hand;
      if (grip && (!this.closed[hand] || !free)) {
        this.grips.delete(hand);
        changed = true;
      } else if (!grip && free && this.closed[hand] && !wasClosed && this.onPage(reading.point)) {
        const filter = new OneEuroVector3(STEADY);
        const now = new Vector3();
        this.toPagePlane(reading.point, now);
        filter.reset(now);
        this.grips.set(hand, { hand, now, filter });
        changed = true;
      }
    }
    for (const grip of this.grips.values()) {
      this.toPagePlane(this.readings[grip.hand].point, this.local);
      grip.now.copy(grip.filter.next(this.local, delta));
    }

    if (this.grips.size === 0) {
      this.endHold();
      return;
    }
    if (changed || !this.gesture.active) this.beginHold();
    this.followHands();
  }

  // ------------------------------------------------------------- holding

  /** (Re)start the hold from where the hands are now: a hand joining or leaving starts afresh. */
  private beginHold(): void {
    this.tweens.cancel('canvas-home');
    this.startView = { ...this.session.getView() };
    Object.assign(this.view, this.startView);
    this.startPoints.clear();
    for (const [hand, grip] of this.grips) this.startPoints.set(hand, grip.now.clone());
    this.gesture.set(true);
  }

  /** Keep the canvas points the hands took hold of under the hands. */
  private followHands(): void {
    const grips = [...this.grips.values()];
    const start = this.startView;
    let zoom = start.zoom;
    if (grips.length >= 2) {
      const [a, b] = grips;
      const startA = this.startPoints.get(a.hand);
      const startB = this.startPoints.get(b.hand);
      if (!startA || !startB) return;
      const startDistance = startA.distanceTo(startB);
      if (startDistance > 0.01) zoom = clampZoom(start.zoom * (a.now.distanceTo(b.now) / startDistance));
      // Hold the canvas point that was between the hands, under the point between them now.
      this.holdPoint(
        (startA.x + startB.x) / 2,
        (startA.y + startB.y) / 2,
        (a.now.x + b.now.x) / 2,
        (a.now.y + b.now.y) / 2,
        zoom,
      );
    } else {
      const grip = grips[0];
      const from = this.startPoints.get(grip.hand);
      if (!from) return;
      this.holdPoint(from.x, from.y, grip.now.x, grip.now.y, zoom);
    }
    if (!sameView(this.view, this.session.getView())) this.session.setView(this.view);
  }

  /**
   * Set the view so the canvas point that was under page point `from`
   * (metres, at the hold's start) is under page point `to` now, at `zoom`.
   */
  private holdPoint(fromX: number, fromY: number, toX: number, toY: number, zoom: number): void {
    const held = pageToCanvas(this.startView, fromX / SURFACE_WIDTH_M + 0.5, 0.5 - fromY / SURFACE_HEIGHT_M, this.canvasPoint);
    const u = toX / SURFACE_WIDTH_M + 0.5;
    const v = 0.5 - toY / SURFACE_HEIGHT_M;
    this.view.zoom = zoom;
    this.view.x = held.x - (u - 0.5) / zoom;
    this.view.y = held.y - (v - 0.5) / zoom;
  }

  /** Let go: the view stays, and is saved with the note. */
  private endHold(): void {
    this.grips.clear();
    if (!this.gesture?.active) return;
    this.gesture.set(false);
    this.session.setView(this.session.getView(), true);
  }

  // ------------------------------------------------------------- the page

  /** A world point into the page's plane (metres from its centre; z: height over it). */
  private toPagePlane(point: Vector3, out: Vector3): Vector3 {
    return this.surface.worldToLocal(out.copy(point));
  }

  /** Whether a world point is on the page, or just over it. */
  private onPage(point: Vector3): boolean {
    if (!this.surface?.visible) return false;
    this.surface.updateWorldMatrix(true, false);
    const local = this.surface.worldToLocal(this.local.copy(point));
    // The page may be scaled (Type mode): compare in the world's metres.
    const scale = this.surface.matrixWorld.getMaxScaleOnAxis();
    return (
      Math.abs(local.z) * scale < REACH_M &&
      (Math.abs(local.x) - SURFACE_WIDTH_M / 2) * scale < EDGE_SLACK_M &&
      (Math.abs(local.y) - SURFACE_HEIGHT_M / 2) * scale < EDGE_SLACK_M
    );
  }

  // ------------------------------------------------------- zoom readout

  /** The zoom readout on the note bar; a tap goes back to the first page's area. */
  private bindZoomReadout(): void {
    const bar = this.world.getSceneObject<UIKitMLAsset>(BAR_NODE);
    if (!bar) return;
    const ui = new PanelBinding(bar, this.cleanupFuncs);
    const button = ui.onClick('note-bar-zoom', () => this.goHome());
    addStateColors(button, NEUTRAL_STATES, this.cleanupFuncs);
    this.zoomLabel = ui.text('note-bar-zoom-label');
    this.showZoom();
  }

  private showZoom(): void {
    const zoom = Math.round(this.session.getView().zoom * 100);
    if (!this.zoomLabel || zoom === this.shownZoom) return;
    this.shownZoom = zoom;
    setText(this.zoomLabel, `${zoom}%`);
  }

  /** Glide back to the first page's area at its own size. */
  private goHome(): void {
    const from = { ...this.session.getView() };
    if (sameView(from, HOME_VIEW)) return;
    const view: PageView = { ...from };
    this.tweens.play(
      HOME_MS,
      (t) => {
        const e = easeInOutCubic(t);
        // Zoom eases in ratio, so the glide feels even at every scale.
        view.zoom = from.zoom * (HOME_VIEW.zoom / from.zoom) ** e;
        view.x = from.x + (HOME_VIEW.x - from.x) * e;
        view.y = from.y + (HOME_VIEW.y - from.y) * e;
        this.session.setView(view, t >= 1);
      },
      { key: 'canvas-home' },
    );
  }
}
