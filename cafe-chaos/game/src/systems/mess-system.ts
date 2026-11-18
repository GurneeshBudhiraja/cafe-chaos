/**
 * MessSystem: the dirty places.
 *
 * Each guest who leaves a seat, having been served there, leaves its own
 * place dirty: a used plate, a tipped cup and crumbs (the `table-mess`
 * model, sized to one place) on that seat's spot on the table, and that
 * seat cannot be sat on until it is cleaned. The table's other seats stay
 * open: a guest who leaves early does not leave a clean-looking seat
 * behind, and a dirty seat beside guests still eating shows as one (the
 * owner, after the first playtest). A guest who stormed off without being
 * served leaves no mess.
 *
 * The staff clean a table at a time (BaristaSystem: a barista with
 * nothing to serve, or the janitor): one stop wipes every dirty place on
 * it (`clean`), whoever is still sitting there. So the staff's side reads
 * in tables (`isDirty`, `dirtyTables`, `dirtyCount`, `coming`), the
 * guests' side in seats (each seat's `dirty`).
 *
 * No sign floats over a dirty place (the owner: keep the café uncluttered):
 * the mess itself says so, and while a guest is carried over a dirty seat
 * it glows amber and a tag says why it will not sit there.
 *
 * Only in the game (`enabled`): the checks and recordings that run without
 * it keep the tables as they were. Nothing here is saved: a level carried
 * on later starts with an empty, clean café.
 */

import { createSystem, Vector3, type Material, type Mesh, type Object3D } from '@iwsdk/core';
import { laidOn } from '../lib/decal.js';
import { CLEAN, MESS } from '../game/rules.js';
import type { Seat } from '../guests/seats.js';
import { CafeSystem, copyModel } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';

/** How far a mess is lifted off its table top (metres, café space): its lowest crumbs sit just under its origin. */
const MESS_LIFT = 0.0015;

interface Mess {
  seat: Seat;
  model: Object3D | null;
  /** Seconds since it got dirty (the café's clock). */
  since: number;
  /** Shrinking away once cleaned (0 to 1); -1 while dirty. */
  gone: number;
}

