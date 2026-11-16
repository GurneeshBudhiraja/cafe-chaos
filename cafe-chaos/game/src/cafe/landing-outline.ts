/**
 * Where the café will land: a dotted outline of its footprint, drawn on
 * the table (or in the air in front of the player when there is no table)
 * a moment before the café rises into it. The dots are small flat cream
 * discs, revealed one after another round the outline, so it reads as
 * being drawn; then they fade as the café comes up. Seen first, it tells
 * the player where to look, and nothing appears suddenly.
 */

import { CircleGeometry, Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import type { Footprint } from '../lib/desk-placement.js';

/** The dots: their radius and spacing (metres, at full size), colour, and how high over the surface they lie. */
const DOT = { radius: 0.0045, every: 0.024, color: 0xf3e2c4, lift: 0.003 };
const MAX_DOTS = 256;

export class LandingOutline {
  readonly group = new Group();
  private readonly dots: InstancedMesh;
  private readonly material = new MeshBasicMaterial({ color: new Color(DOT.color), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  private count = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly s = new Vector3(1, 1, 1);
  private readonly p = new Vector3();

  constructor() {
    this.dots = new InstancedMesh(new CircleGeometry(DOT.radius, 10), this.material, MAX_DOTS);
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 30;
    this.group.add(this.dots);
    this.group.name = 'LandingOutline';
    this.group.visible = false;
  }

  /** Lay the outline out round `footprint` (café space, full size) at `scale`, centred on `spot` (world) and turned by `yaw`. */
  place(footprint: Footprint, spot: Vector3, yaw: number, scale: number): void {
    this.group.position.copy(spot);
    this.group.rotation.set(0, yaw, 0);
    const { minX, maxX, minZ, maxZ } = footprint;
    const corners: [number, number][] = [[minX, maxZ], [maxX, maxZ], [maxX, minZ], [minX, minZ]].map(([x, z]) => [x * scale, z * scale]);
    let n = 0;
    // Start at the front-left corner and go round: front edge first, the side nearest the player.
    for (let i = 0; i < 4 && n < MAX_DOTS; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / (DOT.every * Math.max(scale, 0.5))));
      for (let k = 0; k < steps && n < MAX_DOTS; k++, n++) {
        const t = k / steps;
        this.p.set(ax + (bx - ax) * t, DOT.lift, az + (bz - az) * t);
        this.dots.setMatrixAt(n, this.m.compose(this.p, this.q, this.s));
      }
    }
    this.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    this.dots.count = 0;
    this.group.visible = true;
  }

  /** `drawn` 0..1: how much of the way round is drawn; `opacity` 0..1. */
  show(drawn: number, opacity: number): void {
    this.dots.count = Math.round(this.count * Math.min(1, Math.max(0, drawn)));
    this.material.opacity = opacity;
    this.group.visible = opacity > 0.01 && this.dots.count > 0;
  }

  hide(): void {
    this.group.visible = false;
  }
}
