/**
 * The cue that a pinch now would pick a guest up: a soft warm ring on
 * the ground round its feet, breathing slowly, one per hand. It shows on
 * exactly the guest a pinch would take (the nearest within reach of the
 * hand's pinch point), so what lights up is what you get. Warm amber, so
 * it is never mistaken for the violet glow of the seat a carried guest
 * would land on. The guest itself brightens a little too
 * (GuestActor.setHighlight).
 */

import { AdditiveBlending, CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from '@iwsdk/core';
import type { Vector3 } from '@iwsdk/core';

/** The ring: its colour, its size round a guest (metres across, café space), and how fast it breathes (per second). */
export const PICK_RING = { color: 0xffc27a, size: 0.05, opacity: 0.85, rate: 1.6 };

/** A soft ring, drawn once: clear in the middle, bright at the rim, fading outward. */
function ringTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.08)');
  g.addColorStop(0.74, 'rgba(255,255,255,1)');
  g.addColorStop(0.84, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

export class PickRings {
  readonly group = new Group();
  private readonly rings: Mesh[] = [];
  private readonly materials: MeshBasicMaterial[] = [];
  /** Each ring's brightness, 0 to 1, eased in and out. */
  private readonly level = [0, 0];
  private time = 0;

  constructor() {
    this.group.name = 'PickRings';
    this.group.userData.dynamic = true;
    const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const map = ringTexture();
    for (let i = 0; i < 2; i++) {
      const material = new MeshBasicMaterial({ color: PICK_RING.color, map, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
      const ring = new Mesh(plane, material);
      ring.renderOrder = 12;
      ring.visible = false;
      ring.userData.dynamic = true;
      this.group.add(ring);
      this.rings.push(ring);
      this.materials.push(material);
    }
  }

  /**
   * Show ring `i` round the feet at `at` (café space), or fade it out when
   * `at` is null. Call every frame for both rings.
   */
  show(i: number, at: Vector3 | null, delta: number): void {
    if (i === 0) this.time += delta;
    const ring = this.rings[i];
    const want = at ? 1 : 0;
    this.level[i] += (want - this.level[i]) * (1 - Math.exp(-(want ? 18 : 10) * delta));
    if (at) ring.position.set(at.x, at.y + 0.0012, at.z);
    const breath = 0.5 + 0.5 * Math.sin(this.time * PICK_RING.rate * Math.PI * 2);
    ring.scale.setScalar(PICK_RING.size * (1 + 0.08 * breath));
    this.materials[i].opacity = this.level[i] * PICK_RING.opacity * (0.75 + 0.25 * breath);
    ring.visible = this.level[i] > 0.01;
  }
}
