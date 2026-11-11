/**
 * UnlockSystem: the shop. Stone plaques lie in the gravel in front of the
 * café, each a thing to buy, its price on its face (game/rules.ts SHOP):
 * the garden annex, and more servers (the café opens with one). Pinch a
 * plaque with the money in the bank and it is bought: the padlock pops
 * off and the thing arrives (the annex rises off the café's left side;
 * a new server appears behind the counter and waves). Without the money,
 * the plaque gives a little shake and its price flashes coral.
 *
 * Once the annex is open the bigger café can take more staff: those
 * plaques appear only then. A server plaque, once bought, sinks away
 * into the gravel; the annex's stays, its padlock gone.
 *
 * The plaque is the Blender `unlock-plaque` (models/23-unlock-plaque): a
 * flat stone with a cream face and a brass padlock on it. The game draws
 * the face: the stone's own texture, the icon from the icon atlas
 * (`unlock-icons.png`), the name and the price. Each stands on one of the
 * shell's `PlaqueSpot-n` along the front strip.
 *
 * - A free hand that comes close lights a plaque up (a warm glow that
 *   breathes), the same cue a guest gives: pinch now and it is yours.
 * - Pinches near a plaque are its own, never the café's.
 * - The shop is open only while the game says so (`open`): not during
 *   the walkthrough's first steps, so a stray pinch buys nothing.
 *
 * In test mode (the checks and recordings) everything is free.
 */

