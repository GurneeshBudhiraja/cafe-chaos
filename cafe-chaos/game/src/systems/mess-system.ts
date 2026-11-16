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
 * So it reads from the seat (the mess alone is about 2.4 degrees across,
 * under Meta's 3; and never colour alone), a small paper sign floats over
 * a dirty table, turned to the player: a dish with a smudge while nobody
 * is coming, a broom once someone is on the way (`coming`, set by the
 * staff). The sign is 4.2 cm across, about 3 degrees at 0.8 m.
 *
 * Only in the game (`enabled`): the checks and recordings that run without
 * it keep the tables as they were. Nothing here is saved: a level carried
 * on later starts with an empty, clean café.
 */

import { CanvasTexture, createSystem, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, type Object3D } from '@iwsdk/core';
import { CLEAN } from '../game/rules.js';
import { CafeSystem, copyModel } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';

/** The sign over a dirty table: its size and height over the table's top (metres, café space). */
const SIGN = { size: 0.042, above: 0.045 };

interface Mess {
  table: number;
  model: Object3D | null;
  sign: Sprite;
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
  private readonly signs: { dirty: SpriteMaterial; coming: SpriteMaterial } | null = typeof document !== 'undefined' ? { dirty: signMaterial(false), coming: signMaterial(true) } : null;

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
      // Someone on the way: the broom; nobody yet: the dish.
      if (this.signs) mess.sign.material = this.coming.has(table) ? this.signs.coming : this.signs.dirty;
      if (mess.gone < 0) continue;
      // Cleaned: the mess and its sign shrink away.
      mess.gone = Math.min(1, mess.gone + frameDelta / CLEAN.vanish);
      const k = Math.max(0.001, 1 - mess.gone);
      mess.model?.scale.setScalar(k * this.scaleFor(table));
      mess.sign.scale.setScalar(k * SIGN.size);
      if (mess.gone >= 1) {
        mess.model?.removeFromParent();
        mess.sign.removeFromParent();
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

  /** The table is dirty: the mess and its sign appear and its seats are closed. */
  soil(table: number): void {
    if (this.isDirty(table)) return;
    const old = this.messes.get(table);
    if (old) {
      old.model?.removeFromParent();
      old.sign.removeFromParent();
      this.messes.delete(table);
    }
    const model = this.makeMess(table);
    const sign = new Sprite(this.signs?.dirty);
    sign.name = `MessSign-${table}`;
    sign.scale.setScalar(SIGN.size);
    sign.renderOrder = 29;
    sign.userData.dynamic = true;
    if (this.cafe.tableTop(table, this.at)) sign.position.set(this.at.x, this.at.y + SIGN.above, this.at.z);
    this.cafe.cafe.add(sign);
    this.messes.set(table, { table, model, sign, since: this.clock, gone: -1 });
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
    for (const mess of this.messes.values()) {
      mess.model?.removeFromParent();
      mess.sign.removeFromParent();
    }
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

  /** The mess is sized for the small tables; bigger on the four-seaters and the bar, smaller on the quiet corner's side table. */
  private scaleFor(table: number): number {
    const name = this.cafe.pieces[table]?.name ?? '';
    return name === 'table-4' || name === 'bar-2' ? CLEAN.bigMess : name === 'quiet-corner' ? CLEAN.smallMess : 1;
  }
}

/**
 * The sign's picture, drawn once: a paper disc with a timber rim and, on
 * it, a dish with a smudge (dirty) or a broom (someone is coming).
 */
function signMaterial(coming: boolean): SpriteMaterial {
  const px = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  const c = px / 2;
  ctx.beginPath();
  ctx.arc(c, c + 2, c - 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30, 20, 12, 0.3)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, c - 6, 0, Math.PI * 2);
  ctx.fillStyle = coming ? '#3d6136' : '#c98a1e';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, c - 13, 0, Math.PI * 2);
  ctx.fillStyle = '#f4ecdc';
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#4a2f1c';
  if (coming) {
    // A broom: the handle, the head, its bristles.
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(c + 22, c - 30);
    ctx.lineTo(c - 6, c + 10);
    ctx.stroke();
    ctx.fillStyle = '#c98a1e';
    ctx.beginPath();
    ctx.moveTo(c - 18, c + 2);
    ctx.lineTo(c + 4, c + 16);
    ctx.lineTo(c - 6, c + 34);
    ctx.lineTo(c - 32, c + 20);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();
  } else {
    // A dish, a cup tipped beside it, a smudge.
    ctx.lineWidth = 5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(c - 6, c + 10, 30, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a5a3a';
    ctx.beginPath();
    ctx.ellipse(c - 10, c + 8, 11, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(c + 8, c - 28, 22, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(c - 26, c - 14);
    ctx.lineTo(c - 18, c - 22);
    ctx.moveTo(c - 14, c - 14);
    ctx.lineTo(c - 8, c - 24);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
}
