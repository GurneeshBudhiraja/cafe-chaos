/**
 * A guest on stage: one of the snack-spirit models, tinted and dressed
 * from its look, with its clips ready to play.
 *
 * The models are rigid parts (body, arms, three-part legs, face parts)
 * moved by the clips; there is a `Standing` and a `Seated` group, and
 * every expression is its own face part, shown or hidden by its scale
 * (the clips do that). This class:
 * - shows the pose group a clip belongs to and plays the clip;
 * - hides, each frame, the face parts a clip has scaled to nothing, so
 *   they are not drawn at all;
 * - folds the nine skin-coloured parts of each pose (body, arms, legs)
 *   into one skinned mesh whose bones are those parts, so the clips move
 *   it exactly as before but it is one draw call, not nine. Ten guests
 *   then cost about as many draw calls as the café itself;
 * - gives the guest its own materials, so it can be tinted and faded on
 *   its own;
 * - lets code take the face over for custom moments (expressions.ts).
 */

import { AnimationMixer, AssetManager, Color, LoopRepeat, type AnimationAction, type AnimationClip, type Material, type Mesh, type MeshStandardMaterial, type Object3D, type SkinnedMesh } from '@iwsdk/core';
import { foldParts } from '../lib/fold-parts.js';
import { GUEST_MODEL, type Look } from './cast.js';

export type ClipName = 'Idle' | 'Impatient' | 'Walk' | 'Lifted' | 'SitIdle' | 'SitHappy' | 'SitEating' | 'SitUnhappy';
export type Pose = 'standing' | 'seated';

/** Which pose group each clip moves. */
const POSE_OF: Record<ClipName, Pose> = {
  Idle: 'standing',
  Impatient: 'standing',
  Walk: 'standing',
  Lifted: 'standing',
  SitIdle: 'seated',
  SitHappy: 'seated',
  SitEating: 'seated',
  SitUnhappy: 'seated',
};

/**
 * A lift of the guests' own colour, as if lit from within: they spend
 * much of their time out on the table beyond the lamps' reach, and a
 * pastel guest should still read as pastel there.
 */
const GLOW = 0.3;
/** How much brighter a guest glows when a pinch now would pick it up. */
const HIGHLIGHT = 0.45;

/** The speed the Walk clip's planted foot was solved for (metres per second): play it faster or slower to match the ground. */
export const WALK_CLIP_SPEED = 0.0181;

export const EYES = ['EyesOpen', 'EyesWide', 'EyesHappy', 'EyesClosed', 'EyesCross'] as const;
export const MOUTHS = ['MouthSmile', 'MouthOpen', 'MouthO', 'MouthFrown', 'MouthNom'] as const;
export type Eyes = (typeof EYES)[number];
export type Mouth = (typeof MOUTHS)[number];
/** A face set by hand: which eyes and mouth show, and where the wide eyes' pupils look (metres, about ±0.001). */
export interface Face {
  eyes: Eyes;
  mouth: Mouth;
  lookX?: number;
  lookY?: number;
}

/** The face parts of one pose, by name without the pose prefix. */
type FaceParts = Record<string, Object3D>;

/** True once every model a guest of this look needs has loaded. */
export function castLoaded(look: Look): boolean {
  return !!AssetManager.getGLTF(GUEST_MODEL[look.species], { shared: true }) && !!AssetManager.getGLTF('accessories', { shared: true });
}

export class GuestActor {
  readonly root: Object3D;
  readonly look: Look;
  /** The point the player pinches (mid-body). */
  readonly grip: Object3D;
  readonly bubbleAnchor: Object3D;
  /** The clip playing now. */
  clip: ClipName = 'Idle';
  opacity = 1;
  private readonly mixer: AnimationMixer;
  private readonly clips = new Map<string, AnimationClip>();
  private action: AnimationAction | null = null;
  private readonly groups: Record<Pose, Object3D>;
  private readonly faces: Record<Pose, FaceParts> = { standing: {}, seated: {} };
  private readonly pupilHome: Record<Pose, { x: number; y: number }> = { standing: { x: 0, y: 0 }, seated: { x: 0, y: 0 } };
  /** Each face part's scale as the model has it at rest (before any clip). */
  private readonly restScale = new Map<Object3D, number>();
  private readonly materials: Material[] = [];
  /** How brightened it is now (setHighlight). */
  private highlight = 0;
  private readonly skins: SkinnedMesh[] = [];
  /** A face set by hand, shown instead of the clip's own (null: the clip decides). */
  private face: Face | null = null;

