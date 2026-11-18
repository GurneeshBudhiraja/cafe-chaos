/**
 * The hand ray's look: a faint cream line from the hand to what it points
 * at (the bar, a card, a padlock), and a small cursor where it meets it (a
 * mint dot in a cream ring). Meta: for distant targets "the cursor on the
 * target surface is the primary visual", so the line is kept faint and
 * thin and the cursor clear.
 *
 * A raised hand pointing at nothing yet shows a short beam (`idle`: 25 cm,
 * as the headset's own hand ray, and no cursor), so the ray is there to be
 * found: the first playtest's friend never knew the bar could be pointed
 * at, because the ray only appeared once it was already on a button.
 *
 * Each hand has its own; GameSystem decides when; they fade in and out
 * quickly, and are drawn over everything so the café never hides them.
 *
 * Drawn soft, so it is steady in the headset (the owner's Quest playtest:
 * the ray was not smooth). The line is a flat ribbon turned to the eyes,
 * its edges and its start at the hand faded in a texture, not a hair-thin
 * tube with hard edges that shimmers. The cursor is one picture with soft
 * edges, not two flat discs. Going from the ray to the short beam, the
 * line shrinks over a few frames instead of jumping.
 */

import { CanvasTexture, DoubleSide, Group, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import type { Hand } from '../lib/hand-pinch.js';

export const RAY_LOOK = {
  /**
   * The line: its width (metres, soft edges included: about half of it reads
   * as the line), colour and opacity; `fadeIn` is the share of its length
   * from the hand over which it fades in (Meta's hand ray is faint at the hand).
   */
  line: { width: 0.0045, color: 0xf2ebdd, opacity: 0.55, fadeIn: 0.3 },
  /** The cursor: the ring's and the dot's radius (metres), and colours. */
  cursor: { ring: 0.0062, dot: 0.0042, ringColor: 0xf2ebdd, dotColor: 0x7fbf95 },
  /** How quickly it fades in and out (per second); `shrink`: how quickly the line goes to the short beam's length. */
  fade: 14,
  shrink: 18,
  /** The cursor stands this far in front of the bar's face (metres), so it is never inside it. */
  lift: 0.002,
  /** The beam of a raised hand pointing at nothing: its length (metres; Meta's hand beam is 25 cm) and opacity. */
  idle: { length: 0.25, opacity: 0.22 },
};

interface Ray {
  line: Mesh<PlaneGeometry, MeshBasicMaterial>;
  cursor: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** The line's length now (metres), eased toward the short beam's. */
  length: number;
  /** 0 hidden to 1 shown, eased. */
  shown: number;
  /** Showing the short beam of a hand pointing at nothing (no cursor). */
  idle: boolean;
}

export class HandRays {
  readonly group = new Group();
  private readonly rays: Record<Hand, Ray> = { left: this.make(), right: this.make() };
  private readonly up = new Vector3(0, 1, 0);
  private readonly dir = new Vector3();
  private readonly q = new Quaternion();
  private readonly z = new Vector3(0, 0, 1);
  private readonly side = new Vector3();
  private readonly face = new Vector3();
  private readonly mid = new Vector3();
  private readonly basis = new Matrix4();
  /** Where the eyes are (world): the line turns its face to them. GameSystem sets it each frame. */
  readonly eye = new Vector3(0, 1.6, 0);

  constructor() {
    this.group.name = 'HandRays';
    for (const ray of Object.values(this.rays)) this.group.add(ray.line, ray.cursor);
  }

  private make(): Ray {
    const L = RAY_LOOK;
    // A ribbon from y 0 (the hand) to y 1, so its length is its y scale and its width its x scale.
    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    const line = new Mesh(geometry, new MeshBasicMaterial({ color: L.line.color, map: lineTexture(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, side: DoubleSide }));
    const cursor = new Mesh(new PlaneGeometry(L.cursor.ring * 2.4, L.cursor.ring * 2.4), new MeshBasicMaterial({ map: cursorTexture(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    for (const m of [line, cursor]) {
      m.renderOrder = 1001;
      m.frustumCulled = false;
      m.visible = false;
    }
    return { line, cursor, length: 0, shown: 0, idle: false };
  }

  /**
   * Show a hand's ray from `from` to `to` (world), the cursor facing along
   * `normal` (the bar's face, toward the player); with `to` null but an
   * `idle` direction, the short beam from `from` that way and no cursor;
   * with neither, fade it out.
   */
  update(hand: Hand, from: Vector3 | null, to: Vector3 | null, normal: Vector3 | null, delta: number, idle: Vector3 | null = null): void {
    const ray = this.rays[hand];
    const on = !!(from && to && normal);
    const beam = !on && !!(from && idle);
    ray.shown += ((on || beam ? 1 : 0) - ray.shown) * Math.min(1, RAY_LOOK.fade * delta);
    if (!on && !beam && ray.shown < 0.02) ray.shown = 0;
    const visible = ray.shown > 0;
    if (on || beam) ray.idle = beam;
    ray.line.visible = visible;
    ray.cursor.visible = visible && !ray.idle;
    if (!visible) return;
    ray.line.material.opacity = (ray.idle ? RAY_LOOK.idle.opacity / RAY_LOOK.line.opacity : 1) * RAY_LOOK.line.opacity * ray.shown;
    ray.cursor.material.opacity = ray.shown;
    if (beam) {
      this.dir.copy(idle!).normalize();
      // From the ray's length down to the short beam's, over a few frames (no jump).
      ray.length = ray.length > RAY_LOOK.idle.length ? ray.length + (RAY_LOOK.idle.length - ray.length) * Math.min(1, RAY_LOOK.shrink * delta) : RAY_LOOK.idle.length;
      this.lay(ray, from!, ray.length);
      return;
    }
    if (!on) {
      // Fading out: it keeps its last place.
      return;
    }
    this.dir.copy(to!).sub(from!);
    const length = this.dir.length();
    if (length < 1e-4) return;
    this.dir.divideScalar(length);
    ray.length = length;
    this.lay(ray, from!, length);
    ray.cursor.position.copy(to!).addScaledVector(normal!, RAY_LOOK.lift);
    ray.cursor.quaternion.copy(this.q.setFromUnitVectors(this.z, normal!));
  }

  /** Lay the line from `from` along `dir`, `length` long, its flat face turned to the eyes. */
  private lay(ray: Ray, from: Vector3, length: number): void {
    this.mid.copy(from).addScaledVector(this.dir, length / 2);
    this.side.copy(this.dir).cross(this.face.copy(this.eye).sub(this.mid));
    if (this.side.lengthSq() < 1e-10) this.side.copy(this.dir).cross(Math.abs(this.dir.y) < 0.9 ? this.up : this.z);
    this.side.normalize();
    this.face.copy(this.side).cross(this.dir).normalize();
    this.basis.makeBasis(this.side, this.dir, this.face);
    ray.line.position.copy(from);
    ray.line.quaternion.setFromRotationMatrix(this.basis);
    ray.line.scale.set(RAY_LOOK.line.width, length, 1);
  }

  /** Is a hand's ray showing (at all)? */
  showing(hand: Hand): boolean {
    return this.rays[hand].shown > 0;
  }

  /** Is it the short beam of a hand pointing at nothing (no cursor)? */
  idleBeam(hand: Hand): boolean {
    return this.rays[hand].shown > 0 && this.rays[hand].idle;
  }
}

/**
 * The line's picture: across, a soft core with edges fading to nothing;
 * along (v 0 at the hand), fading in over RAY_LOOK.line.fadeIn. White, the
 * material's colour tints it.
 */
function lineTexture(): CanvasTexture {
  const W = 16;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    // Canvas rows run top down; the texture's v runs bottom up (v 0 at the hand, the last row).
    const v = 1 - (y + 0.5) / H;
    const along = Math.min(1, v / RAY_LOOK.line.fadeIn);
    const alongEased = along * along * (3 - 2 * along);
    for (let x = 0; x < W; x++) {
      const u = Math.abs((x + 0.5) / W - 0.5) * 2;
      const across = Math.max(0, 1 - u * u) ** 1.5;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * across * alongEased);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  return t;
}

/** The cursor's picture: the cream ring round the mint dot, with soft (antialiased) edges, mipmapped. */
function cursorTexture(): CanvasTexture {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const c = S / 2;
  // The plane is the ring's diameter times 1.2: the ring's edge at 1 / 1.2 of the half-width, the dot's in proportion.
  const ring = c / 1.2;
  const dot = ring * (RAY_LOOK.cursor.dot / RAY_LOOK.cursor.ring);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  ctx.shadowColor = 'rgba(30, 20, 12, 0.45)';
  ctx.shadowBlur = S * 0.05;
  ctx.fillStyle = hex(RAY_LOOK.cursor.ringColor);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(c, c, ring, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = hex(RAY_LOOK.cursor.dotColor);
  ctx.beginPath();
  ctx.arc(c, c, dot, 0, Math.PI * 2);
  ctx.fill();
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  return t;
}
