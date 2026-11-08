/**
 * The patience timer over a waiting guest's head: a small round bubble
 * with a ring that drains as the seconds pass (green, then amber, then
 * red) and the seconds left in the middle. It turns to face the player.
 * Painted on a canvas; repainted only when the shown second changes.
 */

import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

/** The bubble's width in the café's space (metres), about half a guest tall. */
export const BUBBLE_SIZE_M = 0.03;
const PX = 128;

export class PatienceBubble {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private shownSeconds = -1;

  constructor() {
    this.canvas.width = this.canvas.height = PX;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({ map: this.texture, transparent: true, side: DoubleSide, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(BUBBLE_SIZE_M, BUBBLE_SIZE_M), this.material);
    this.mesh.name = 'PatienceBubble';
    this.mesh.renderOrder = 10;
  }

  /** Show `left` of `total` seconds remaining. */
  update(left: number, total: number): void {
    const seconds = Math.max(0, Math.ceil(left));
    if (seconds === this.shownSeconds) return;
    this.shownSeconds = seconds;
    const fraction = Math.max(0, Math.min(1, left / total));
    const ctx = this.canvas.getContext('2d')!;
    const c = PX / 2;
    ctx.clearRect(0, 0, PX, PX);
    // The bubble.
    ctx.fillStyle = 'rgba(255, 252, 245, 0.94)';
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.fill();
    // The ring: what is left, from the top, clockwise.
    const hue = 120 * fraction;
    ctx.strokeStyle = `hsl(${hue}, 70%, 45%)`;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(c, c, c - 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction, false);
    ctx.stroke();
    // What has gone, faint.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.beginPath();
    ctx.arc(c, c, c - 12, -Math.PI / 2 + Math.PI * 2 * fraction, Math.PI * 1.5, false);
    ctx.stroke();
    // The seconds.
    ctx.fillStyle = fraction < 0.25 ? '#b8362f' : '#3b3550';
    ctx.font = `bold ${seconds >= 100 ? 40 : 50}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(seconds), c, c + 3);
    this.texture.needsUpdate = true;
  }

  set opacity(value: number) {
    this.material.opacity = value;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