export class MessSystem extends createSystem({}) {
  /** True in the game: places get dirty. */
  enabled = false;
  /** Places dirtied, and tables cleaned (for the checks and the sound). */
  dirtied = 0;
  cleaned = 0;
  /** The dirty tables someone is on the way to clean, or cleaning (the staff set it each frame). */
  readonly coming = new Set<number>();
  /** The messes, by seat index. */
  private readonly messes = new Map<number, Mess>();
  /** The seats someone sat at last frame (by seat index), and those whose guest was served there. */
  private readonly hadGuests = new Set<number>();
  private readonly ate = new Set<number>();
  private readonly seatedNow = new Set<number>();
  private cafe!: CafeSystem;
  private guests!: GuestSystem;
  private clock = 0;
  private placement = -1;
  private rooms = 0;
  private readonly at = new Vector3();

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.guests = this.world.getSystem(GuestSystem)!;
  }

  update(frameDelta: number): void {
    const cafe = this.cafe;
    const delta = Math.min(1, frameDelta) * cafe.timeScale;
    this.clock += delta;
    if ((cafe.placed && cafe.placements !== this.placement) || cafe.rooms !== this.rooms) {
      this.placement = cafe.placements;
      this.rooms = cafe.rooms;
      this.clear();
    }
    for (const [index, mess] of this.messes) {
      // The model loads in the background: a place dirtied before it was in gets its mess now.
      if (!mess.model && mess.gone < 0) mess.model = this.makeMess(mess.seat);
      if (mess.gone < 0) continue;
      // Cleaned: the mess shrinks away.
      mess.gone = Math.min(1, mess.gone + frameDelta / CLEAN.vanish);
      mess.model?.scale.setScalar(Math.max(0.001, 1 - mess.gone) * this.scaleFor(mess.seat));
      if (mess.gone >= 1) {
        mess.model?.removeFromParent();
        this.messes.delete(index);
      }
    }
    if (!this.enabled) return;
    // A seat whose guest has gone (left, or been lifted away), having been served there, is dirty.
    const seated = this.seatedNow;
    seated.clear();
    for (const guest of this.guests.guests) {
      if (guest.state !== 'seated' || !guest.seat) continue;
      seated.add(guest.seat.index);
      if (guest.served) this.ate.add(guest.seat.index);
    }
    for (const index of this.hadGuests) {
      if (seated.has(index)) continue;
      const seat = this.guests.seats[index];
      // A coffee taken away leaves no table to clean.
      if (seat && !seat.takeaway && this.ate.has(index)) this.soilSeat(seat);
      this.ate.delete(index);
    }
    this.hadGuests.clear();
    for (const index of seated) this.hadGuests.add(index);
  }

  /** Is any place at this table dirty (waiting to be cleaned)? */
  isDirty(table: number): boolean {
    for (const mess of this.messes.values()) if (mess.gone < 0 && mess.seat.table === table) return true;
    return false;
  }

  /** How many tables have a dirty place now. */
  get dirtyCount(): number {
    const tables = new Set<number>();
    for (const mess of this.messes.values()) if (mess.gone < 0) tables.add(mess.seat.table);
    return tables.size;
  }

  /** The tables with a dirty place, the one dirty longest first. */
  dirtyTables(): number[] {
    const oldest = new Map<number, number>();
    for (const mess of this.messes.values()) {
      if (mess.gone >= 0) continue;
      const t = mess.seat.table;
      oldest.set(t, Math.min(oldest.get(t) ?? Infinity, mess.since));
    }
    return [...oldest.entries()].sort((a, b) => a[1] - b[1]).map(([t]) => t);
  }

  /** This place is dirty: its mess appears and the seat is closed. */
  soilSeat(seat: Seat): void {
    const old = this.messes.get(seat.index);
    if (old && old.gone < 0) return;
    old?.model?.removeFromParent();
    this.messes.set(seat.index, { seat, model: this.makeMess(seat), since: this.clock, gone: -1 });
    seat.dirty = true;
    this.dirtied++;
  }

  /** The mess's own copy of a material, counted nearer than the table under it (one copy each, shared by all messes). */
  private laid(material: Material): Material {
    let copy = this.laidCopies.get(material);
    if (!copy) this.laidCopies.set(material, (copy = laidOn(material.clone())));
    return copy;
  }
  private readonly laidCopies = new Map<Material, Material>();

  /** Every place at the table dirty (the checks and recordings: a table left by a full party). */
  soil(table: number): void {
    for (const seat of this.guests.seats) if (seat.table === table) this.soilSeat(seat);
  }

  /** Cleaned, in one stop: every dirty place at the table shrinks away and its seat is open again. */
  clean(table: number): void {
    let any = false;
    for (const mess of this.messes.values()) {
      if (mess.gone >= 0 || mess.seat.table !== table) continue;
      mess.gone = 0;
      mess.seat.dirty = false;
      any = true;
    }
    if (any) this.cleaned++;
  }

  /** Everything clean at once (the café put down afresh, a new run). */
  clear(): void {
    for (const mess of this.messes.values()) mess.model?.removeFromParent();
    this.messes.clear();
    this.hadGuests.clear();
    this.ate.clear();
    for (const seat of this.guests.seats) seat.dirty = false;
  }

  /**
   * The mess model at the seat's place on the table: its meal spot (where
   * its order was set down), else the table's top, in the café. Null if the
   * model is not loaded yet (it is made once it is).
   */
  private makeMess(seat: Seat): Object3D | null {
    let model: Object3D;
    try {
      model = copyModel('table-mess');
    } catch {
      return null;
    }
    const cafe = this.cafe.cafe;
    const piece = this.cafe.pieces[seat.table];
    if (seat.meal) this.at.copy(seat.meal);
    else {
      const anchor = piece?.getObjectByName('TableTop') ?? piece?.getObjectByName('Meal-1');
      if (anchor) cafe.worldToLocal(anchor.getWorldPosition(this.at));
      else if (!this.cafe.tableTop(seat.table, this.at)) return null;
    }
    // Resting on the top, not sunk into it (the model's lowest crumbs are half a millimetre under its origin), its
    // materials counted nearer: it never flickers against the table (lib/decal.ts).
    model.position.copy(this.at);
    model.position.y += MESS_LIFT;
    model.rotation.y = (piece?.rotation.y ?? 0) + (Math.random() - 0.5) * 0.6;
    model.scale.setScalar(this.scaleFor(seat));
    model.userData.dynamic = true;
    model.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (!Array.isArray(mesh.material)) mesh.material = this.laid(mesh.material);
    });
    cafe.add(model);
    return model;
  }

  /**
   * One place's mess: at most MESS.fit of its table top's shorter side,
   * times MESS.place where the table has more than one seat (each place
   * gets its share, so a table left by four never looks crowded).
   */
  private scaleFor(seat: Seat): number {
    const top = MESS.tops[this.cafe.pieces[seat.table]?.name ?? ''] ?? MESS.tops['table-2'];
    const shared = this.guests.seats.some((s) => s !== seat && s.table === seat.table);
    return Math.min(1, (MESS.fit * top * (shared ? MESS.place : 1)) / MESS.size);
  }
}
