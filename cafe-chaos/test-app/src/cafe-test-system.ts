/**
 * Grey-box test only (not the game): puts the sample café on the nearest
 * detected desk, seats three guests on the waiting bench, and lets a
 * tracked hand pinch a guest, carry them and drop them on a free seat.
 * It exists to check that the models' sizes work with hand tracking.
 *
 * - Pick up: a pinch closing within GRAB_M of a guest's `Grip` anchor.
 * - Carry: the guest hangs from the pinch; the nearest free seat within
 *   DROP_M lights up (`seat-glow`).
 * - Drop: opening the pinch over a lit seat sits the guest there (their
 *   `Seated` pose shows); anywhere else, they go back to the bench.
 */

import {
  AssetManager,
  createSystem,
  Euler,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  XRPlane as DetectedPlane,
} from '@iwsdk/core';
import { FLOOR_TOP_M, SAMPLE_LAYOUT } from './cafe-layout.js';
import { findDeskSpot, type DetectedSurface } from './lib/desk-placement.js';
import { HANDS, readPinchPoint, type Hand } from './lib/hand-pinch.js';

/** Thumb and index tips closer than this pinch; further than RELEASE let go (metres). */
const PINCH_M = 0.015;
const RELEASE_M = 0.03;
/** A pinch this close to a guest's grip picks them up; a seat this close (sideways) takes the drop. */
const GRAB_M = 0.03;
const DROP_M = 0.04;
/** With no desk: this far ahead of the eyes and this far below them. */
const FLOAT_AHEAD_M = 0.45;
const FLOAT_BELOW_M = 0.4;

interface Guest {
  root: Object3D;
  slot: Object3D;
  seat: Object3D | null;
}

export class CafeTestSystem extends createSystem({ planes: { required: [DetectedPlane] } }) {
  readonly cafe = new Object3D();
  readonly guests: Guest[] = [];
  readonly seats: Object3D[] = [];
  placed = false;
  onDesk = false;
  /** Each hand's pinch point and thumb-index gap this frame (for checks). */
  readonly pinch: Record<Hand, { point: Vector3; gap: number }> = {
    left: { point: new Vector3(), gap: Infinity },
    right: { point: new Vector3(), gap: Infinity },
  };
  private carried: { guest: Guest; hand: Hand; offset: Vector3 } | null = null;
  private glow!: Object3D;
  private target: Object3D | null = null;
  private readonly wasClosed: Record<Hand, boolean> = { left: false, right: false };
  private readonly scratch = new Vector3();
  private readonly v = new Vector3();
  private readonly head = new Vector3();
  private readonly spot = new Vector3();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private inXrSince = 0;
  private readonly surfaces: Iterable<DetectedSurface> = { [Symbol.iterator]: () => this.surfaceList() };

  init(): void {
    this.cafe.name = 'Cafe';
    this.world.createTransformEntity(this.cafe);
    for (const p of SAMPLE_LAYOUT) {
      const o = this.copy(p.model);
      o.position.set(p.x, p.y ?? FLOOR_TOP_M, p.z);
      o.rotation.y = ((p.yawDeg ?? 0) * Math.PI) / 180;
      this.cafe.add(o);
      o.traverse((c) => {
        if (/^Seat-\d+$/.test(c.name)) this.seats.push(c);
      });
    }
    // Three guests waiting on the bench (two adults and a kid).
    const bench = this.cafe.getObjectByName('waiting-bench')!;
    ['guest', 'guest', 'guest-kid'].forEach((model, i) => {
      const slot = bench.getObjectByName(`Slot-${i + 1}`)!;
      const root = this.copy(model);
      root.name = `Guest-${i + 1}`;
      const guest: Guest = { root, slot, seat: null };
      this.guests.push(guest);
      this.cafe.add(root);
      this.sitAt(guest, slot);
    });
    // A bubble over the first guest, as the game would show their demand.
    const bubble = this.copy('demand-bubble');
    this.guests[0].root.getObjectByName('BubbleAnchor')!.add(bubble);
    this.glow = this.copy('seat-glow');
    this.glow.visible = false;
    this.cafe.add(this.glow);
    this.cafe.visible = false;
    (window as unknown as { __cafe: unknown }).__cafe = { world: this.world, system: this };
  }

  update(): void {
    const presenting = this.world.renderer.xr.isPresenting;
    if (!presenting) return;
    if (!this.inXrSince) this.inXrSince = performance.now();
    if (!this.placed) this.place(performance.now() - this.inXrSince > 2000);
    if (!this.placed) return;
    for (const hand of HANDS) this.readHand(hand);
    if (this.carried) this.carry();
    else this.tryPickUp();
  }

  // ------------------------------------------------------------ placement

