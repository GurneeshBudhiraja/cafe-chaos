/**
 * CrumbSystem: little bits of sponge that shake loose as the knife goes
 * through the cake, tumble down and settle on the board. One instanced
 * mesh for all of them, recycled oldest first.
 */

import {
  Color,
  createSystem,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from '@iwsdk/core';

const MAX_CRUMBS = 180;
const GRAVITY = 9.8;
/** Crumbs fade out after resting this long (seconds), and are gone this much later. */
const REST_SECONDS = 9;
const FADE_SECONDS = 2;

interface Crumb {
  position: Vector3;
  velocity: Vector3;
  spin: Vector3;
  rotation: Quaternion;
  scale: number;
  floorY: number;
  age: number;
  settled: boolean;
  alive: boolean;
}

export class CrumbSystem extends createSystem({}) {
  private mesh: InstancedMesh | null = null;
  private readonly crumbs: Crumb[] = [];
  private next = 0;
  private readonly matrix = new Matrix4();
  private readonly dummy = new Object3D();
  private readonly spinQ = new Quaternion();
  private readonly colors = [new Color(0xf0cb86), new Color(0xd9ad62), new Color(0xfae2a8), new Color(0xf5c2cf)];

  init(): void {
    // A crumb: a lumpy little blob, roughly 3 mm across.
    const geometry = new IcosahedronGeometry(0.0021, 0);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const k = 0.7 + ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.6;
      position.setXYZ(i, position.getX(i) * k, position.getY(i) * (0.6 + k * 0.4), position.getZ(i) * k);
    }
    geometry.computeVertexNormals();
    const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0, transparent: true });
    this.mesh = new InstancedMesh(geometry, material, MAX_CRUMBS);
    this.mesh.name = 'Crumbs';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    for (let i = 0; i < MAX_CRUMBS; i++) {
      this.crumbs.push({
        position: new Vector3(),
        velocity: new Vector3(),
        spin: new Vector3(),
        rotation: new Quaternion(),
        scale: 1,
        floorY: 0,
        age: 0,
        settled: false,
        alive: false,
      });
      this.mesh.setColorAt(i, this.colors[i % this.colors.length]);
    }
    this.world.createTransformEntity(this.mesh);
  }

  /**
   * Shake `count` crumbs loose at a world point: they fly off along `out`
   * (a horizontal direction, either way), a little up, and land on `floorY`.
   */
  emit(at: Vector3, out: Vector3, count: number, floorY: number, speed = 0.25): void {
    if (!this.mesh) return;
    for (let k = 0; k < count; k++) {
      const crumb = this.crumbs[this.next];
      this.next = (this.next + 1) % MAX_CRUMBS;
      const side = Math.random() < 0.5 ? -1 : 1;
      const s = speed * (0.3 + Math.random() * 0.9);
      crumb.position.set(at.x + (Math.random() - 0.5) * 0.01, at.y + Math.random() * 0.006, at.z + (Math.random() - 0.5) * 0.01);
      crumb.velocity.set(
        out.x * s * side + (Math.random() - 0.5) * 0.12,
        0.12 + Math.random() * 0.35,
        out.z * s * side + (Math.random() - 0.5) * 0.12,
      );
      crumb.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
      crumb.rotation.identity();
      crumb.scale = 0.5 + Math.random() * 0.9;
      crumb.floorY = floorY + 0.0012 * crumb.scale;
      crumb.age = 0;
      crumb.settled = false;
      crumb.alive = true;
    }
    this.mesh.count = MAX_CRUMBS;
  }

  update(delta: number): void {
    const mesh = this.mesh;
    if (!mesh || mesh.count === 0) return;
    let any = false;
    this.crumbs.forEach((crumb, i) => {
      if (!crumb.alive) {
        this.matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, this.matrix);
        return;
      }
      any = true;
      crumb.age += delta;
      if (!crumb.settled) {
        crumb.velocity.y -= GRAVITY * delta;
        crumb.position.addScaledVector(crumb.velocity, delta);
        this.spinQ.setFromEuler(this.dummy.rotation.set(crumb.spin.x * delta, crumb.spin.y * delta, crumb.spin.z * delta));
        crumb.rotation.multiply(this.spinQ);
        if (crumb.position.y <= crumb.floorY) {
          crumb.position.y = crumb.floorY;
          // A small bounce, then it stays.
          if (crumb.velocity.y < -0.5) {
            crumb.velocity.y *= -0.25;
            crumb.velocity.x *= 0.5;
            crumb.velocity.z *= 0.5;
          } else {
            crumb.settled = true;
            crumb.age = 0;
          }
        }
      } else if (crumb.age > REST_SECONDS + FADE_SECONDS) {
        crumb.alive = false;
      }
      // Fading crumbs shrink away (one material for all, so no per-crumb opacity).
      const fade = crumb.settled ? Math.max(0, 1 - Math.max(0, crumb.age - REST_SECONDS) / FADE_SECONDS) : 1;
      const s = crumb.scale * fade;
      this.matrix.compose(crumb.position, crumb.rotation, this.dummy.scale.set(s, s, s));
      mesh.setMatrixAt(i, this.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (!any) mesh.count = 0;
  }
}
