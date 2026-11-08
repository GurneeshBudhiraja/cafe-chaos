/**
 * CafeSystem: builds the café from its models the moment the game starts
 * (the garden café shell, the waiting bench by the gate, and the ten
 * tables of the opening layout) and puts it on the player's real table.
 *
 * Placement: when the XR session begins, the nearest detected desk or
 * table in front of the player is used (WebXR plane detection, the
 * surfaces from the headset's Space Setup), with the café's centre about
 * 35 cm out so the back row stays within seated reach. With no such
 * surface within two seconds, the café floats at arm's reach instead. It
 * turns to face the player and pops up out of the table with a short
 * ease. Outside XR (the desktop preview) it simply stands in front of the
 * camera.
 *
 * The whole café hangs from one parent, so scaling it up (CAFE_SCALE)
 * keeps the shell, tables and anchors in proportion.
 */

import { AssetManager, createSystem, Euler, Group, Quaternion, Vector3, XRPlane as DetectedPlane, type Object3D } from '@iwsdk/core';
import type { ModelName } from '../assets.js';
import { FLOOR_TOP_M, OPENING_LAYOUT, type Placement } from '../cafe/layout.js';
import { findDeskSpot, type DetectedSurface } from '../lib/desk-placement.js';

/**
 * The café's size: 1 is the modelled size (a 92 x 62 cm garden base, a
 * 70 x 46 cm café room). The models' notes allow up to about 1.2 before the
 * back row leaves comfortable seated reach.
 */
export const CAFE_SCALE = 1.0;
/** Give plane detection this long to find a table before floating the café... */
const DESK_WAIT_MS = 2000;
/** ...and keep looking this long after floating: a table found late still gets the café. */
const DESK_RETRY_MS = 10000;
/** With no table: this far ahead of the eyes and this far below them. */
const FLOAT_AHEAD_M = 0.45;
const FLOAT_BELOW_M = 0.4;
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
  placed = false;
  onDesk = false;
  /**
   * The game clock's pace: 1 is real time. The recording scripts slow it to
   * match a video captured slowly and sped up, so arrivals and timers play
   * back at their true pace. Everything timed in the game reads it.
   */
  timeScale = 1;
  /** Counts the times the café has been put down; other systems start over when it changes. */
  placements = 0;
  private arriving = -1;
  private sessionWas = false;
  private sessionStartedAt = 0;
  private readonly head = new Vector3();
  private readonly spot = new Vector3();
  private readonly q = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly surfaces: Iterable<DetectedSurface> = { [Symbol.iterator]: () => this.surfaceList() };

  init(): void {
    this.cafe.name = 'Cafe';
    for (const placement of OPENING_LAYOUT) this.cafe.add(this.build(placement));
    this.cafe.traverse((node) => {
      if (/^Seat-\d+$/.test(node.name)) this.seats.push(node);
    });
    this.world.createTransformEntity(this.cafe);
    this.showPreview();
  }

  update(delta: number): void {
    const presenting = this.world.renderer.xr.isPresenting;
    if (presenting && !this.sessionWas) {
      // A new session: place afresh, on the table the headset sees.
      this.placed = false;
      this.cafe.visible = false;
      this.sessionStartedAt = performance.now();
    }
    if (!presenting && this.sessionWas) this.showPreview();
    this.sessionWas = presenting;
    const waited = performance.now() - this.sessionStartedAt;
    if (presenting && !this.placed) this.place(waited > DESK_WAIT_MS);
    else if (presenting && !this.onDesk && waited < DESK_RETRY_MS) this.place(false);
    this.arrive(delta * this.timeScale);
  }

  /** Place again, as at a session's start (for when the viewer has moved to a table). */
  replace(): void {
    this.placed = false;
    this.onDesk = false;
    this.cafe.visible = false;
    this.sessionStartedAt = performance.now();
  }

  // ------------------------------------------------------------ placement

  /** Find the table in front of the player and put the café on it (or float it, once `giveUp`). */
  private place(giveUp: boolean): void {
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldQuaternion(this.q);
    const yaw = this.euler.setFromQuaternion(this.q, 'YXZ').y;
    this.onDesk = findDeskSpot(this.surfaces, this.head, yaw, this.spot);
    if (!this.onDesk && !giveUp) return;
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
    this.arriving = 0;
  }

  /** The pop-up: a quick ease up to size with a small overshoot. */
  private arrive(delta: number): void {
    if (this.arriving < 0) return;
    this.arriving += delta;
    const t = Math.min(1, this.arriving / ARRIVE_SECONDS);
    const c = 1.4;
    const eased = 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
    this.cafe.scale.setScalar(Math.max(0.001, eased) * CAFE_SCALE);
    if (t >= 1) {
      this.cafe.scale.setScalar(CAFE_SCALE);
      this.arriving = -1;
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
    this.arriving = -1;
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
}

/** A fresh copy of a loaded model (the glTF's scene; its root node is named after the model). */
export function copyModel(model: ModelName): Object3D {
  const scene = AssetManager.getGLTF(model)?.scene;
  if (!scene) throw new Error(`[Cafe] Model ${model} is not loaded.`);
  const root = scene.getObjectByName(model) ?? scene;
  root.name = model;
  return root;
}