  private place(giveUp: boolean): void {
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldQuaternion(this.q);
    const yaw = this.euler.setFromQuaternion(this.q, 'YXZ').y;
    this.onDesk = findDeskSpot(this.surfaces, this.head, yaw, this.spot);
    if (!this.onDesk && !giveUp) return;
    if (!this.onDesk) {
      this.spot.set(this.head.x - Math.sin(yaw) * FLOAT_AHEAD_M, this.head.y - FLOAT_BELOW_M, this.head.z - Math.cos(yaw) * FLOAT_AHEAD_M);
    }
    this.cafe.position.copy(this.spot);
    // The café's front (+Z) toward the viewer.
    this.cafe.rotation.set(0, Math.atan2(this.head.x - this.spot.x, this.head.z - this.spot.z), 0);
    this.cafe.visible = true;
    this.placed = true;
  }

  private *surfaceList(): Generator<DetectedSurface> {
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(DetectedPlane, '_plane') as XRPlane | undefined;
      if (plane && entity.object3D) yield { object: entity.object3D, plane };
    }
  }

  // ----------------------------------------------------------- the hands

  private readHand(hand: Hand): void {
    const reading = this.pinch[hand];
    const source = this.world.input.xr.getPrimaryInputSource(hand);
    reading.gap = readPinchPoint(source, this.xrFrame, this.xrManager.getReferenceSpace(), this.player.matrixWorld, reading.point, this.scratch);
  }

  private tryPickUp(): void {
    for (const hand of HANDS) {
      const { point, gap } = this.pinch[hand];
      const closed = gap < PINCH_M;
      const justClosed = closed && !this.wasClosed[hand];
      this.wasClosed[hand] = closed;
      if (!justClosed) continue;
      for (const guest of this.guests) {
        const grip = guest.root.getObjectByName('Grip')!;
        grip.getWorldPosition(this.v);
        if (this.v.distanceTo(point) > GRAB_M) continue;
        // Keep the guest where they are relative to the pinch.
        const offset = guest.root.getWorldPosition(new Vector3()).sub(point);
        this.carried = { guest, hand, offset };
        guest.seat = null;
        this.setPose(guest, false);
        return;
      }
    }
  }

  private carry(): void {
    const { guest, hand, offset } = this.carried!;
    const { point, gap } = this.pinch[hand];
    if (gap > RELEASE_M) {
      this.drop(guest, hand);
      return;
    }
    // While the fingers are opening, the point between them jumps: hold the
    // guest (and the lit seat) still until they let go.
    if (gap >= PINCH_M) return;
    // Follow the pinch (in café space).
    this.v.copy(point).add(offset);
    this.cafe.worldToLocal(this.v);
    guest.root.position.copy(this.v);
    // The nearest free seat within reach of the drop, measured sideways in café space.
    this.target = null;
    let best = DROP_M;
    for (const seat of this.seats) {
      if (this.guests.some((g) => g.seat === seat)) continue;
      seat.getWorldPosition(this.scratch);
      this.cafe.worldToLocal(this.scratch);
      const d = Math.hypot(this.scratch.x - this.v.x, this.scratch.z - this.v.z);
      if (d < best) {
        best = d;
        this.target = seat;
      }
    }
    if (this.target) {
      this.target.getWorldPosition(this.scratch);
      this.cafe.worldToLocal(this.scratch);
      this.glow.position.copy(this.scratch).setY(this.scratch.y + 0.0002);
    }
    this.glow.visible = !!this.target;
  }

  /** Let go: onto the lit seat, or back to the bench. */
  private drop(guest: Guest, hand: Hand): void {
    this.wasClosed[hand] = false;
    if (this.target) {
      guest.seat = this.target;
      this.sitAt(guest, this.target, true);
    } else {
      this.sitAt(guest, guest.slot);
    }
    this.carried = null;
    this.target = null;
    this.glow.visible = false;
  }

  // --------------------------------------------------------------- models

  /** Put a guest on an anchor (a seat or a bench slot), facing the way it faces. */
  private sitAt(guest: Guest, anchor: Object3D, seated = false): void {
    anchor.updateWorldMatrix(true, false);
    this.cafe.updateWorldMatrix(true, false);
    this.m.copy(this.cafe.matrixWorld).invert().multiply(anchor.matrixWorld);
    this.m.decompose(guest.root.position, guest.root.quaternion, this.scratch);
    this.setPose(guest, seated);
  }

  private setPose(guest: Guest, seated: boolean): void {
    guest.root.getObjectByName('Standing')!.visible = !seated;
    guest.root.getObjectByName('Seated')!.visible = seated;
  }

  /** A fresh copy of a model (the cached glTF's scene, cloned). */
  private copy(model: string): Object3D {
    const scene = AssetManager.getGLTF(model)?.scene;
    if (!scene) throw new Error(`[CafeTest] Model ${model} is not loaded.`);
    const root = scene.getObjectByName(model) ?? scene;
    root.name = model;
    return root;
  }
}