  constructor(look: Look) {
    this.look = look;
    const gltf = AssetManager.getGLTF(GUEST_MODEL[look.species]);
    if (!gltf) throw new Error(`[Guest] Model ${GUEST_MODEL[look.species]} is not loaded.`);
    this.root = gltf.scene.getObjectByName('guest') ?? gltf.scene;
    this.root.removeFromParent();
    this.root.position.set(0, 0, 0);
    // Yaw first, then lean: a guest can be turned to face somewhere and tilted or drooped from there.
    this.root.rotation.order = 'YXZ';
    // A guest moves about on its own: keep it out of the café's static batch.
    this.root.userData.dynamic = true;
    for (const clip of gltf.animations) this.clips.set(clip.name, clip);
    this.groups = { standing: this.root.getObjectByName('Standing')!, seated: this.root.getObjectByName('Seated')! };
    this.grip = this.root.getObjectByName('Grip')!;
    this.bubbleAnchor = this.root.getObjectByName('BubbleAnchor')!;
    this.dress(look.outfit);
    this.ownMaterials(look.tint);
    this.collectFaces();
    this.foldSkin(this.groups.standing);
    this.foldSkin(this.groups.seated);
    this.mixer = new AnimationMixer(this.root);
    this.play('Idle');
  }

  get pose(): Pose {
    return POSE_OF[this.clip];
  }

  /**
   * Play a clip (looping), at `timeScale` times its authored pace. The
   * clips switch whole faces by scale, so they are cut, never blended: a
   * blend would show two half-sized faces at once.
   */
  play(name: ClipName, timeScale = 1): void {
    if (this.clip === name && this.action) {
      this.action.timeScale = timeScale;
      return;
    }
    const clip = this.clips.get(name);
    if (!clip) return;
    // Anything set by hand goes back first, so the mixer hands over and takes up clean values.
    this.resetFaces();
    this.mixer.stopAllAction();
    this.clip = name;
    this.action = this.mixer.clipAction(clip).setLoop(LoopRepeat, Infinity);
    this.action.timeScale = timeScale;
    this.action.play();
    const pose = POSE_OF[name];
    this.groups.standing.visible = pose === 'standing';
    this.groups.seated.visible = pose === 'seated';
    // Settle the new pose now, so nothing shows a frame of the old one.
    this.mixer.update(0);
    this.showFaces();
  }

  /** Set the face by hand (until `setFace(null)`): the clip keeps moving the body. */
  setFace(face: Face | null): void {
    const ending = face === null && this.face !== null;
    this.face = face;
    if (ending) this.resync();
  }

  /**
   * Give the face back to the clip. The mixer only writes a value when
   * its own result changes, so it would never notice that a part it
   * holds steady (most of a face, most of the time) was changed by hand:
   * the hand-set parts are put back as the model has them, and the clip
   * is taken off and put on again at the same moment in its loop, which
   * makes the mixer write every value afresh.
   */
  private resync(): void {
    this.resetFaces();
    const action = this.action;
    if (!action) return;
    const { time, timeScale } = action;
    this.mixer.stopAllAction();
    action.play();
    action.time = time;
    action.timeScale = timeScale;
    this.mixer.update(0);
    this.showFaces();
  }

  /** Every face part, on both poses, back to how the model has it at rest. */
  private resetFaces(): void {
    for (const pose of ['standing', 'seated'] as const) {
      for (const part of Object.values(this.faces[pose])) part.scale.setScalar(this.restScale.get(part) ?? 1);
      const pupils = this.faces[pose].WidePupils;
      if (pupils) {
        pupils.position.x = this.pupilHome[pose].x;
        pupils.position.y = this.pupilHome[pose].y;
      }
    }
  }

  /** Advance the clip and tidy the face. */
  update(delta: number): void {
    this.mixer.update(delta);
    this.showFaces();
  }

  /**
   * Brighten the guest (0 as it is, 1 fully): its skin and clothes glow
   * more in their own colours. The cue that a pinch now would pick it up.
   */
  setHighlight(amount: number): void {
    if (amount === this.highlight) return;
    this.highlight = amount;
    for (const material of this.materials) {
      const standard = material as MeshStandardMaterial;
      if (standard.emissiveMap) standard.emissiveIntensity = GLOW + HIGHLIGHT * amount;
    }
  }

