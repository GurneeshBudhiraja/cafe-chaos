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
 */

import { CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import type { Hand } from '../lib/hand-pinch.js';

export const RAY_LOOK = {
  /** The line: its radius (metres), colour and opacity. */
  line: { radius: 0.0011, color: 0xf2ebdd, opacity: 0.3 },
  /** The cursor: the ring's and the dot's radius (metres), and colours. */
  cursor: { ring: 0.0062, dot: 0.0042, ringColor: 0xf2ebdd, dotColor: 0x7fbf95 },
  /** How quickly it fades in and out (per second). */
  fade: 14,
  /** The cursor stands this far in front of the bar's face (metres), so it is never inside it. */
  lift: 0.002,
  /** The beam of a raised hand pointing at nothing: its length (metres; Meta's hand beam is 25 cm) and opacity. */
  idle: { length: 0.25, opacity: 0.22 },
};

interface Ray {
  line: Mesh<CylinderGeometry, MeshBasicMaterial>;
  cursor: Group;
  ring: MeshBasicMaterial;
  dot: MeshBasicMaterial;
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

  constructor() {
    this.group.name = 'HandRays';
    for (const ray of Object.values(this.rays)) this.group.add(ray.line, ray.cursor);
  }

  private make(): Ray {
    const L = RAY_LOOK;
    const geometry = new CylinderGeometry(L.line.radius, L.line.radius, 1, 6, 1, true);
    // From y 0 to y 1, so its length is its y scale.
    geometry.translate(0, 0.5, 0);
    const line = new Mesh(geometry, new MeshBasicMaterial({ color: L.line.color, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    const ring = new MeshBasicMaterial({ color: L.cursor.ringColor, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
    const dot = new MeshBasicMaterial({ color: L.cursor.dotColor, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
    const cursor = new Group();
    const ringMesh = new Mesh(new CircleGeometry(L.cursor.ring, 20), ring);
    const dotMesh = new Mesh(new CircleGeometry(L.cursor.dot, 20), dot);
    dotMesh.position.z = 0.0005;
    cursor.add(ringMesh, dotMesh);
    for (const m of [line, ringMesh, dotMesh]) {
      m.renderOrder = 1001;
      m.frustumCulled = false;
    }
    line.visible = false;
    cursor.visible = false;
    return { line, cursor, ring, dot, shown: 0, idle: false };
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
    ray.line.material.opacity = (ray.idle ? RAY_LOOK.idle.opacity : RAY_LOOK.line.opacity) * ray.shown;
    ray.ring.opacity = 0.85 * ray.shown;
    ray.dot.opacity = ray.shown;
    if (beam) {
      ray.line.position.copy(from!);
      ray.line.quaternion.setFromUnitVectors(this.up, this.dir.copy(idle!).normalize());
      ray.line.scale.set(1, RAY_LOOK.idle.length, 1);
      return;
    }
    if (!on) return;
    this.dir.copy(to!).sub(from!);
    const length = this.dir.length();
    if (length < 1e-4) return;
    ray.line.position.copy(from!);
    ray.line.quaternion.setFromUnitVectors(this.up, this.dir.divideScalar(length));
    ray.line.scale.set(1, length, 1);
    ray.cursor.position.copy(to!).addScaledVector(normal!, RAY_LOOK.lift);
    ray.cursor.quaternion.copy(this.q.setFromUnitVectors(this.z, normal!));
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
