/**
 * A barista on stage: one of the six blocky, pixel-skinned looks (they
 * share one rig, the same node names and the same clips, so this class
 * drives any of them), with its clips ready to play and a place to hold
 * a tray.
 *
 * The model is seven rigid boxes (head, body, arms, legs, a blink strip)
 * sharing one small skin; they are folded into one skinned mesh
 * (lib/fold-parts.ts), so a barista is a single draw call.
 */

import { AnimationMixer, AssetManager, Color, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Mesh, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { foldParts } from '../lib/fold-parts.js';

export const BARISTA_NAMES = ['sora', 'momo', 'yuki'] as const;
export type BaristaName = (typeof BARISTA_NAMES)[number];
export type BaristaClip = 'Idle' | 'Work' | 'Wave' | 'Bow' | 'Walk' | 'Carry' | 'Serve' | 'Wipe';
/** The looks on the rig: the baristas, and the janitor (models/18-barista/staff_build.py). */
export type StaffLook = BaristaName | 'janitor';

/** A little light of their own, through their skin, so the pixel art stays crisp in the lamp light. */
const GLOW = 0.22;

export const baristaModel = (name: StaffLook): `barista-${StaffLook}` => `barista-${name}`;

/** True once this barista's model has loaded. */
export function baristaLoaded(name: StaffLook): boolean {
  return !!AssetManager.getGLTF(baristaModel(name), { shared: true });
}

export class Barista {
  readonly name: StaffLook;
  readonly root: Object3D;
  /** In front of the body at hand height: a tray is parented here. */
  readonly trayAnchor: Object3D;
  clip: BaristaClip = 'Idle';
  /** What it is carrying, if anything. */
  tray: Object3D | null = null;
  private readonly mixer: AnimationMixer;
  private readonly clips = new Map<string, AnimationClip>();
  private action: AnimationAction | null = null;

  constructor(name: StaffLook) {
    this.name = name;
    const gltf = AssetManager.getGLTF(baristaModel(name));
    if (!gltf) throw new Error(`[Barista] Model ${baristaModel(name)} is not loaded.`);
    this.root = gltf.scene.getObjectByName('barista') ?? gltf.scene;
    this.root.removeFromParent();
    this.root.position.set(0, 0, 0);
    this.root.name = `Barista-${name}`;
    // It moves about on its own: keep it out of the café's static batch.
    this.root.userData.dynamic = true;
    for (const clip of gltf.animations) this.clips.set(clip.name, clip);
    this.trayAnchor = this.root.getObjectByName('Tray') ?? this.root;
    const parts: Mesh[] = [];
    this.root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      parts.push(mesh);
    });
    // One material for the whole figure (its own copy, lifted a little).
    if (parts.length) {
      const skin = (parts[0].material as MeshStandardMaterial).clone();
      if (skin.map) {
        skin.emissive = new Color(0xffffff);
        skin.emissiveMap = skin.map;
        skin.emissiveIntensity = GLOW;
      }
      for (const part of parts) part.material = skin;
    }
    this.root.updateMatrixWorld(true);
    foldParts(this.root, parts, 'Barista-Skin');
    this.mixer = new AnimationMixer(this.root);
    this.play('Idle');
  }

  /** How long a clip lasts (seconds), for the ones played once. */
  seconds(name: BaristaClip): number {
    return this.clips.get(name)?.duration ?? 1;
  }

  /** Play a clip: looping, or once through and held on its last frame. */
  play(name: BaristaClip, once = false): void {
    if (this.clip === name && this.action && !once) return;
    // A model from before the Wipe clip (a cached copy) wipes with Work.
    const clip = this.clips.get(name) ?? (name === 'Wipe' ? this.clips.get('Work') : undefined);
    if (!clip) return;
    this.mixer.stopAllAction();
    this.clip = name;
    this.action = this.mixer.clipAction(clip);
    this.action.reset();
    this.action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    this.action.clampWhenFinished = once;
    this.action.play();
    this.mixer.update(0);
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }

  /** Take a tray into the hands (or put it down: null). */
  hold(tray: Object3D | null): void {
    if (this.tray) this.tray.removeFromParent();
    this.tray = tray;
    if (!tray) return;
    tray.position.set(0, 0, 0);
    tray.rotation.set(0, 0, 0);
    tray.scale.set(1, 1, 1);
    this.trayAnchor.add(tray);
  }
}