import { AnimationMixer, AssetManager, CanvasTexture, Color, LoopOnce, LoopRepeat, SRGBColorSpace, Vector3, createSystem, type AnimationAction, type Mesh, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { SHOP, type ShopItem } from '../game/rules.js';
import { TEST_MODE } from '../game/save.js';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { BaristaSystem } from './barista-system.js';
import { CafeSystem, copyModel } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';
import { HoldSystem } from './hold-system.js';
import { ScoreSystem } from './score-system.js';

/** A pinch closing this near a plaque's grip presses it (metres, café space; never less than the world floor). */
const PRESS_RADIUS_M = 0.04;
const PRESS_RADIUS_WORLD_MIN_M = 0.03;
/** A hand this many press radii away already lights the plaque up. */
const HOVER_RADII = 1.4;
/** The glow: its colour, how bright at full, and how fast it breathes (per second). */
const GLOW = { color: 0xffc27a, strength: 0.55, rate: 2.2 };
/** The shake of a plaque the bank cannot pay for (seconds, radians), and how long a sold server plaque takes to sink away. */
const SHAKE = { seconds: 0.45, angle: 0.18 };
const SINK_SECONDS = 0.9;

export interface Plaque {
  item: ShopItem;
  root: Object3D;
  grip: Object3D;
  mixer: AnimationMixer;
  locked: AnimationAction | null;
  unlock: AnimationAction | null;
  stone: MeshStandardMaterial[];
  /** The face, drawn again when the price can or cannot be paid. */
  repaint: (state: FaceState) => void;
  face: FaceState | null;
  /** 0 to 1: how lit up it is. */
  glow: number;
  pressed: boolean;
  /** Seconds left of a shake; seconds it has been sinking (-1: not sinking). */
  shake: number;
  sinking: number;
}

/** How the face shows the price: can be paid, cannot, or flashing after a pinch that could not pay; or owned. */
type FaceState = 'afford' | 'short' | 'flash' | 'owned';

export class UnlockSystem extends createSystem({}) {
  /** The plaques out now, by item. */
  readonly plaques = new Map<ShopItem['id'], Plaque>();
  /** What has been bought. */
  readonly owned = new Set<ShopItem['id']>();
  /** The hand over a plaque this frame, if any (for the checks). */
  hovered: Hand | null = null;
  /** Set false to close the shop (pinches on plaques do nothing). */
  open = true;
  /** Told when something is bought (the game saves). */
  readonly bought: ((item: ShopItem) => void)[] = [];
  /** Pinches that could not pay, and purchases made (for the checks and sounds), and the grip of the plaque last pressed. */
  refused = 0;
  purchases = 0;
  lastPressed: Object3D | null = null;
  private cafe!: CafeSystem;
  private hold: HoldSystem | null = null;
  private guests: GuestSystem | null = null;
  private baristas: BaristaSystem | null = null;
  private score: ScoreSystem | null = null;
  private readonly previous: Record<Hand, boolean> = { left: false, right: false };
  private readonly at = new Vector3();
  private time = 0;
  private wantAnnex = false;

  /** The annex plaque, once its model has loaded (the checks and recordings press it). */
  get annexPlaque(): Plaque | null {
    return this.plaques.get('annex') ?? null;
  }

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    this.guests = this.world.getSystem(GuestSystem) ?? null;
    this.baristas = this.world.getSystem(BaristaSystem) ?? null;
    this.score = this.world.getSystem(ScoreSystem) ?? null;
    // A pinch on or around a plaque is the plaque's, never the café's.
    this.hold?.claims.push((point) => this.nearest(point, HOVER_RADII) !== null);
  }

  /** What an item costs now (nothing in test mode). */
  price(item: ShopItem): number {
    return TEST_MODE ? 0 : item.price;
  }

  /** Is this item on sale now (not owned, and what it needs is in place)? */
  onSale(item: ShopItem): boolean {
    if (this.owned.has(item.id)) return false;
    if (item.needsAnnex && !this.owned.has('annex')) return false;
    return !item.after || this.owned.has(item.after);
  }

  /**
   * Take an item as owned without buying it (a saved café coming back):
   * the annex opens at once, a server joins the staff.
   */
  restore(id: ShopItem['id']): void {
    if (this.owned.has(id)) return;
    this.owned.add(id);
    this.deliver(id);
    const plaque = this.plaques.get(id);
    if (plaque) this.retire(plaque, true);
  }

  update(frameDelta: number): void {
    const delta = Math.min(0.1, frameDelta);
    this.time += delta;
    // Pressed before the annex's models had loaded: open it as soon as they have.
    if (this.wantAnnex && this.cafe.openAnnex()) this.wantAnnex = false;
    this.stock();
    this.hovered = null;
    const hold = this.hold;
    let over: Plaque | null = null;
    if (hold && this.open && this.cafe.placed && !this.cafe.arriving) {
      for (const hand of HANDS) {
        const pinch = hold.pinch[hand];
        const fresh = pinch.closed && !this.previous[hand];
        this.previous[hand] = pinch.closed;
        // A tracked hand that is not carrying a guest or holding the café.
        if (pinch.gap === Infinity || pinch.ghost || hold.holding.includes(hand) || this.guests?.carriedBy(hand)) continue;
        const plaque = this.nearest(pinch.point, HOVER_RADII);
        if (!plaque) continue;
        this.hovered = hand;
        over = plaque;
        if (fresh && this.nearest(pinch.point, 1) === plaque) this.press(plaque.item.id);
      }
    }
    for (const plaque of this.plaques.values()) {
      plaque.mixer.update(delta);
      this.shine(plaque, plaque === over, delta);
      this.move(plaque, delta);
      if (!plaque.pressed) this.showPrice(plaque);
    }
  }

  /**
   * Press a plaque: bought if the bank can pay (the padlock pops off and
   * the thing arrives), refused with a shake if not. `press()` alone
   * presses the annex's (the checks and recordings).
   */
  press(id: ShopItem['id'] = 'annex'): boolean {
    const plaque = this.plaques.get(id);
    if (!plaque || plaque.pressed) return false;
    const item = plaque.item;
    const price = this.price(item);
    this.lastPressed = plaque.grip;
    if (this.score && price > 0 && !this.score.spend(price)) {
      this.refused++;
      plaque.shake = SHAKE.seconds;
      plaque.repaint('flash');
      plaque.face = 'flash';
      return false;
    }
    plaque.pressed = true;
    plaque.locked?.stop();
    plaque.unlock?.reset().play();
    plaque.repaint('owned');
    plaque.face = 'owned';
    this.owned.add(id);
    this.purchases++;
    this.deliver(id);
    // A server plaque sinks away once its padlock is off; the annex's stays.
    if (id !== 'annex') plaque.sinking = 0;
    for (const tell of this.bought) tell(item);
    return true;
  }

  /** Put the thing bought into the café. */
  private deliver(id: ShopItem['id']): void {
    if (id === 'annex') {
      if (!this.cafe.openAnnex()) this.wantAnnex = true;
    } else if (this.baristas) this.baristas.staffSize = Math.max(this.baristas.staffSize, 1 + SHOP.filter((i) => i.id !== 'annex' && this.owned.has(i.id)).length);
  }

  /** Put out a plaque for each item on sale (and the annex's once owned) whose spot is free. */
  private stock(): void {
    if (!AssetManager.getGLTF('unlock-plaque')) return;
    for (const item of SHOP) {
      const wanted = this.onSale(item) || (item.id === 'annex' && this.owned.has('annex'));
      if (!wanted || this.plaques.has(item.id)) continue;
      const plaque = this.build(item);
      if (!plaque) continue;
      this.plaques.set(item.id, plaque);
      if (this.owned.has(item.id)) this.retire(plaque, true);
    }
  }

  /** An owned plaque: its padlock gone and its face saying so (a server's simply goes). */
  private retire(plaque: Plaque, now: boolean): void {
    plaque.pressed = true;
    plaque.locked?.stop();
    plaque.root.getObjectByName('Padlock')?.scale.setScalar(0.0001);
    plaque.repaint('owned');
    plaque.face = 'owned';
    if (plaque.item.id !== 'annex') plaque.sinking = now ? SINK_SECONDS : 0;
  }

  /** The plaque nearest a world point within `radii` press radii of its grip (null: none). */
  private nearest(point: Vector3, radii: number): Plaque | null {
    let best: Plaque | null = null;
    let bestDistance = Infinity;
    const reach = Math.max(PRESS_RADIUS_WORLD_MIN_M, PRESS_RADIUS_M * this.cafe.cafe.scale.x) * radii;
    for (const plaque of this.plaques.values()) {
      if (plaque.pressed || !plaque.root.visible) continue;
      const d = plaque.grip.getWorldPosition(this.at).distanceTo(point);
      if (d < reach && d < bestDistance) {
        best = plaque;
        bestDistance = d;
      }
    }
    return best;
  }

  /** Keep the price's colour right: ink when the bank can pay, muted when it cannot. */
  private showPrice(plaque: Plaque): void {
    if (plaque.face === 'flash' && plaque.shake > 0) return;
    const state: FaceState = !this.score || (this.score.bank ?? 0) >= this.price(plaque.item) ? 'afford' : 'short';
    if (state === plaque.face) return;
    plaque.face = state;
    plaque.repaint(state);
  }

  /** The warm glow of a plaque a hand is over: it comes up quickly, breathes, and fades once the hand goes. */
  private shine(plaque: Plaque, over: boolean, delta: number): void {
    const want = over && !plaque.pressed ? 1 : 0;
    plaque.glow += (want - plaque.glow) * (1 - Math.exp(-10 * delta));
    const breath = 0.8 + 0.2 * Math.sin(this.time * GLOW.rate * Math.PI * 2);
    for (const material of plaque.stone) material.emissiveIntensity = plaque.glow * GLOW.strength * breath;
  }

  /** The shake of a refused pinch, and the sinking of a sold server plaque. */
  private move(plaque: Plaque, delta: number): void {
    if (plaque.shake > 0) {
      plaque.shake = Math.max(0, plaque.shake - delta);
      const t = plaque.shake / SHAKE.seconds;
      plaque.root.rotation.y = Math.sin(t * Math.PI * 6) * SHAKE.angle * t;
    }
    if (plaque.sinking >= 0) {
      plaque.sinking += delta;
      const t = Math.min(1, Math.max(0, (plaque.sinking - 0.8) / SINK_SECONDS));
      plaque.root.position.y = -0.02 * t;
      plaque.root.scale.setScalar(Math.max(0.0001, 1 - t));
      if (t >= 1) {
        plaque.root.removeFromParent();
        this.plaques.delete(plaque.item.id);
      }
    }
  }

  /** Put an item's plaque on its spot, its face drawn, its padlock rocking; null until its model has loaded. */
  private build(item: ShopItem): Plaque | null {
    const spot = this.cafe.cafe.getObjectByName(`PlaqueSpot-${item.spot}`);
    if (!spot) return null;
    const root = copyModel('unlock-plaque');
    root.userData.dynamic = true;
    spot.add(root);
    const grip = root.getObjectByName('Grip') ?? root;
    // Its own materials, so the glow and the face are this plaque's alone.
    const stone: MeshStandardMaterial[] = [];
    let repaint: (state: FaceState) => void = () => {};
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as MeshStandardMaterial).clone();
      mesh.material = material;
      if (node.name === 'PlaqueFace' || node.parent?.name === 'PlaqueFace') repaint = drawFace(material, item, this.price(item));
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
    return { item, root, grip, mixer, locked, unlock, stone, repaint, face: null, glow: 0, pressed: false, shake: 0, sinking: -1 };
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
 * the icon from the atlas, the name above it and the price (a coin and
 * the number) beside it. Returns a function that draws it again for a
 * state: the price in ink when the bank can pay, faded when it cannot,
 * coral just after a pinch that could not pay, and "OWNED" once bought.
 * The back fifth of the face is left clear for the padlock lying there.
 */
function drawFace(material: MeshStandardMaterial, item: ShopItem, price: number): (state: FaceState) => void {
  const base = material.map?.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
  const canvas = document.createElement('canvas');
  canvas.width = base?.width || 256;
  canvas.height = base?.height || 256;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = material.map?.flipY ?? false;
  texture.anisotropy = 4;
  let state: FaceState = 'afford';
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
    // The face's v runs from the player's side to the back; with the texture as glTF has it (no flip) the
    // canvas's top row is v = 0, the player's side. The padlock lies on the back fifth: keep it clear.
    const atlas = iconAtlas();
    const size = h * 0.44;
    const iconX = w * 0.08;
    if (atlas.complete && atlas.naturalWidth) {
      const tile = atlas.naturalWidth / 4;
      ctx.globalAlpha = state === 'short' ? 0.55 : 1;
      ctx.drawImage(atlas, (item.icon % 4) * tile, Math.floor(item.icon / 4) * tile, tile, tile, iconX, h * 0.22, size, size);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(60, 44, 32, 0.85)';
    ctx.font = `700 ${Math.round(h * 0.13)}px sans-serif`;
    ctx.fillText(item.label, w / 2, h * 0.1);
    // The price, beside the icon: a coin and the number; or OWNED once bought.
    const px = iconX + size + (w - iconX - size) / 2;
    const py = h * 0.44;
    if (state === 'owned') {
      ctx.fillStyle = 'rgba(47, 143, 91, 0.9)';
      ctx.font = `800 ${Math.round(h * 0.12)}px sans-serif`;
      ctx.fillText(item.id === 'annex' ? 'OPEN' : 'HIRED', px, py);
    } else {
      const r = h * 0.075;
      ctx.beginPath();
      ctx.arc(px - w * 0.11, py, r, 0, Math.PI * 2);
      ctx.fillStyle = state === 'short' ? 'rgba(246, 196, 69, 0.55)' : '#f6c445';
      ctx.fill();
      ctx.lineWidth = r * 0.2;
      ctx.strokeStyle = '#b8811c';
      ctx.stroke();
      ctx.fillStyle = state === 'flash' ? '#d9473a' : state === 'short' ? 'rgba(60, 44, 32, 0.45)' : 'rgba(60, 44, 32, 0.92)';
      ctx.font = `800 ${Math.round(h * 0.17)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(price === 0 ? 'FREE' : `${price}`, px - w * 0.11 + r * 1.5, py + h * 0.01);
    }
    texture.needsUpdate = true;
  };
  paint();
  const atlas = iconAtlas();
  if (!atlas.complete) atlas.addEventListener('load', paint, { once: true });
  material.map = texture;
  material.needsUpdate = true;
  return (next) => {
    state = next;
    paint();
  };
}
