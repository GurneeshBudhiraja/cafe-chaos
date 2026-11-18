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
 * - folds every part of each pose (body, arms, legs, every face part,
 *   and the clothes it wears) into one skinned mesh whose bones are those
 *   parts, so the clips move it exactly as before (a face part scaled to
 *   nothing by a clip folds away to nothing) but a guest is one draw
 *   call, not fifty. The parts' textures share one atlas per species
 *   (guests/guest-atlas.ts); the plain-coloured parts carry their colour as
 *   vertex colours, and only the skin and the clothes glow;
 * - gives the guest its own material, so it can be lit up and faded on
 *   its own. It is always drawn in the blended pass (at full opacity it
 *   looks as an opaque one would): the passthrough dimmer (light/dimmer.ts)
 *   is blended too and three.js draws every opaque object before it, so
 *   an opaque guest would be dimmed with the café, 42 % darker than the
 *   guests have always looked. Never switching also means a fade never
 *   changes the shader, which the warm-up (GuestSystem) compiles and keeps;
 * - lets code take the face over for custom moments (expressions.ts).
 */

import { AnimationMixer, AssetManager, BufferAttribute, Color, LoopRepeat, type AnimationAction, type AnimationClip, type BufferGeometry, type Material, type Mesh, type MeshStandardMaterial, type Object3D, type SkinnedMesh, type Texture } from '@iwsdk/core';
import { foldParts } from '../lib/fold-parts.js';
import { guestAtlas, type GuestAtlas } from './guest-atlas.js';
import { GUEST_MODEL, wardrobeOf, type Look } from './cast.js';
import { isCanada } from '../cafe/style.js';
import { DAY } from '../light/mood.js';

export type ClipName = 'Idle' | 'Impatient' | 'Walk' | 'Lifted' | 'SitIdle' | 'SitHappy' | 'SitEating' | 'SitUnhappy' | 'StairsUp' | 'StairsDown';
export type Pose = 'standing' | 'seated';

