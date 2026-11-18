/**
 * Snow over the Canadian café in a storm (docs/CANADA-CHALLENGES.md): a
 * few hundred soft flakes drifting down over the plate, one draw call
 * (one Points object, one small round texture). It fades in when the storm
 * starts, with a sideways gust for its first seconds, and out when it ends.
 * Nothing dims.
 */

import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Points, PointsMaterial } from '@iwsdk/core';

/** How many flakes, the box they fall through (café space, metres), and how they move. */
const SNOW = { count: 320, x: 0.42, z: 0.34, top: 0.5, fall: 0.035, sway: 0.006, size: 0.0065, fade: 1.5, gust: { seconds: 2.5, speed: 0.12 } };

export class Snow {
  readonly points: Points;
  private readonly material: PointsMaterial;
  private readonly positions: Float32Array;
  private readonly phase: Float32Array;
  private level = 0;
  private time = 0;
  private gustLeft = 0;

  constructor() {
    const n = SNOW.count;
    this.positions = new Float32Array(n * 3);
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.positions[i * 3] = (Math.random() * 2 - 1) * SNOW.x;
      this.positions[i * 3 + 1] = Math.random() * SNOW.top;
      this.positions[i * 3 + 2] = (Math.random() * 2 - 1) * SNOW.z;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.material = new PointsMaterial({ size: SNOW.size, map: flake(), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, color: 0xf2f7ff, sizeAttenuation: true });
    this.points = new Points(geometry, this.material);
    this.points.name = 'StormSnow';
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.visible = false;
    // It moves on its own: keep it out of the café's static batch.
    this.points.userData.dynamic = true;
  }

  /** Blowing (`on`) or not; `running` false holds the flakes still (a pause). */
  update(delta: number, on: boolean, running = true): void {
    const was = this.level;
    this.level = Math.min(1, Math.max(0, this.level + ((on ? 1 : -1) * delta) / SNOW.fade));
    if (on && was === 0) this.gustLeft = SNOW.gust.seconds;
    this.points.visible = this.level > 0;
    this.material.opacity = 0.9 * this.level;
    if (!this.points.visible || !running) return;
    this.time += delta;
    this.gustLeft = Math.max(0, this.gustLeft - delta);
    const gust = (SNOW.gust.speed * this.gustLeft) / SNOW.gust.seconds;
    const p = this.positions;
    for (let i = 0; i < SNOW.count; i++) {
      const k = i * 3;
      p[k] += (Math.sin(this.time * 1.3 + this.phase[i]) * SNOW.sway + gust) * delta;
      p[k + 1] -= SNOW.fall * (0.7 + 0.6 * ((i * 7919) % 100) / 100) * delta;
      if (p[k + 1] < 0) p[k + 1] += SNOW.top;
      if (p[k] > SNOW.x) p[k] -= SNOW.x * 2;
      if (p[k] < -SNOW.x) p[k] += SNOW.x * 2;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  get showing(): boolean {
    return this.points.visible;
  }
}

/** A soft round flake. */
function flake(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}
