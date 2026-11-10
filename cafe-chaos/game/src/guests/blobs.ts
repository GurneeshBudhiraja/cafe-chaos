/**
 * The guests' contact shadows: a soft dark blob under each one's feet.
 * The real shadow map rests while the café is still (see
 * RenderBudgetSystem), and redrawing it for ten walking guests would
 * undo that; a blob grounds a guest just as well at this size. All the
 * blobs are one instanced mesh: one draw call however many guests.
 */

import { CanvasTexture, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3 } from '@iwsdk/core';

/** The blob's diameter under a guest of full size (metres), and its darkness. */
const BLOB = { size: 0.046, opacity: 0.3 };

function blobTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

export class Blobs {
  readonly mesh: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly scale = new Vector3();
  private readonly place = new Vector3();

  constructor(count: number) {
    const material = new MeshBasicMaterial({ color: 0x120a06, alphaMap: blobTexture(), transparent: true, opacity: BLOB.opacity, depthWrite: false, toneMapped: false });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, count);
    this.mesh.name = 'GuestBlobs';
    this.mesh.userData.dynamic = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.count = 0;
  }

  /** Begin a frame's blobs. */
  begin(): void {
    this.mesh.count = 0;
  }

  /** A blob at a point on the ground (café space), `strength` 0 to 1. */
  add(x: number, y: number, z: number, strength: number): void {
    if (strength <= 0.02 || this.mesh.count >= this.mesh.instanceMatrix.count) return;
    this.scale.setScalar(BLOB.size * (0.6 + 0.4 * strength));
    this.matrix.compose(this.place.set(x, y + 0.0007, z), this.flat, this.scale);
    this.mesh.setMatrixAt(this.mesh.count++, this.matrix);
  }

  end(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
