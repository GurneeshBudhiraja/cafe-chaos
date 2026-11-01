/**
 * The lasso: select strokes by drawing a loop around them, then move them.
 *
 * - Drawing: the loop follows the nib as a thin clay line.
 * - On lift: strokes with at least half their points inside the loop are
 *   selected, and a soft clay box surrounds them (the loop disappears).
 * - Touching inside the box and dragging moves the selection; on lift the
 *   moved strokes go to the note as one undoable edit (InkSystem).
 * - Touching outside the box starts a new loop (and drops the selection).
 *
 * This class keeps the selection and draws the loop and box; InkSystem
 * feeds it page points and hands its results to the note. Points are page
 * coordinates (0..1 across, 0..1 down); meshes are tablet-local metres.
 */

import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from '@iwsdk/core';
import { createStroke, type Page, type Stroke } from '../notes/note-model.js';
import { THEME } from '../ui/theme.js';
import { StrokeMesh, type SurfaceSize } from './stroke-mesh.js';
import { strokeInsideLoop, strokesBounds, type Bounds } from './stroke-hit.js';
import { classifySample } from './stroke-sampling.js';

/** The loop's line width, and the space between the selected ink and its box (metres, the same on any surface). */
const LOOP_WIDTH_M = 0.0008;
const BOX_PADDING_M = 0.0043;
/** The box's outline width (metres) and fill opacity. */
const BOX_LINE_M = 0.0012;
const BOX_FILL_OPACITY = 0.07;
const BOX_LINE_OPACITY = 0.85;

export class LassoSelection {
  /** Ids of the selected strokes. */
  readonly ids = new Set<string>();
  private loop: StrokeMesh | null = null;
  /** The selected ink's bounds (page units), before any move in progress. */
  private bounds: Bounds | null = null;
  private readonly box: SelectionBox;
  /** A move in progress: where it started (page point) and how far it has gone (page units). */
  private move: { fromX: number; fromY: number; dx: number; dy: number } | null = null;

  constructor(
    private readonly layer: Object3D,
    private readonly surface: SurfaceSize,
  ) {
    this.box = new SelectionBox(layer);
  }

  get hasSelection(): boolean {
    return this.ids.size > 0;
  }

  // ------------------------------------------------------------ the loop

  /** Start a new loop at (x, y), dropping any selection. */
  startLoop(x: number, y: number, meshes: Map<string, StrokeMesh>): void {
    this.clear(meshes);
    const stroke = createStroke(THEME.clay, LOOP_WIDTH_M / this.surface.widthM);
    stroke.points.push(x, y);
    this.loop = new StrokeMesh(stroke, this.surface);
    this.loop.mesh.renderOrder = 3; // Over the ink.
    this.layer.add(this.loop.mesh);
  }

  extendLoop(x: number, y: number): void {
    if (!this.loop) return;
    const points = this.loop.stroke.points;
    // Like ink: skip samples too close to the last one (a resting hand's jitter).
    if (classifySample(points[points.length - 2], points[points.length - 1], x, y) === 'skip') return;
    points.push(x, y);
    this.loop.appendLatestPoint();
  }

  /** Close the loop: select the strokes inside it. Returns how many were selected. */
  finishLoop(page: Page): number {
    const loop = this.loop;
    if (!loop) return 0;
    this.loop = null;
    loop.mesh.removeFromParent();
    loop.dispose();
    for (const stroke of page.strokes) {
      if (strokeInsideLoop(stroke, loop.stroke.points)) this.ids.add(stroke.id);
    }
    this.refresh(page);
    return this.ids.size;
  }

  // ------------------------------------------------------------ moving

  /** Whether page point (x, y) is inside the selection's box: a touch there moves it. */
  contains(x: number, y: number): boolean {
    const b = this.bounds;
    if (!b) return false;
    const padX = BOX_PADDING_M / this.surface.widthM;
    const padY = BOX_PADDING_M / this.surface.heightM;
    return x >= b.minX - padX && x <= b.maxX + padX && y >= b.minY - padY && y <= b.maxY + padY;
  }

  startMove(x: number, y: number): void {
    this.move = { fromX: x, fromY: y, dx: 0, dy: 0 };
  }

  /** Drag the selection so it follows the touch, kept on the page. */
  moveTo(x: number, y: number, meshes: Map<string, StrokeMesh>): void {
    const move = this.move;
    const b = this.bounds;
    if (!move || !b) return;
    move.dx = clamp(x - move.fromX, -b.minX, 1 - b.maxX);
    move.dy = clamp(y - move.fromY, -b.minY, 1 - b.maxY);
    const offsetX = move.dx * this.surface.widthM;
    const offsetY = -move.dy * this.surface.heightM;
    for (const id of this.ids) meshes.get(id)?.mesh.position.set(offsetX, offsetY, 0);
    this.box.place(b, this.surface, offsetX, offsetY);
  }

