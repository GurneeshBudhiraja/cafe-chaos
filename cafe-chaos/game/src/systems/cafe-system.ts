/**
 * CafeSystem: builds the café from its models the moment the game starts
 * (the garden café shell, the ten tables
 * of the opening layout, the bar and the quiet corner) and
 * puts it on the player's real table.
 *
 * Placement: when the XR session begins, the nearest detected flat
 * surface in front of the player that is not the floor (a table, desk,
 * counter, couch seat: WebXR plane detection, the surfaces from the
 * headset's Space Setup) is used, with the café's centre about 35 cm
 * out so it is looked down on and the back row stays within seated
 * reach. With no such surface within two seconds, the café floats
 * ahead and below the eyes instead. It
 * turns to face the player and pops up out of the table with a short
 * ease. Outside XR (the desktop preview) it simply stands in front of the
 * camera. From then on the player can pinch it to move, resize and turn
 * it (HoldSystem); once they have, it is not placed again that session.
 *
 * The whole café hangs from one parent, so scaling it up (CAFE_SCALE)
 * keeps the shell, tables and anchors in proportion.
 *
 * The left side: the shell's left wall comes in two versions, closed and
 * with an exit (under the 出口 sign); the exit is shown, and it is the
 * guests' one way out. `openAnnex()` extends the café to the left without
 * rebuilding anything else, and it reads as the same café grown wider,
 * not a second room: the left wall goes altogether, the new floor (the
 * annex model: floor, outer walls, roof and garden) rises out of the
 * plate with four more tables set out in line with the room's own two
 * rows, and the exit moves to the new outer wall, so there is still just
 * one way out. The left garden strip the new floor covers is hidden. Once
 * it is up the navigation grid is read again and `furniture` goes up by
 * one, which tells the guests and servers to take in the new seats and
 * tables.
 */

import { AssetManager, Box3, createSystem, Euler, Group, Mesh, Quaternion, Vector3, XRPlane as DetectedPlane, type Object3D } from '@iwsdk/core';
import type { ModelName } from '../assets.js';
import { DRESSING, FLOOR_TOP_M, OPENING_LAYOUT, type Placement } from '../cafe/layout.js';
import { dressGreyBox } from '../cafe/materials.js';
import { copyPart, splitOff, type Box } from '../cafe/split-mesh.js';
import { ANNEX_LANTERNS_X, LANTERN_BOX } from '../light/mood.js';
import { batchStatic, type BatchReport } from '../cafe/static-batch.js';
import { distanceToEdge, findSurfaceSpot, fitOnSurface, type DetectedSurface, type Fit, type Footprint } from '../lib/desk-placement.js';
import { CAFE_NAV } from '../nav/cafe-nav.js';
import { NavGrid } from '../nav/nav-grid.js';

/**
 * The tables on the new floor: the room's own columns (13 cm apart)
 * carried on to the left, in its two rows (four-seaters at the back,
 * two-seaters at the front), so the café simply has more tables.
 */
const ANNEX_TABLES: { model: ModelName; x: number; z: number }[] = [
  { model: 'table-4', x: -0.39, z: -0.135 },
  { model: 'table-4', x: -0.52, z: -0.135 },
  { model: 'table-2', x: -0.39, z: 0.025 },
  { model: 'table-2', x: -0.52, z: 0.025 },
];
/** How long the annex takes to rise out of the plate (seconds). */
const ANNEX_RISE_SECONDS = 0.9;
/** The annex's outer edge (café space, metres): the café reaches this far to the left once it is open. */
export const ANNEX_MIN_X = -0.68;
/** The old room's front-left corner post and the beam over it, split out of the shell's timberwork so they can go when the annex opens. */
const JOIN_TIMBER = 'TimberWork-Join';
/** Where they are (café space): x round the left wall, in front of the back corner post, below the roof's ridge. */
const JOIN_BOX: Box = { min: [-0.375, -0.01, -0.235], max: [-0.3, 0.215, 0.23] };

