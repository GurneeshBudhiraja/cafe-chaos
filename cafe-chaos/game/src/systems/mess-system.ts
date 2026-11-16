/**
 * MessSystem: the dirty tables.
 *
 * When the last guest at a table leaves, having eaten there, the table is
 * dirty: a used plate, a tipped cup and crumbs (the `table-mess` model) on
 * its top, and none of its seats can be sat on until it is cleaned. A
 * table where nobody was served (a guest stormed off) stays clean. The
 * staff clean it (BaristaSystem: a barista with nothing to serve, or the
 * janitor): `clean` takes the mess away.
 *
 * No sign floats over a dirty table (the owner: keep the café uncluttered):
 * the mess itself, sized to its table, says so, and while a guest is
 * carried a dirty table's seats glow amber, which is when it matters.
 * `coming` (which dirty tables someone is on the way to) is for the staff.
 *
 * Only in the game (`enabled`): the checks and recordings that run without
 * it keep the tables as they were. Nothing here is saved: a level carried
 * on later starts with an empty, clean café.
 */

import { createSystem, Vector3, type Object3D } from '@iwsdk/core';
import { CLEAN, MESS } from '../game/rules.js';
import { CafeSystem, copyModel } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';

interface Mess {
  table: number;
  model: Object3D | null;
  /** Seconds since it got dirty (the café's clock). */
  since: number;
  /** Shrinking away once cleaned (0 to 1); -1 while dirty. */
  gone: number;
}

export class MessSystem extends createSystem({}) {
  /** True in the game: tables get dirty. */
  enabled = false;
  /** Tables dirtied and cleaned (for the checks and the sound). */
  dirtied = 0;
  cleaned = 0;
  /** The dirty tables someone is on the way to clean, or cleaning (the staff set it each frame). */
  readonly coming = new Set<number>();
  private readonly messes = new Map<number, Mess>();
  /** Which tables had someone seated at them last frame, and which of those had a guest served there. */
  private readonly hadGuests = new Set<number>();
  private readonly ate = new Set<number>();
  private readonly seatedNow = new Set<number>();
  private cafe!: CafeSystem;
  private guests!: GuestSystem;
  private clock = 0;
  private placement = -1;
  private readonly at = new Vector3();

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.guests = this.world.getSystem(GuestSystem)!;
  }

  update(frameDelta: number): void {
    const cafe = this.cafe;
    const delta = Math.min(1, frameDelta) * cafe.timeScale;
    this.clock += delta;
    if (cafe.placed && cafe.placements !== this.placement) {
      this.placement = cafe.placements;
      this.clear();
    }
    for (const [table, mess] of this.messes) {
      // The model loads in the background: a table dirtied before it was in gets its mess now.
      if (!mess.model && mess.gone < 0) mess.model = this.makeMess(table);
      if (mess.gone < 0) continue;
      // Cleaned: the mess shrinks away.
      mess.gone = Math.min(1, mess.gone + frameDelta / CLEAN.vanish);
      mess.model?.scale.setScalar(Math.max(0.001, 1 - mess.gone) * this.scaleFor(table));
      if (mess.gone >= 1) {
        mess.model?.removeFromParent();
        this.messes.delete(table);
      }
    }
    if (!this.enabled) return;
    // A table whose last guest has left, having been served there, is dirty.
    const seated = this.seatedNow;
    seated.clear();
    for (const guest of this.guests.guests) {
      if (guest.state !== 'seated' || !guest.seat) continue;
      seated.add(guest.seat.table);
      if (guest.served) this.ate.add(guest.seat.table);
    }
    for (const table of this.hadGuests) {
      if (seated.has(table)) continue;
      if (this.ate.has(table)) this.soil(table);
      this.ate.delete(table);
    }
    this.hadGuests.clear();
    for (const table of seated) this.hadGuests.add(table);
  }

  /** Is this table dirty (waiting to be cleaned)? */
  isDirty(table: number): boolean {
    const mess = this.messes.get(table);
    return !!mess && mess.gone < 0;
  }

  /** How many tables are dirty now (no list made). */
  get dirtyCount(): number {
    let n = 0;
    for (const mess of this.messes.values()) if (mess.gone < 0) n++;
    return n;
  }

  /** The dirty tables, the longest dirty first. */
  dirtyTables(): number[] {
    return [...this.messes.values()].filter((m) => m.gone < 0).sort((a, b) => a.since - b.since).map((m) => m.table);
  }

  /** The table is dirty: the mess appears and its seats are closed. */
  soil(table: number): void {
    if (this.isDirty(table)) return;
    const old = this.messes.get(table);
    if (old) {
      old.model?.removeFromParent();
      this.messes.delete(table);
    }
    const model = this.makeMess(table);
    this.messes.set(table, { table, model, since: this.clock, gone: -1 });
    for (const seat of this.guests.seats) if (seat.table === table) seat.dirty = true;
    this.dirtied++;
  }

  /** Cleaned: the mess shrinks away and the seats are open again. */
  clean(table: number): void {
    const mess = this.messes.get(table);
    if (!mess || mess.gone >= 0) return;
    mess.gone = 0;
    for (const seat of this.guests.seats) if (seat.table === table) seat.dirty = false;
    this.cleaned++;
  }

  /** Every table clean at once (the café put down afresh, a new run). */
  clear(): void {
    for (const mess of this.messes.values()) mess.model?.removeFromParent();
    this.messes.clear();
    this.hadGuests.clear();
    this.ate.clear();
    for (const seat of this.guests.seats) seat.dirty = false;
  }

  /**
   * The mess model on the table's top: its `TableTop` anchor, else (the
   * quiet corner's side table) its meal spot, in the café. Null if the
   * model is not loaded yet (it is made once it is).
   */
  private makeMess(table: number): Object3D | null {
    let model: Object3D;
    try {
      model = copyModel('table-mess');
    } catch {
      return null;
    }
    const cafe = this.cafe.cafe;
    const piece = this.cafe.pieces[table];
    const anchor = piece?.getObjectByName('TableTop') ?? piece?.getObjectByName('Meal-1');
    if (anchor) cafe.worldToLocal(anchor.getWorldPosition(this.at));
    else if (!this.cafe.tableTop(table, this.at)) return null;
    model.position.copy(this.at);
    model.rotation.y = (piece?.rotation.y ?? 0) + (Math.random() - 0.5) * 0.6;
    model.scale.setScalar(this.scaleFor(table));
    model.userData.dynamic = true;
    model.traverse((node) => {
      const mesh = node as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean };
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    cafe.add(model);
    return model;
  }

  /** The mess's size on this table: at most MESS.fit of its top's shorter side, never larger than made. */
  private scaleFor(table: number): number {
    const top = MESS.tops[this.cafe.pieces[table]?.name ?? ''] ?? MESS.tops['table-2'];
    return Math.min(1, (MESS.fit * top) / MESS.size);
  }
}
