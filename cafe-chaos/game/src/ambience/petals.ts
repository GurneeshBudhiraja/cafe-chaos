/**
 * Falling cherry blossom: petals drift down from the tree at the back
 * left, rocking and spinning like leaves, carried a little over the café
 * by a breeze, and start again from the top once they land (on the
 * roof, the floor, the garden, or the table beyond the plate).
 *
 * The petals are the three small meshes of `petals.glb` (two petals and
 * a whole blossom), each drawn as one instanced mesh: three draw calls
 * for the whole fall, however many petals. The motion is the reference
 * one from the models' notes (models/19-petals).
 */

import { Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type Group, type Mesh, type Object3D } from '@iwsdk/core';

/** How many of each kind fall at once. */
const COUNT = { 'Petal-A': 16, 'Petal-B': 16, Blossom: 2 } as const;
/** Where petals appear: a box in and above the cherry tree's crown (café space, metres). */
const SPAWN = { x: [-0.44, -0.12], y: [0.26, 0.4], z: [-0.3, 0.1] } as const;
/** The fall (m/s), the breeze toward the café (+X, m/s), and the sideways rock (m/s). */
const FALL = { speed: [0.035, 0.06], breeze: [0.02, 0.04], drift: 0.02, rock: 0.03 } as const;
/** The plate's edges and its top; beyond it petals land on the player's table. */
const PLATE = { x: 0.46, z: 0.31, top: 0.024 };

interface Petal {
  position: Vector3;
  rotation: Euler;
  velocity: Vector3;
  spin: Vector3;
  /** Each petal rocks at its own rhythm. */
  phase: number;
  rate: number;
  scale: number;
}

const within = (range: readonly [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);

export class PetalFall {
  private readonly kinds: { mesh: InstancedMesh; petals: Petal[] }[] = [];
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3();
  /** The roof, as a slope the petals settle on: its footprint and its height at the back and at the eave (café space). */
  private roof: { minX: number; maxX: number; minZ: number; maxZ: number; back: number; eave: number } | null = null;

  /** `source` is the loaded `petals.glb` scene; the instanced meshes are added to `cafe`. */
  constructor(source: Object3D, cafe: Group) {
    for (const [name, count] of Object.entries(COUNT)) {
      const model = source.getObjectByName(name) as Mesh | undefined;
      if (!model?.isMesh) continue;
      const mesh = new InstancedMesh(model.geometry, model.material, count);
      mesh.name = `Falling-${name}`;
      mesh.userData.dynamic = true;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const petals: Petal[] = [];
      for (let i = 0; i < count; i++) {
        const petal: Petal = { position: new Vector3(), rotation: new Euler(), velocity: new Vector3(), spin: new Vector3(), phase: 0, rate: 0, scale: model.scale.x };
        this.reset(petal, true);
        petals.push(petal);
      }
      cafe.add(mesh);
      this.kinds.push({ mesh, petals });
    }
  }

  /** Tell the fall where the roof is, so petals settle on it instead of falling through (its bounds in café space). */
  setRoof(min: Vector3, max: Vector3): void {
    this.roof = { minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z, back: max.y, eave: min.y };
  }

  update(delta: number): void {
    for (const { mesh, petals } of this.kinds) {
      petals.forEach((petal, i) => {
        petal.phase += delta * petal.rate;
        // The flutter: it rocks sideways as it falls, and falls faster on the swing than at the turn.
        petal.position.x += (petal.velocity.x + FALL.rock * Math.sin(petal.phase)) * delta;
        petal.position.y += petal.velocity.y * delta * (0.7 + 0.3 * Math.cos(petal.phase * 1.3));
        petal.position.z += (petal.velocity.z + FALL.drift * Math.cos(petal.phase * 0.7)) * delta;
        petal.rotation.x += petal.spin.x * delta;
        petal.rotation.y += petal.spin.y * delta;
        petal.rotation.z += petal.spin.z * delta;
        if (petal.position.y < this.groundAt(petal.position.x, petal.position.z) + 0.002) this.reset(petal, false);
        this.scale.setScalar(petal.scale);
        mesh.setMatrixAt(i, this.matrix.compose(petal.position, this.quaternion.setFromEuler(petal.rotation), this.scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** What a petal lands on at a point: the roof's slope, the plate, or the table beyond it. */
  private groundAt(x: number, z: number): number {
    const roof = this.roof;
    if (roof && x > roof.minX && x < roof.maxX && z > roof.minZ && z < roof.maxZ) {
      const toEave = (z - roof.minZ) / (roof.maxZ - roof.minZ);
      return roof.back + (roof.eave - roof.back) * toEave;
    }
    return Math.abs(x) < PLATE.x && Math.abs(z) < PLATE.z ? PLATE.top : 0;
  }

  /** Start a petal again in the tree (or, at the very start, anywhere on its way down, so the fall is already under way). */
  private reset(petal: Petal, anywhere: boolean): void {
    petal.position.set(within(SPAWN.x), anywhere ? PLATE.top + Math.random() * (SPAWN.y[1] - PLATE.top) : within(SPAWN.y), within(SPAWN.z));
    // At the start, none begins inside the roof.
    if (anywhere && petal.position.y < this.groundAt(petal.position.x, petal.position.z) + 0.01) petal.position.y = within(SPAWN.y);
    petal.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    petal.velocity.set(within(FALL.breeze), -within(FALL.speed), (Math.random() - 0.5) * FALL.drift);
    petal.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3);
    petal.phase = Math.random() * Math.PI * 2;
    petal.rate = 2 + Math.random() * 2;
  }
}
