/**
 * Falling sakura petals over the café: a small pool of petal meshes (from `petals.glb`)
 * that drift down from the cherry tree, flutter and spin, and start again from the top
 * once they land. Cheap: ~30 tiny meshes, no particles, no physics.
 *
 * This is the reference behaviour for the game; copy it or do the same with instancing.
 */

import { Group, Object3D, Vector3 } from '@iwsdk/core';

interface Petal {
  obj: Object3D;
  vel: Vector3;
  /** Flutter phase and rate (each petal rocks at its own rhythm). */
  phase: number;
  rate: number;
  spin: Vector3;
}

/** Where petals appear: a box above the cherry tree, in café space (metres). */
const SPAWN = { x: [-0.42, -0.1], y: [0.26, 0.4], z: [-0.3, 0.1] };
/** Where they are done: the floor / ground. */
const GROUND_Y = 0.024;

export class PetalFall {
  readonly group = new Group();
  private readonly petals: Petal[] = [];

  constructor(source: Object3D, parent: Object3D, count = 30) {
    const kinds = ['Petal-A', 'Petal-B'].map((n) => source.getObjectByName(n)!);
    for (let i = 0; i < count; i++) {
      const obj = kinds[i % kinds.length].clone();
      const petal: Petal = {
        obj,
        vel: new Vector3(),
        phase: Math.random() * Math.PI * 2,
        rate: 2 + Math.random() * 2,
        spin: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3),
      };
      this.reset(petal, true);
      this.group.add(obj);
      this.petals.push(petal);
    }
    this.group.name = 'Petals';
    parent.add(this.group);
  }

  private reset(p: Petal, anywhere = false): void {
    const r = (a: number[]) => a[0] + Math.random() * (a[1] - a[0]);
    p.obj.position.set(r(SPAWN.x), anywhere ? GROUND_Y + Math.random() * (SPAWN.y[1] - GROUND_Y) : r(SPAWN.y), r(SPAWN.z));
    p.obj.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    // slow fall, a light breeze toward +x (over the café), a little drift in z
    p.vel.set(0.02 + Math.random() * 0.02, -(0.035 + Math.random() * 0.025), (Math.random() - 0.5) * 0.02);
  }

  update(delta: number): void {
    for (const p of this.petals) {
      p.phase += delta * p.rate;
      // flutter: sideways rocking as it falls, like a leaf
      p.obj.position.x += (p.vel.x + 0.03 * Math.sin(p.phase)) * delta;
      p.obj.position.y += p.vel.y * delta * (0.7 + 0.3 * Math.cos(p.phase * 1.3));
      p.obj.position.z += (p.vel.z + 0.02 * Math.cos(p.phase * 0.7)) * delta;
      p.obj.rotation.x += p.spin.x * delta;
      p.obj.rotation.y += p.spin.y * delta;
      p.obj.rotation.z += p.spin.z * delta;
      if (p.obj.position.y < GROUND_Y + 0.002) this.reset(p);
    }
  }
}
