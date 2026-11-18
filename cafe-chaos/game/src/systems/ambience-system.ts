/**
 * AmbienceSystem: the small movements that make the café feel alive
 * while nobody is doing anything.
 *
 * - Steam: the shell carries a two-second `Ambient` clip in which six
 *   puffs over the kettle, the pour-over and the espresso machine rise,
 *   swell and thin away. It is played on the shell and left running:
 *   something is always brewing.
 * - Cherry blossom: petals fall from the tree (ambience/petals.ts).
 */

import { AnimationMixer, AssetManager, Box3, createSystem, Vector3, type Mesh } from '@iwsdk/core';
import { PetalFall } from '../ambience/petals.js';
import { CafeSystem } from './cafe-system.js';
import { isCanada } from '../cafe/style.js';

/** The shell's steam clip. */
const STEAM_CLIP = 'Ambient';

export class AmbienceSystem extends createSystem({}) {
  /** The falling petals, once their model has loaded. */
  petals: PetalFall | null = null;
  /** True once the steam clip is playing. */
  steaming = false;
  private cafeSystem!: CafeSystem;
  private mixer: AnimationMixer | null = null;

  init(): void {
    this.cafeSystem = this.world.getSystem(CafeSystem)!;
    this.startClip();
  }

  /** The shell's own clip (the Japanese café's steam; the Canadian café's smoke, flames and waterfall), played on a loop. */
  private startClip(): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.steaming = false;
    const shell = this.cafeSystem.pieces[0];
    const clip = AssetManager.getGLTF(isCanada() ? 'cafe-canada' : 'cafe-shell', { shared: true })?.animations.find((c) => c.name === STEAM_CLIP);
    if (shell && clip) {
      this.mixer = new AnimationMixer(shell);
      this.mixer.clipAction(clip).play();
      this.steaming = true;
    }
  }

  private rooms = 0;

  update(frameDelta: number): void {
    const delta = Math.min(1, frameDelta) * this.cafeSystem.timeScale;
    if (this.cafeSystem.rooms !== this.rooms) {
      // The café swapped for the other: its own clip; the petals fall only from the Japanese café's cherry tree.
      this.rooms = this.cafeSystem.rooms;
      this.startClip();
      this.petals?.dispose();
      this.petals = null;
    }
    this.mixer?.update(delta);
    if (isCanada()) return;
    if (!this.petals) this.startPetals();
    this.petals?.update(delta);
  }

  /** The petal model loads in the background: start the fall once it is in. */
  private startPetals(): void {
    const source = AssetManager.getGLTF('petals', { shared: true })?.scene;
    if (!source) return;
    const cafe = this.cafeSystem.cafe;
    this.petals = new PetalFall(source, cafe);
    // The roof (the tiled eave), in the café's space, for petals to settle on.
    cafe.updateMatrixWorld(true);
    const roof = new Box3();
    cafe.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name === 'CafeRoofTile') roof.expandByObject(mesh);
    });
    if (roof.isEmpty()) return;
    const toCafe = cafe.matrixWorld.clone().invert();
    const corners = [new Vector3(roof.min.x, roof.min.y, roof.min.z), new Vector3(roof.max.x, roof.max.y, roof.max.z)].map((p) => p.applyMatrix4(toCafe));
    this.petals.setRoof(new Vector3().copy(corners[0]).min(corners[1]), new Vector3().copy(corners[0]).max(corners[1]));
  }
}