/** A cold guest's tint (multiplied into its colours) and its shiver: every `every` seconds, `seconds` of swaying `angle` radians at `rate` a second. */
const COLD_TINT = new Color(0xb9d8ff);
const SHIVER = { every: 1.6, seconds: 0.5, rate: 11, angle: 0.06 };

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
  StairsUp: 'standing',
  StairsDown: 'standing',
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
  return !!AssetManager.getGLTF(GUEST_MODEL[look.species], { shared: true }) && !!AssetManager.getGLTF(wardrobeOf(look.species), { shared: true });
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
  /** The one material the whole guest draws with (both poses). */
  readonly material: MeshStandardMaterial;
  /** Its own light from within: lower by day (the Canadian café: light/mood.ts DAY). */
  private readonly glow = isCanada() ? DAY.characterGlow.guest : GLOW;
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
    this.collectFaces();
    const { material, atlas } = this.ownMaterial();
    this.material = material;
    this.fold(this.groups.standing, atlas, new Color(look.tint));
    this.fold(this.groups.seated, atlas, new Color(look.tint));
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
  /** Does the model have this clip (the Canadian guests have the stair clips)? */
  has(name: ClipName): boolean {
    return this.clips.has(name);
  }

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

  /**
   * Cold (the Canadian café): the skin and clothes take a pale ice-blue
   * tint and the body shivers, a small quick sway of the pose group.
   */
  setCold(cold: boolean): void {
    if (cold === this.cold) return;
    this.cold = cold;
    // The parts' own colours are vertex colours: the material's colour (white when warm) tints them all, and the glow.
    this.material.color.set(0xffffff);
    if (cold) this.material.color.multiply(COLD_TINT);
    this.material.emissive.copy(this.material.color);
    if (!cold) for (const g of [this.groups.standing, this.groups.seated]) g.rotation.z = 0;
  }
  private cold = false;
  private shiverTime = 0;

  /** Advance the clip and tidy the face. */
  update(delta: number): void {
    this.mixer.update(delta);
    if (this.cold) {
      // A shiver: a few quick sways, then a rest, so it reads as a shiver and not a wobble.
      this.shiverTime += delta;
      const phase = this.shiverTime % SHIVER.every;
      const sway = phase < SHIVER.seconds ? Math.sin(phase * SHIVER.rate * Math.PI * 2) * SHIVER.angle * (1 - phase / SHIVER.seconds) : 0;
      this.groups[this.pose].rotation.z = sway;
    }
    this.showFaces();
  }

  /**
   * Brighten the guest (0 as it is, 1 fully): its skin and clothes glow
   * more in their own colours. The cue that a pinch now would pick it up.
   */
  setHighlight(amount: number): void {
    if (amount === this.highlight) return;
    this.highlight = amount;
    this.material.emissiveIntensity = this.glow + HIGHLIGHT * amount;
  }

  /** 0 hidden to 1 solid (always drawn blended: see the class notes, so a fade never changes the shader). */
  setOpacity(value: number): void {
    const opacity = Math.min(1, Math.max(0, value));
    if (opacity === this.opacity) return;
    this.opacity = opacity;
    this.root.visible = opacity > 0.01;
    this.material.opacity = opacity;
  }

  /** Let go of what this guest alone owns. */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.root.removeFromParent();
    this.material.dispose();
    for (const skin of this.skins) {
      skin.geometry.dispose();
      skin.skeleton.dispose();
    }
  }

  // ---------------------------------------------------------------- build

  /** Hang each accessory on its attach point, on both poses. */
  private dress(outfit: string[]): void {
    if (outfit.length === 0) return;
    const accessories = AssetManager.getGLTF(wardrobeOf(this.look.species), { shared: true })?.scene;
    if (!accessories) return;
    for (const item of outfit) {
      const source = accessories.getObjectByName(item);
      const attach = source?.userData.attach as string | undefined;
      if (!source || !attach) continue;
      for (const prefix of ['St-', 'Se-']) {
        const copy = source.clone();
        copy.traverse((node) => (node.userData.clothes = true));
        // Its origin is already at the attach point: only the parent changes.
        copy.position.set(0, 0, 0);
        copy.rotation.set(0, 0, 0);
        copy.scale.set(1, 1, 1);
        this.root.getObjectByName(prefix + attach)?.add(copy);
      }
    }
  }

  /**
   * The guest's own material: the skin's (matte, see light/cheap-materials.ts),
   * drawing from the species' atlas, coloured by its vertices, glowing a
   * little in its own colours (only where a part's `glow` is 1: the skin and
   * the clothes).
   */
  private ownMaterial(): { material: MeshStandardMaterial; atlas: GuestAtlas } {
    let skin: MeshStandardMaterial | null = null;
    let clothes: Texture | null = null;
    this.root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as MeshStandardMaterial;
      if (!skin && material.name.startsWith('GuestSkin')) skin = material;
      if (!clothes && mesh.userData.clothes && material.map) clothes = material.map;
    });
    if (!skin) throw new Error(`[Guest] ${this.look.species} has no skin material.`);
    const source = skin as MeshStandardMaterial;
    const atlas = guestAtlas(source.map!, clothes ?? this.wardrobeTexture());
    const material = source.clone() as MeshStandardMaterial;
    material.name = `Guest-${this.look.species}`;
    material.map = atlas.texture;
    material.emissiveMap = atlas.texture;
    material.color.set(0xffffff);
    material.emissive.set(0xffffff);
    material.emissiveIntensity = this.glow;
    material.vertexColors = true;
    // Blended, depth written: at full opacity it draws as an opaque one would, after the passthrough dimmer.
    material.transparent = true;
    material.opacity = 1;
    material.depthWrite = true;
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb * vGlow;');
    };
    material.customProgramCacheKey = () => 'guest-folded';
    return { material, atlas };
  }

  /** The species' clothes texture (for an undressed guest: the atlas has room for it all the same, so every guest of a species shares one). */
  private wardrobeTexture(): Texture | null {
    const scene = AssetManager.getGLTF(wardrobeOf(this.look.species), { shared: true })?.scene;
    let map: Texture | null = null;
    scene?.traverse((node) => {
      const mesh = node as Mesh;
      if (!map && mesh.isMesh) map = (mesh.material as MeshStandardMaterial).map ?? null;
    });
    return map;
  }

  /**
   * Fold every part of a pose (skin, face and clothes) into one skinned
   * mesh (lib/fold-parts.ts). Each part's texture coordinates move into
   * the atlas, its colour (the skin's times the guest's tint) becomes its
   * vertex colour, and `glow` says whether it glows. The face parts are
   * folded at full size (some rest at nothing, which a skeleton cannot be
   * bound to) and put back after.
   */
  private fold(pose: Object3D, atlas: GuestAtlas, tint: Color): void {
    const prefix = pose === this.groups.standing ? 'standing' : 'seated';
    const faces = Object.values(this.faces[prefix]);
    for (const part of faces) part.scale.setScalar(1);
    this.root.updateMatrixWorld(true);
    const parts: Mesh[] = [];
    pose.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material)) parts.push(mesh);
    });
    const colour = new Color();
    const skin = foldParts(pose, parts, `${pose.name}-Guest`, this.material, (part, geometry) => {
      const source = part.material as MeshStandardMaterial;
      const isSkin = source.name.startsWith('GuestSkin');
      const isClothes = !!part.userData.clothes;
      colour.copy(source.color ?? colour.set(0xffffff));
      if (isSkin) colour.multiply(tint);
      const region = isSkin ? atlas.skin : isClothes ? atlas.clothes : null;
      remapUv(geometry, region, atlas.white);
      paint(geometry, colour, isSkin || isClothes ? 1 : 0);
    });
    if (skin) this.skins.push(skin);
    for (const part of faces) part.scale.setScalar(this.restScale.get(part) ?? 1);
    this.root.updateMatrixWorld(true);
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

/** Move a part's texture coordinates into its region of the atlas, or (a plain-coloured part) all onto the white patch. */
function remapUv(geometry: BufferGeometry, region: { su: number; sv: number; ou: number; ov: number } | null, white: { u: number; v: number }): void {
  const count = geometry.attributes.position.count;
  const old = geometry.attributes.uv as BufferAttribute | undefined;
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    if (region && old) {
      uv[i * 2] = old.getX(i) * region.su + region.ou;
      uv[i * 2 + 1] = old.getY(i) * region.sv + region.ov;
    } else {
      uv[i * 2] = white.u;
      uv[i * 2 + 1] = white.v;
    }
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
}

/** Give every vertex of a part its colour and whether it glows. */
function paint(geometry: BufferGeometry, colour: Color, glow: number): void {
  const count = geometry.attributes.position.count;
  const colours = new Float32Array(count * 3);
  const glows = new Float32Array(count).fill(glow);
  for (let i = 0; i < count; i++) {
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  geometry.setAttribute('glow', new BufferAttribute(glows, 1));
  // Only what the folded mesh draws with: the merge needs every part alike.
  for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv', 'color', 'glow'].includes(name)) geometry.deleteAttribute(name);
}
