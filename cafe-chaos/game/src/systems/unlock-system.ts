/**
 * UnlockSystem: the stone plaques in the gravel in front of the café,
 * each a button that opens something. For now there is one, the garden
 * annex: pinch the plaque and the annex grows off the café's left side
 * (CafeSystem.openAnnex).
 *
 * The plaque is the Blender `unlock-plaque` (models/23-unlock-plaque): a
 * flat stone with a cream face and a brass padlock on it. The game draws
 * the face: the stone's own texture, the annex's icon from the icon atlas
 * (`unlock-icons.png`, tile 7) and its name. It stands on the shell's
 * `PlaqueSpot-1`, the left end of the front strip, nearest the side the
 * annex grows from.
 *
 * - A free hand that comes close lights the plaque up (a warm glow that
 *   breathes), the same cue a guest gives: pinch now and it is yours.
 * - A pinch that closes on it presses it: the padlock pops off (the
 *   plaque's `Unlock` clip), and the annex rises.
 * - Pinches near the plaque are its own, never the café's.
 */

import { AnimationMixer, AssetManager, CanvasTexture, Color, LoopOnce, LoopRepeat, SRGBColorSpace, Vector3, createSystem, type AnimationAction, type Mesh, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { CafeSystem, copyModel } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';
import { HoldSystem } from './hold-system.js';

/** The plaque for the annex: where it stands, which tile of the icon atlas, and its name. */
const ANNEX_PLAQUE = { spot: 'PlaqueSpot-1', icon: 7, label: 'ANNEX' };
/** A pinch closing this near the plaque's grip presses it (metres, café space; never less than the world floor). */
const PRESS_RADIUS_M = 0.04;
const PRESS_RADIUS_WORLD_MIN_M = 0.03;
/** A hand this many press radii away already lights the plaque up. */
const HOVER_RADII = 1.4;
/** The glow: its colour, how bright at full, and how fast it breathes (per second). */
const GLOW = { color: 0xffc27a, strength: 0.55, rate: 2.2 };

interface Plaque {
  root: Object3D;
  grip: Object3D;
  mixer: AnimationMixer;
  locked: AnimationAction | null;
  unlock: AnimationAction | null;
  stone: MeshStandardMaterial[];
  /** 0 to 1: how lit up it is. */
  glow: number;
  pressed: boolean;
}

export class UnlockSystem extends createSystem({}) {
  /** The annex plaque, once its model has loaded. */
  annexPlaque: Plaque | null = null;
  /** The hand over the plaque this frame, if any (for the checks). */
  hovered: Hand | null = null;
  private cafe!: CafeSystem;
  private hold: HoldSystem | null = null;
  private guests: GuestSystem | null = null;
  private readonly previous: Record<Hand, boolean> = { left: false, right: false };
  private readonly at = new Vector3();
  private time = 0;
  private wantAnnex = false;

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    this.guests = this.world.getSystem(GuestSystem) ?? null;
    // A pinch on or around the plaque is the plaque's, never the café's.
    this.hold?.claims.push((point) => this.near(point, HOVER_RADII));
  }

  update(frameDelta: number): void {
    const delta = Math.min(0.1, frameDelta);
    this.time += delta;
    if (!this.annexPlaque) this.annexPlaque = this.build();
    const plaque = this.annexPlaque;
    if (!plaque) return;
    plaque.mixer.update(delta);
    // Pressed before the annex's models had loaded: open it as soon as they have.
    if (this.wantAnnex && this.cafe.openAnnex()) this.wantAnnex = false;
    this.hovered = null;
    const hold = this.hold;
    if (hold && !plaque.pressed && this.cafe.placed && !this.cafe.arriving) {
      for (const hand of HANDS) {
        const pinch = hold.pinch[hand];
        const fresh = pinch.closed && !this.previous[hand];
        this.previous[hand] = pinch.closed;
        // A tracked hand that is not carrying a guest or holding the café.
        if (pinch.gap === Infinity || pinch.ghost || hold.holding.includes(hand) || this.guests?.carriedBy(hand)) continue;
        if (!this.near(pinch.point, HOVER_RADII)) continue;
        this.hovered = hand;
        if (fresh && this.near(pinch.point, 1)) this.press(plaque);
      }
    }
    this.shine(plaque, delta);
  }

  /** Press a plaque: the padlock pops off and the annex opens. */
  press(plaque: Plaque | null = this.annexPlaque): void {
    if (!plaque || plaque.pressed) return;
    plaque.pressed = true;
    plaque.locked?.stop();
    plaque.unlock?.reset().play();
    if (!this.cafe.openAnnex()) this.wantAnnex = true;
  }

  /** Is a world point within `radii` press radii of the plaque's grip? */
  private near(point: Vector3, radii: number): boolean {
    const plaque = this.annexPlaque;
    if (!plaque || plaque.pressed || !plaque.root.visible) return false;
    const reach = Math.max(PRESS_RADIUS_WORLD_MIN_M, PRESS_RADIUS_M * this.cafe.cafe.scale.x) * radii;
    return plaque.grip.getWorldPosition(this.at).distanceTo(point) < reach;
  }

  /** The warm glow of a plaque a hand is over: it comes up quickly, breathes, and fades once the hand goes. */
  private shine(plaque: Plaque, delta: number): void {
    const want = this.hovered && !plaque.pressed ? 1 : 0;
    plaque.glow += (want - plaque.glow) * (1 - Math.exp(-10 * delta));
    const breath = 0.8 + 0.2 * Math.sin(this.time * GLOW.rate * Math.PI * 2);
    for (const material of plaque.stone) material.emissiveIntensity = plaque.glow * GLOW.strength * breath;
  }

  /** Put the annex plaque on its spot, its face drawn, its padlock rocking; null until its model has loaded. */
  private build(): Plaque | null {
    if (!AssetManager.getGLTF('unlock-plaque')) return null;
    const spot = this.cafe.cafe.getObjectByName(ANNEX_PLAQUE.spot);
    if (!spot) return null;
    const root = copyModel('unlock-plaque');
    root.userData.dynamic = true;
    spot.add(root);
    const grip = root.getObjectByName('Grip') ?? root;
    // Its own materials, so the glow and the face are this plaque's alone.
    const stone: MeshStandardMaterial[] = [];
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as MeshStandardMaterial).clone();
      mesh.material = material;
      if (node.name === 'PlaqueFace' || node.parent?.name === 'PlaqueFace') drawFace(material, ANNEX_PLAQUE.icon, ANNEX_PLAQUE.label);
      else if (material.emissive) {
        material.emissive = new Color(GLOW.color);
        material.emissiveIntensity = 0;
        stone.push(material);
      }
    });
    const mixer = new AnimationMixer(root);
    const clips = AssetManager.getGLTF('unlock-plaque', { shared: true })?.animations ?? [];
    const clip = (name: string) => clips.find((c) => c.name === name);
    const lockedClip = clip('Locked');
    const unlockClip = clip('Unlock');
    const locked = lockedClip ? mixer.clipAction(lockedClip).setLoop(LoopRepeat, Infinity) : null;
    const unlock = unlockClip ? mixer.clipAction(unlockClip).setLoop(LoopOnce, 1) : null;
    if (unlock) unlock.clampWhenFinished = true;
    locked?.play();
    return { root, grip, mixer, locked, unlock, stone, glow: 0, pressed: false };
  }
}

