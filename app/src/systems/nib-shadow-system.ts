/**
 * NibShadowSystem: a soft dark spot on the page, straight under the held
 * pen's nib, like the shadow of a real pen under a desk lamp.
 *
 * In the headset you cannot feel the paper, so you cannot tell how far the
 * nib is from the page. The spot tells you: it appears 3 cm above the page
 * and grows smaller and darker as the nib comes down. While the pen inks it
 * stays at its smallest and darkest, so "darkest" always means "inking".
 * There is no flash or colour change on touch: the ink appearing is the
 * feedback.
 *
 * The spot is the `nib-shadow` model (made in Blender: a 1 cm unlit square
 * with a soft round gradient in the ink colour). It is a child of the page
 * mesh, so it moves and fades with the tablet, and it only shows over the
 * page, never on the bezel.
 *
 * The pen's body casts a shadow too, as under a ceiling light: a soft streak
 * from the spot along the direction the pen leans (the model's
 * `PenBodyShadow`, stretched over where the pen's lower 11 cm falls on the
 * page). It shows from a little higher than the spot, and grows fainter and
 * wider as the pen rises.
 *
 * Drawing order: the page, then this spot, then the ink. The spot must stay
 * under the ink or fresh strokes look dirty.
 */

import {
  AssetManager,
  CustomBlending,
  createSystem,
  Mesh,
  MeshBasicMaterial,
  OneMinusSrcAlphaFactor,
  Quaternion,
  SrcAlphaFactor,
  Vector3,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import {
  SURFACE_HEIGHT_M,
  SURFACE_WIDTH_M,
  WRITING_SURFACE_NAME,
} from '../scene-assets/tablet.scene-asset.js';
import { getPen, type PenState } from '../ui/pen-state.js';
import { INK_RENDER_ORDER, PEN_LIFT_M, PEN_TOUCH_M } from './ink-system.js';

const TABLET_NODE = 'tablet';
/** Asset ID of the Blender model, and the name of its mesh. */
const NIB_SHADOW_ASSET = 'nib-shadow';
const NIB_SHADOW_MESH = 'NibShadow';
/** Width of the model's square (metres); the spot is scaled from this. */
const MODEL_SIZE_M = 0.01;
/** Lifted this far off the paper (metres) so it does not flicker into it. Ink sits higher. */
const LIFT_OFF_PAGE_M = 0.0005;

/** Above this height (metres) the spot is gone; it fades out over the last FADE_BAND. */
const SHOW_BELOW_M = 0.03;
const FADE_BAND_M = 0.004;

/**
 * The spot at three heights, from the asset brief. Between them it eases
 * (smoothstep), never steps. At or below PEN_TOUCH_M it is at its smallest.
 */
const NEAR = { heightM: PEN_TOUCH_M, diameterM: 0.004, opacity: 0.45 };
/** The pen body's shadow: how much of the pen behind the nib casts it, its width, and from what nib height it shows. */
const BODY_MESH = 'PenBodyShadow';
const BODY_REACH_M = 0.11;
const BODY_WIDTH_M = 0.009;
const BODY_SHOW_BELOW_M = 0.07;
const BODY_OPACITY = 0.22;
/**
 * The light that casts the body's shadow comes from above and to the left,
 * like the environment's window: each point's shadow moves this far across
 * the page (x right, y toward the far edge) per metre of its height. A
 * straight-down light would hide the shadow under the pen from the seat.
 */
const LIGHT_SLANT_X = 0.45;
const LIGHT_SLANT_Y = -0.35;
const MID = { heightM: 0.01, diameterM: 0.008, opacity: 0.25 };
const FAR = { heightM: SHOW_BELOW_M, diameterM: 0.014, opacity: 0.08 };

const Z_AXIS = new Vector3(0, 0, 1);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class NibShadowSystem extends createSystem({}) {
  private pen!: PenState;
  private surface: Mesh | null = null;
  private spot: Mesh | null = null;
  private material: MeshBasicMaterial | null = null;
  private body: Mesh | null = null;
  private bodyMaterial: MeshBasicMaterial | null = null;
  private stylus: Object3D | null = null;
  /** The writing point's distance from the pen's centre, along its axis. */
  private nibOffsetM = 0.0775;
  private readonly tail = new Vector3();
  private readonly flat = new Quaternion();
  private readonly turn = new Quaternion();
  /** Follows InkSystem's rule: once inking, the nib stays down until it lifts past PEN_LIFT_M. */
  private inking = false;
  private readonly local = new Vector3();

  init(): void {
    const tabletEntity: Entity | undefined = this.world.getSceneEntity(TABLET_NODE);
    const surface = tabletEntity?.object3D?.getObjectByName(WRITING_SURFACE_NAME);
    if (!(surface instanceof Mesh)) {
      console.warn('[NibShadowSystem] Tablet missing from the scene.');
      return;
    }
    this.pen = getPen(this.world);
    this.surface = surface;
    // PenSystem (registered before this system) has already placed the pen on the tablet.
    this.stylus = tabletEntity?.object3D?.getObjectByName('Stylus') ?? null;
    this.nibOffsetM = this.stylus?.getObjectByName('NibTip')?.position.x ?? this.nibOffsetM;
    this.flat.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

    AssetManager.loadGLTFById(NIB_SHADOW_ASSET)
      .then(() => this.attachSpot(surface))
      .catch((error: unknown) => console.warn('[NibShadowSystem] Could not load the nib shadow.', error));
  }

  /** Put a copy of the model on the page, with its own material. */
  private attachSpot(surface: Mesh): void {
    // A fresh copy of the model; its material is still shared, so clone that too.
    const gltf = AssetManager.getGLTF(NIB_SHADOW_ASSET);
    const spot = gltf?.scene.getObjectByName(NIB_SHADOW_MESH);
    if (!(spot instanceof Mesh) || !(spot.material instanceof MeshBasicMaterial)) {
      console.warn('[NibShadowSystem] The nib shadow model has no unlit mesh named NibShadow.');
      return;
    }
    const material = spot.material.clone();
    // Blended like a see-through material, but kept in the solid pass
    // (transparent: false with custom blending): three.js draws every solid
    // object before every see-through one, and the ink is solid, so this is
    // the only way the spot can be drawn before the ink.
    material.transparent = false;
    material.blending = CustomBlending;
    material.blendSrc = SrcAlphaFactor;
    material.blendDst = OneMinusSrcAlphaFactor;
    material.depthWrite = false;
    material.opacity = 0;
    spot.material = material;
    spot.renderOrder = INK_RENDER_ORDER - 1;
    // The model lies flat (facing +Y); the page faces +Z.
    spot.rotation.set(Math.PI / 2, 0, 0);
    spot.position.set(0, 0, LIFT_OFF_PAGE_M);
    spot.visible = false;
    // Rays pass through it, so drawing with a ray over the spot still works.
    spot.raycast = () => {};
    (spot as unknown as { pointerEvents: string }).pointerEvents = 'none';
    surface.add(spot);
    this.spot = spot;
    this.material = material;

    // The pen body's streak: the same kind of material, drawn just before the spot.
    const body = gltf?.scene.getObjectByName(BODY_MESH);
    if (body instanceof Mesh && body.material instanceof MeshBasicMaterial) {
      const bodyMaterial = material.clone();
      bodyMaterial.map = body.material.map;
      body.material = bodyMaterial;
      body.renderOrder = INK_RENDER_ORDER - 1;
      body.visible = false;
      body.raycast = () => {};
      (body as unknown as { pointerEvents: string }).pointerEvents = 'none';
      surface.add(body);
      this.body = body;
      this.bodyMaterial = bodyMaterial;
    }
  }

  update(): void {
    const spot = this.spot;
    const surface = this.surface;
    if (!spot || !surface || !this.material) return;

    if (!this.pen.held) {
      this.inking = false;
      spot.visible = false;
      if (this.body) this.body.visible = false;
      return;
    }

    // The nib in page space: x, y across the page, z its height above it.
    surface.updateWorldMatrix(true, false);
    const nib = surface.worldToLocal(this.local.copy(this.pen.nib));
    const height = Math.max(0, nib.z);
    const toEdge = Math.min(SURFACE_WIDTH_M / 2 - Math.abs(nib.x), SURFACE_HEIGHT_M / 2 - Math.abs(nib.y));

    this.inking = toEdge >= 0 && height < (this.inking ? PEN_LIFT_M : PEN_TOUCH_M);
    this.placeBodyShadow(surface, nib, height, toEdge);
    if (toEdge <= 0 || height >= SHOW_BELOW_M) {
      spot.visible = false;
      return;
    }

    let diameter: number;
    let opacity: number;
    if (this.inking || height <= NEAR.heightM) {
      diameter = NEAR.diameterM;
      opacity = NEAR.opacity;
    } else if (height <= MID.heightM) {
      const t = smoothstep(NEAR.heightM, MID.heightM, height);
      diameter = mix(NEAR.diameterM, MID.diameterM, t);
      opacity = mix(NEAR.opacity, MID.opacity, t);
    } else {
      const t = smoothstep(MID.heightM, FAR.heightM, height);
      diameter = mix(MID.diameterM, FAR.diameterM, t);
      opacity = mix(MID.opacity, FAR.opacity, t);
    }
    // Fade in from the top of the range instead of popping in, and fade out
    // as the spot reaches the page's edge so it never spills onto the bezel.
    opacity *= 1 - smoothstep(SHOW_BELOW_M - FADE_BAND_M, SHOW_BELOW_M, height);
    opacity *= smoothstep(0, diameter / 2, toEdge);

    spot.position.x = nib.x;
    spot.position.y = nib.y;
    spot.scale.setScalar(diameter / MODEL_SIZE_M);
    this.material.opacity = opacity;
    spot.visible = opacity > 0.001;
  }

  /**
   * The pen body's streak: from the nib's spot toward where the pen's lower
   * part falls on the page, cast by a light slanting in from the left.
   */
  private placeBodyShadow(surface: Mesh, nib: Vector3, height: number, toEdge: number): void {
    const body = this.body;
    const stylus = this.stylus;
    if (!body || !stylus || !this.bodyMaterial) return;
    const opacity = BODY_OPACITY * (1 - smoothstep(0.02, BODY_SHOW_BELOW_M, height)) * smoothstep(0, 0.004, toEdge);
    if (opacity <= 0.002) {
      body.visible = false;
      return;
    }
    // A point BODY_REACH_M up the pen from the nib, in page space.
    stylus.updateWorldMatrix(true, false);
    stylus.localToWorld(this.tail.set(this.nibOffsetM - BODY_REACH_M, 0, 0));
    surface.worldToLocal(this.tail);
    // Where the nib and that point cast their shadows (higher points move further).
    const tailHeight = Math.max(0, this.tail.z);
    const startX = nib.x + LIGHT_SLANT_X * height;
    const startY = nib.y + LIGHT_SLANT_Y * height;
    const dx = this.tail.x + LIGHT_SLANT_X * tailHeight - startX;
    const dy = this.tail.y + LIGHT_SLANT_Y * tailHeight - startY;
    const length = Math.hypot(dx, dy);
    if (length < 0.002) {
      body.visible = false;
      return;
    }
    // Lie flat on the page (the model faces +Y), then turn toward the tail.
    this.turn.setFromAxisAngle(Z_AXIS, Math.atan2(dy, dx));
    body.quaternion.copy(this.turn).multiply(this.flat);
    body.position.set(startX, startY, LIFT_OFF_PAGE_M - 0.0001);
    // Wider as the pen rises: a softer, more spread shadow.
    body.scale.set(length, 1, BODY_WIDTH_M + 0.25 * (height + tailHeight) / 2);
    this.bodyMaterial.opacity = opacity;
    body.visible = true;
  }
}
