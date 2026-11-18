/**
 * The rooftop pianist's music notes (models/27-cafe-canada/music-notes.glb): three tiny notes, about 6 mm tall,
 * that pop up over the piano, rise, sway and shrink away on a 2 s loop (its `Ambient` clip). Made in the pianist's
 * own frame, so it rides on the pianist's root: it shows while the pianist plays and goes when the pianist goes.
 */

import { AnimationMixer, AssetManager, LoopRepeat, type Mesh, type Object3D } from '@iwsdk/core';

export const MUSIC_NOTES = 'music-notes';

/** True once the notes' model has loaded. */
export function musicNotesLoaded(): boolean {
  return !!AssetManager.getGLTF(MUSIC_NOTES, { shared: true });
}

export class MusicNotes {
  readonly root: Object3D;
  private readonly mixer: AnimationMixer;

  constructor() {
    const gltf = AssetManager.getGLTF(MUSIC_NOTES);
    if (!gltf) throw new Error(`[MusicNotes] Model ${MUSIC_NOTES} is not loaded.`);
    this.root = gltf.scene.getObjectByName(MUSIC_NOTES) ?? gltf.scene;
    this.root.removeFromParent();
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    // It moves on its own: keep it out of the café's static batch, and too small to cast a shadow worth drawing.
    this.root.userData.dynamic = true;
    this.root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    this.mixer = new AnimationMixer(this.root);
    const clip = gltf.animations.find((a) => a.name === 'Ambient') ?? gltf.animations[0];
    if (clip) this.mixer.clipAction(clip).setLoop(LoopRepeat, Infinity).play();
    this.mixer.update(0);
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }
}