/** The atlas of unlock icons (4 x 2 tiles), loaded once. */
let icons: HTMLImageElement | null = null;
function iconAtlas(): HTMLImageElement {
  if (!icons) {
    icons = new Image();
    icons.src = `${import.meta.env.BASE_URL}models/unlock-icons.png`;
  }
  return icons;
}

/**
 * Draw a plaque's face onto its material: the stone face's own texture,
 * the icon from the atlas, and the name, in a canvas the size of the
 * face's texture. Redrawn once the atlas has loaded. The back fifth of the
 * face is left clear for the padlock lying there.
 */
function drawFace(material: MeshStandardMaterial, icon: number, label: string): void {
  const base = material.map?.image as CanvasImageSource & { width?: number; height?: number } | undefined;
  const canvas = document.createElement('canvas');
  canvas.width = base?.width || 256;
  canvas.height = base?.height || 256;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = material.map?.flipY ?? false;
  texture.anisotropy = 4;
  const paint = (): void => {
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (base) ctx.drawImage(base, 0, 0, w, h);
    else {
      ctx.fillStyle = '#e9e1d2';
      ctx.fillRect(0, 0, w, h);
    }
    const atlas = iconAtlas();
    // The face's v runs from the player's side to the back; with the texture as glTF has it (no flip) the
    // canvas's top row is v = 0, the player's side. The padlock lies on the back fifth: keep it clear.
    if (atlas.complete && atlas.naturalWidth) {
      const tile = atlas.naturalWidth / 4;
      const size = h * 0.56;
      ctx.drawImage(atlas, (icon % 4) * tile, Math.floor(icon / 4) * tile, tile, tile, (w - size) / 2, h * 0.2, size, size);
    }
    ctx.fillStyle = 'rgba(60, 44, 32, 0.85)';
    ctx.font = `600 ${Math.round(h * 0.13)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h * 0.1);
    texture.needsUpdate = true;
  };
  paint();
  const atlas = iconAtlas();
  if (!atlas.complete) atlas.addEventListener('load', paint, { once: true });
  material.map = texture;
  material.needsUpdate = true;
}