  /** 0 hidden to 1 solid. Below 1 the guest is drawn blended; at 1 it is opaque again. */
  setOpacity(value: number): void {
    const opacity = Math.min(1, Math.max(0, value));
    if (opacity === this.opacity) return;
    this.opacity = opacity;
    this.root.visible = opacity > 0.01;
    for (const material of this.materials) {
      const base = (material.userData.baseOpacity as number | undefined) ?? 1;
      const blended = (material.userData.baseTransparent as boolean | undefined) ?? false;
      material.opacity = base * opacity;
      const transparent = blended || opacity < 1;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
    }
  }

  /** Let go of what this guest alone owns. */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.root.removeFromParent();
    for (const material of this.materials) material.dispose();
    for (const skin of this.skins) {
      skin.geometry.dispose();
      skin.skeleton.dispose();
    }
  }

  // ---------------------------------------------------------------- build

  /** Hang each accessory on its attach point, on both poses. */
  private dress(outfit: string[]): void {
    if (outfit.length === 0) return;
    const accessories = AssetManager.getGLTF('accessories', { shared: true })?.scene;
    if (!accessories) return;
    for (const item of outfit) {
      const source = accessories.getObjectByName(item);
      const attach = source?.userData.attach as string | undefined;
      if (!source || !attach) continue;
      for (const prefix of ['St-', 'Se-']) {
        const copy = source.clone();
        // Its origin is already at the attach point: only the parent changes.
        copy.position.set(0, 0, 0);
        copy.rotation.set(0, 0, 0);
        copy.scale.set(1, 1, 1);
        this.root.getObjectByName(prefix + attach)?.add(copy);
      }
    }
  }

  /** One copy of each material for this guest alone; the skin takes the tint. */
  private ownMaterials(tint: number): void {
    const own = new Map<Material, Material>();
    this.root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const source = mesh.material as Material;
      let copy = own.get(source);
      if (!copy) {
        copy = source.clone();
        copy.userData.baseOpacity = source.opacity;
        copy.userData.baseTransparent = source.transparent;
        const standard = copy as MeshStandardMaterial;
        if (source.name.startsWith('GuestSkin')) standard.color.multiply(new Color(tint));
        // The skin and the clothes glow a little in their own colour (through their own texture).
        if (standard.map && standard.emissive) {
          standard.emissive.copy(standard.color);
          standard.emissiveMap = standard.map;
          standard.emissiveIntensity = GLOW;
        }
        own.set(source, copy);
        this.materials.push(copy);
      }
      mesh.material = copy;
    });
  }

  /** Fold a pose's skin-coloured parts (body, arms, legs) into one skinned mesh (see lib/fold-parts.ts). */
  private foldSkin(pose: Object3D): void {
    this.root.updateMatrixWorld(true);
    const parts: Mesh[] = [];
    pose.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name.startsWith('GuestSkin')) parts.push(mesh);
    });
    const skin = foldParts(pose, parts, `${pose.name}-Skin`);
    if (skin) this.skins.push(skin);
  }

  private collectFaces(): void {
    for (const [pose, prefix] of [['standing', 'St-'], ['seated', 'Se-']] as const) {
      for (const name of [...EYES, ...MOUTHS, 'WidePupils']) {
        const part = this.root.getObjectByName(prefix + name);
        if (!part) continue;
        this.faces[pose][name] = part;
        this.restScale.set(part, part.scale.x);
      }
      const pupils = this.faces[pose].WidePupils;
      if (pupils) this.pupilHome[pose] = { x: pupils.position.x, y: pupils.position.y };
    }
  }

  /**
   * Apply a hand-set face over the clip's, then hide every face part that
   * is scaled to nothing so it is not drawn.
   */
  private showFaces(): void {
    const parts = this.faces[this.pose];
    const face = this.face;
    if (face) {
      for (const name of EYES) parts[name]?.scale.setScalar(name === face.eyes ? 1 : 0);
      for (const name of MOUTHS) parts[name]?.scale.setScalar(name === face.mouth ? 1 : 0);
      const pupils = parts.WidePupils;
      if (pupils) {
        const home = this.pupilHome[this.pose];
        pupils.scale.setScalar(face.eyes === 'EyesWide' ? 1 : 0);
        pupils.position.x = home.x + (face.lookX ?? 0);
        pupils.position.y = home.y + (face.lookY ?? 0);
      }
    }
    for (const part of Object.values(parts)) part.visible = part.scale.x > 0.01;
  }
}