/**
 * The café's size: 1 is the modelled size (a 92 x 62 cm garden base, a
 * 70 x 46 cm café room). The models' notes allow up to about 1.2 before the
 * back row leaves comfortable seated reach.
 */
export const CAFE_SCALE = 1.0;
/** Give plane detection this long to find a surface before floating the café... */
const DESK_WAIT_MS = 2000;
/** ...and keep looking this long after floating: a surface found late still gets the café. */
const DESK_RETRY_MS = 30000;
/**
 * With no table: this far ahead of the eyes and this far below them, so
 * the café sits well under the gaze and is looked down on, not met at eye
 * level (the player can then pinch it to wherever suits; see HoldSystem).
 */
const FLOAT_AHEAD_M = 0.8;
const FLOAT_BELOW_M = 0.5;
/** The pop-up when the café is placed (seconds). */
const ARRIVE_SECONDS = 0.7;
/** Where the café stands for the desktop preview (world, metres). */
const PREVIEW_SPOT = new Vector3(0, 0.78, 0);

export class CafeSystem extends createSystem({
  planes: { required: [DetectedPlane] },
}) {
  /** The parent of everything: placed, turned and scaled as one. */
  readonly cafe = new Group();
  /** Each model placed from the layout, in layout order. */
  readonly pieces: Object3D[] = [];
  /** Every seat anchor in the café (`Seat-N` nodes), for the game to come. */
  readonly seats: Object3D[] = [];
  /** The navigation grid, read from the café's geometry (see nav/nav-grid.ts). Call `nav.rebuild()` after changing the furniture. */
  nav!: NavGrid;
  /** What the static batch folded together (see cafe/static-batch.ts). */
  batch: BatchReport = { merged: 0, batches: 0 };
  placed = false;
  onDesk = false;
  /** Set once the player has moved the café themselves: it is theirs to place from then on. */
  movedByHand = false;
  /**
   * The game clock's pace: 1 is real time. The recording scripts slow it to
   * match a video captured slowly and sped up, so arrivals and timers play
   * back at their true pace. Everything timed in the game reads it.
   */
  timeScale = 1;
  /** Counts the times the café has been put down; other systems start over when it changes. */
  placements = 0;
  /** Goes up by one whenever furniture is added (the annex): guests and servers then take in the new seats and tables. */
  furniture = 0;
  /** The annex: null until opened; `rising` from 0 to 1 while it comes up. */
  annex: { root: Group; rising: number } | null = null;
  /** The tables the extension brought. */
  readonly annexTables: { model: ModelName; piece: Object3D }[] = [];
  private arrival = -1;
  private sessionWas = false;
  private sessionStartedAt = 0;
  private readonly head = new Vector3();
  private readonly spot = new Vector3();
  private readonly q = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly surfaces: Iterable<DetectedSurface> = { [Symbol.iterator]: () => this.surfaceList() };

  /** True during the pop-up, while the café's scale is animated. */
  get arriving(): boolean {
    return this.arrival >= 0;
  }

  init(): void {
    this.cafe.name = 'Cafe';
    for (const placement of OPENING_LAYOUT) this.cafe.add(this.build(placement));
    this.openExit();
    for (const dressing of DRESSING) this.dress(dressing.model, this.pieces[dressing.on], dressing.anchor);
    this.cafe.traverse((node) => {
      if (/^Seat-\d+$/.test(node.name)) this.seats.push(node);
    });
    // What the shell's own clip moves (the steam puffs) stays out of the batch.
    for (const clip of AssetManager.getGLTF('cafe-shell', { shared: true })?.animations ?? []) {
      for (const track of clip.tracks) {
        const node = this.cafe.getObjectByName(track.name.split('.')[0]);
        if (node) node.userData.dynamic = true;
      }
    }
    // The furniture stands still inside the café: draw it as one mesh per material.
    this.batch = batchStatic(this.cafe);
    // From the café as built, the map the characters find their way by.
    this.nav = new NavGrid(this.cafe, CAFE_NAV);
    this.world.createTransformEntity(this.cafe);
    this.showPreview();
    // The café's footprint at full size (it stands unturned at full size in the preview), for fitting it to a table.
    this.cafe.updateMatrixWorld(true);
    const box = new Box3();
    for (const piece of this.pieces) box.expandByObject(piece);
    this.footprint = { minX: box.min.x - this.cafe.position.x, maxX: box.max.x - this.cafe.position.x, minZ: box.min.z - this.cafe.position.z, maxZ: box.max.z - this.cafe.position.z };
  }

  update(delta: number): void {
    const presenting = this.world.renderer.xr.isPresenting;
    if (presenting && !this.sessionWas) {
      // A new session: place afresh, on the table the headset sees.
      this.placed = false;
      this.movedByHand = false;
      this.cafe.visible = false;
      this.sessionStartedAt = performance.now();
    }
    if (!presenting && this.sessionWas) this.showPreview();
    this.sessionWas = presenting;
    const waited = performance.now() - this.sessionStartedAt;
    if (presenting && !this.placed) this.place(waited > DESK_WAIT_MS);
    else if (presenting && !this.onDesk && !this.movedByHand && waited < DESK_RETRY_MS) this.place(false);
    this.arrive(delta * this.timeScale);
    this.raiseAnnex(delta);
  }

  /** True once the annex is fully open (risen, and the grid read again). */
  get annexOpen(): boolean {
    return !!this.annex && this.annex.rising >= 1;
  }

  /**
   * Grow the garden annex off the café's left side. Returns false if it is
   * already open or its models have not loaded yet.
   */
  openAnnex(): boolean {
    if (this.annex || !AssetManager.getGLTF('cafe-annex') || ANNEX_TABLES.some((t) => !AssetManager.getGLTF(t.model))) return false;
    const root = new Group();
    root.name = 'Annex';
    // The annex model lines up with the shell when it stands at the café's origin.
    const wing = copyModel('cafe-annex');
    root.add(wing);
    this.pieces.push(wing);
    for (const { model, x, z } of ANNEX_TABLES) {
      const piece = copyModel(model);
      piece.position.set(x, FLOOR_TOP_M, z);
      root.add(piece);
      this.pieces.push(piece);
      this.annexTables.push({ model, piece });
      piece.traverse((node) => {
        if (/^Seat-\d+$/.test(node.name)) this.seats.push(node);
      });
    }
    this.hangLanterns(root);
    this.cafe.add(root);
    // One mesh per material for the wing too.
    batchStatic(root);
    root.scale.set(1, 0.001, 1);
    this.annex = { root, rising: 0 };
    // One room: the left wall goes altogether (its exit with it), and the new floor covers the left garden strip.
    this.setShown('WallLeft-Closed', false);
    this.setShown('WallLeft-Open', false);
    this.setShown('GardenLeft', false);
    // The old room's front-left corner post and the beam over it would stand in the middle of the one room: they go too.
    this.setShown(JOIN_TIMBER, false);
    return true;
  }

  /**
   * The annex's paper lanterns: copies of the main room's middle lantern,
   * hung under the annex's eave at the same height (their lights are the
   * mood's: MoodSystem). Nothing if the shell has no lanterns.
   */
  private hangLanterns(root: Group): void {
    const papers = this.cafe.getObjectByName('LanternPapers');
    if (!(papers instanceof Mesh)) return;
    const lantern = copyPart(papers, this.cafe, LANTERN_BOX);
    if (!lantern) return;
    for (const [i, x] of ANNEX_LANTERNS_X.entries()) {
      const copy = new Mesh(lantern.clone().translate(x, 0, 0), papers.material);
      copy.name = `AnnexLantern-${i + 1}`;
      root.add(copy);
    }
  }

  /** The annex rises out of the plate with a small overshoot; once it is up, the grid is read again. */
  private raiseAnnex(delta: number): void {
    const annex = this.annex;
    if (!annex || annex.rising >= 1) return;
    annex.rising = Math.min(1, annex.rising + delta / ANNEX_RISE_SECONDS);
    const t = annex.rising;
    const c = 1.2;
    annex.root.scale.y = Math.max(0.001, 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2);
    if (t < 1) return;
    annex.root.scale.y = 1;
    this.cafe.updateMatrixWorld(true);
    this.nav.rebuild();
    this.furniture++;
  }

  /** Show the exit in the left wall (and not the closed wall). These parts stay out of the static batch, so they can be switched. */
  private openExit(): void {
    // The corner post and beam where the annex joins on are baked into the shell's timberwork: split them off so they can go.
    const timber = this.cafe.getObjectByName('TimberWork');
    if (timber instanceof Mesh) splitOff(timber, this.cafe, JOIN_BOX, JOIN_TIMBER);
    for (const name of ['WallLeft-Closed', 'WallLeft-Open', 'GardenLeft', JOIN_TIMBER]) {
      const node = this.cafe.getObjectByName(name);
      if (node) node.userData.keepApart = true;
    }
    this.setShown('WallLeft-Closed', false);
    this.setShown('WallLeft-Open', true);
  }

  private setShown(name: string, shown: boolean): void {
    const node = this.cafe.getObjectByName(name);
    if (node) node.visible = shown;
  }

  /** Place again, as at a session's start (for when the viewer has moved to a table). */
  replace(): void {
    this.placed = false;
    this.onDesk = false;
    this.movedByHand = false;
    this.cafe.visible = false;
    this.sessionStartedAt = performance.now();
  }

  // ------------------------------------------------------------ placement

  /** The café's footprint at full size (café space), and the size it lands at (fitted to the table). */
  private footprint: Footprint = { minX: -0.47, maxX: 0.47, minZ: -0.32, maxZ: 0.32 };
  targetScale = CAFE_SCALE;
  private readonly fit: Fit = { spot: new Vector3(), yaw: 0, scale: 1 };
  /** The real surface the café was last put on (null: it floats). */
  private readonly chosen: { surface: DetectedSurface | null } = { surface: null };
  private readonly edgeFrom = new Vector3();
  private readonly edgeDirection = new Vector3();

  /**
   * The real table's outline under the café, in the café's own space (x, z
   * on its floor), into `out`; false when the café floats, has been lifted
   * off its table, or the table has no outline. The light spill keeps to it.
   */
  tableOutline(out: { x: number; z: number }[]): boolean {
    out.length = 0;
    const surface = this.chosen.surface;
    if (!surface || !this.onDesk || !this.placed) return false;
    const polygon = surface.plane.polygon;
    if (!polygon || polygon.length < 3) return false;
    this.cafe.updateMatrixWorld(true);
    surface.object.updateWorldMatrix(true, false);
    // Lifted well off the table (carried in the hand), it is no longer on it.
    this.cafe.getWorldPosition(this.edgeFrom);
    if (Math.abs(this.edgeFrom.y - surface.object.getWorldPosition(this.spot).y) > 0.06) return false;
    for (const p of polygon) {
      surface.object.localToWorld(this.edgeDirection.set(p.x, 0, p.z));
      this.cafe.worldToLocal(this.edgeDirection);
      out.push({ x: this.edgeDirection.x, z: this.edgeDirection.z });
    }
    return true;
  }

  /**
   * How far the real table runs from a point of the café (`x`, `z`, café
   * space, on the table) toward the café's +X or -X: metres in the café's
   * space, to the table's real edge. 0 when the café is not on a detected
   * surface (it floats), or has been carried off it. Guests use it to walk
   * in from the edge of the player's own table.
   */
  tableRun(x: number, z: number, sign: 1 | -1): number {
    const surface = this.chosen.surface;
    if (!surface || !this.onDesk) return 0;
    this.cafe.updateMatrixWorld(true);
    this.cafe.localToWorld(this.edgeFrom.set(x, 0, z));
    this.cafe.localToWorld(this.edgeDirection.set(x + sign, 0, z)).sub(this.edgeFrom);
    // Lifted well off the table (carried in the hand), it is no longer on it.
    if (Math.abs(this.edgeFrom.y - surface.object.getWorldPosition(this.spot).y) > 0.06) return 0;
    return distanceToEdge(surface, this.edgeFrom, this.edgeDirection) / (this.cafe.scale.x || 1);
  }

  /** Find a surface in front of the player and put the café on it (or float it, once `giveUp`). */
  private place(giveUp: boolean): void {
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldQuaternion(this.q);
    const yaw = this.euler.setFromQuaternion(this.q, 'YXZ').y;
    this.onDesk = findSurfaceSpot(this.surfaces, this.head, yaw, this.spot, this.chosen);
    if (!this.onDesk && !giveUp) return;
    // On a table: squared to its near edge, as large as fits on it (up to full size), at a comfortable reach.
    const surface = this.chosen.surface;
    const fit = this.onDesk && surface ? fitOnSurface(surface, this.head, yaw, this.footprint, this.fit) : null;
    if (fit) {
      this.targetScale = fit.scale;
      this.settle(fit.spot, fit.yaw);
      return;
    }
    this.targetScale = CAFE_SCALE;
    if (!this.onDesk) this.spot.set(this.head.x - Math.sin(yaw) * FLOAT_AHEAD_M, this.head.y - FLOAT_BELOW_M, this.head.z - Math.cos(yaw) * FLOAT_AHEAD_M);
    this.settle(this.spot, Math.atan2(this.head.x - this.spot.x, this.head.z - this.spot.z));
  }

  /** Put the café at a world spot, its front (+Z) turned to `yaw`, and start the pop-up. */
  private settle(spot: Vector3, yaw: number): void {
    this.cafe.position.copy(spot);
    this.cafe.rotation.set(0, yaw, 0);
    this.cafe.scale.setScalar(0.001);
    this.cafe.visible = true;
    this.placed = true;
    this.placements++;
    this.arrival = 0;
  }

  /** The pop-up: a quick ease up to size with a small overshoot. */
  private arrive(delta: number): void {
    if (this.arrival < 0) return;
    this.arrival += delta;
    const t = Math.min(1, this.arrival / ARRIVE_SECONDS);
    const c = 1.4;
    const eased = 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
    this.cafe.scale.setScalar(Math.max(0.001, eased) * this.targetScale);
    if (t >= 1) {
      this.cafe.scale.setScalar(this.targetScale);
      this.arrival = -1;
    }
  }

  /** The desktop preview: the café in front of the camera, no pop-up. */
  private showPreview(): void {
    this.cafe.position.copy(PREVIEW_SPOT);
    this.cafe.rotation.set(0, 0, 0);
    this.cafe.scale.setScalar(CAFE_SCALE);
    this.cafe.visible = true;
    this.placed = false;
    this.onDesk = false;
    this.arrival = -1;
  }

  private *surfaceList(): Generator<DetectedSurface> {
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(DetectedPlane, '_plane') as XRPlane | undefined;
      if (plane && entity.object3D) yield { object: entity.object3D, plane };
    }
  }

  // --------------------------------------------------------------- models

  /** A fresh copy of a model, stood at its place in the layout. */
  private build(placement: Placement): Object3D {
    const object = copyModel(placement.model);
    object.position.set(placement.x, placement.y ?? FLOOR_TOP_M, placement.z);
    object.rotation.y = ((placement.yawDeg ?? 0) * Math.PI) / 180;
    this.pieces.push(object);
    return object;
  }

  /** Set a copy of `model` on the named anchor of a placed piece (the anchor carries the position and facing). */
  private dress(model: ModelName, piece: Object3D | undefined, anchor: string): void {
    const spot = piece?.getObjectByName(anchor);
    if (!spot) return;
    spot.add(copyModel(model));
  }
}

/** A fresh copy of a loaded model (the glTF's scene; its root node is named after the model). */
export function copyModel(model: ModelName): Object3D {
  const scene = AssetManager.getGLTF(model)?.scene;
  if (!scene) throw new Error(`[Cafe] Model ${model} is not loaded.`);
  const root = scene.getObjectByName(model) ?? scene;
  root.name = model;
  dressGreyBox(root);
  return root;
}