  /** End the move: the moved copies of the selected strokes (null when it did not move). */
  finishMove(page: Page): Stroke[] | null {
    const move = this.move;
    this.move = null;
    if (!move || (move.dx === 0 && move.dy === 0)) return null;
    // New stroke objects (same ids): the note keeps the old ones for undo.
    return page.strokes
      .filter((stroke) => this.ids.has(stroke.id))
      .map((stroke) => ({
        ...stroke,
        points: stroke.points.map((value, i) => value + (i % 2 === 0 ? move.dx : move.dy)),
      }));
  }

  // ------------------------------------------------------- the selection

  /** After the page changed (a move, undo, erase): keep what is still there and redraw the box. */
  refresh(page: Page): void {
    const onPage = new Set(page.strokes.map((stroke) => stroke.id));
    for (const id of [...this.ids]) if (!onPage.has(id)) this.ids.delete(id);
    const aspect = this.surface.widthM / this.surface.heightM;
    this.bounds = strokesBounds(page.strokes.filter((stroke) => this.ids.has(stroke.id)), aspect);
    if (this.bounds) this.box.place(this.bounds, this.surface, 0, 0);
    else this.box.hide();
  }

  /** Drop the selection (and any loop or move in progress), putting moved meshes back. */
  clear(meshes: Map<string, StrokeMesh>): void {
    for (const id of this.ids) meshes.get(id)?.mesh.position.set(0, 0, 0);
    this.ids.clear();
    this.bounds = null;
    this.move = null;
    if (this.loop) {
      this.loop.mesh.removeFromParent();
      this.loop.dispose();
      this.loop = null;
    }
    this.box.hide();
  }

  dispose(meshes: Map<string, StrokeMesh>): void {
    this.clear(meshes);
    this.box.dispose();
  }
}

/** A soft clay box with a thin outline, around the selected ink. */
class SelectionBox {
  private readonly group = new Group();
  private readonly fill: Mesh;
  /** Top, bottom, left, right edges: thin planes, so the line reads at any distance. */
  private readonly edges: Mesh[];
  private readonly fillMaterial = new MeshBasicMaterial({
    color: THEME.clay,
    transparent: true,
    opacity: BOX_FILL_OPACITY,
    depthWrite: false,
  });
  private readonly lineMaterial = new MeshBasicMaterial({
    color: THEME.clay,
    transparent: true,
    opacity: BOX_LINE_OPACITY,
    depthWrite: false,
  });
  private readonly unitPlane = new PlaneGeometry(1, 1);

  constructor(parent: Object3D) {
    this.group.name = 'SelectionBox';
    this.group.visible = false;
    this.fill = new Mesh(this.unitPlane, this.fillMaterial);
    // Drawn on the page, the box must not catch pointer rays meant for the page.
    this.fill.raycast = () => {};
    this.fill.renderOrder = 0; // Under the ink.
    this.group.add(this.fill);
    this.edges = [0, 1, 2, 3].map(() => {
      const edge = new Mesh(this.unitPlane, this.lineMaterial);
      edge.renderOrder = 3;
      edge.raycast = () => {};
      this.group.add(edge);
      return edge;
    });
    parent.add(this.group);
  }

  /** Around page-unit `bounds` (padded), shifted by (offsetX, offsetY) metres. */
  place(bounds: Bounds, surface: SurfaceSize, offsetX: number, offsetY: number): void {
    const left = (bounds.minX - 0.5) * surface.widthM - BOX_PADDING_M;
    const right = (bounds.maxX - 0.5) * surface.widthM + BOX_PADDING_M;
    const top = (0.5 - bounds.minY) * surface.heightM + BOX_PADDING_M;
    const bottom = (0.5 - bounds.maxY) * surface.heightM - BOX_PADDING_M;
    const width = right - left;
    const height = top - bottom;
    this.group.position.set(offsetX + (left + right) / 2, offsetY + (top + bottom) / 2, 0);
    this.fill.scale.set(width, height, 1);
    const [topEdge, bottomEdge, leftEdge, rightEdge] = this.edges;
    topEdge.position.set(0, height / 2, 0);
    topEdge.scale.set(width, BOX_LINE_M, 1);
    bottomEdge.position.set(0, -height / 2, 0);
    bottomEdge.scale.set(width, BOX_LINE_M, 1);
    leftEdge.position.set(-width / 2, 0, 0);
    leftEdge.scale.set(BOX_LINE_M, height, 1);
    rightEdge.position.set(width / 2, 0, 0);
    rightEdge.scale.set(BOX_LINE_M, height, 1);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.unitPlane.dispose();
    this.fillMaterial.dispose();
    this.lineMaterial.dispose();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
