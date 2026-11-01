/**
 * TabletEdgeSystem: the tablet's edge glow, the "grab here" hint.
 *
 * Writing and moving are separate: the page takes ink, and the tablet will
 * be moved and tilted by its edge (phase 2). With no visible handle, the
 * edge shows where to hold it: as a hand comes within about 6 cm of the
 * bezel (outside the page), a soft pool of warm-white light, about 8 cm
 * long, gathers on the rim nearest the hand and fades out along the edge.
 * At rest the rim shows nothing. While the tablet is held by its edge
 * (TabletEdgeState.grabbed, set by phase 2) the whole rim glows evenly with
 * a faint clay tint, and fades out about 220 ms after release. While the pen
 * is held the glow stays off, so writing near the edge does not light it.
 *
 * The glow is the `edge-glow` model (made in Blender: a thin ring lying
 * along the tablet's outer edge, in the tablet's own space). Its material is
 * replaced here by a small shader that lights only the part near the hand.
 * It is a child of the tablet, so it moves and fades with it.
 */

import {
  AdditiveBlending,
  AssetManager,
  Color,
  createSystem,
  Matrix4,
  Mesh,
  ShaderMaterial,
  Vector3,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import {
  SURFACE_HEIGHT_M,
  SURFACE_WIDTH_M,
  TABLET_HALF_WIDTH_M,
} from '../scene-assets/tablet.scene-asset.js';
import { createPinchReading, HANDS, readPinch, type HandFrame } from '../input/hand-pinch.js';
import { getPen, type PenState } from '../ui/pen-state.js';
import { getTabletEdge, type TabletEdgeState } from '../ui/tablet-edge-state.js';

const TABLET_NODE = 'tablet';
/** Asset ID of the Blender model, and the name of its mesh. */
const EDGE_GLOW_ASSET = 'edge-glow';
const EDGE_GLOW_MESH = 'EdgeGlow';

/** The tablet's outline in its own space (metres). The radius matches tablet.scene-asset.ts. */
const BEZEL_M = TABLET_HALF_WIDTH_M - SURFACE_WIDTH_M / 2;
const HALF_W = TABLET_HALF_WIDTH_M;
const HALF_H = SURFACE_HEIGHT_M / 2 + BEZEL_M;
const CORNER_RADIUS_M = 0.02;
/** The ring sits this far above the model's front glass (0.1 mm under it otherwise), so it never flickers into it. */
const RING_LIFT_M = 0.0004;

/** A hand closer than NEAR (metres) to the rim lights it, fully from FULL in. */
const NEAR_M = 0.06;
const FULL_M = 0.02;
/** The pool of light along the rim: full within POOL_CORE, gone by POOL_END from its centre (about 8 cm long). */
const POOL_CORE_M = 0.012;
const POOL_END_M = 0.04;
/** How fast the glow follows (seconds; it settles in about three of these). */
const RISE_S = 0.05;
const FALL_S = 0.07;

/** Strongest alpha of the glow, and of the whole-rim glow while held. Glow stays subtle. */
const NEAR_ALPHA = 0.7;
const GRAB_ALPHA = 0.45;
const WARM_WHITE = 0xf7f2ea;
const CLAY = 0xd4704f;
/** How much clay tints the whole-rim glow while held (0 to 1). */
const GRAB_CLAY_MIX = 0.35;

const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  varying float vAcross;
  void main() {
    vLocal = position;
    vAcross = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// vAcross runs 0 (inside the edge) to 1 (outside it); the ring's middle row,
// on the edge itself, is at uEdge. The glow peaks there and fades both ways.
const fragmentShader = /* glsl */ `
  uniform vec3 uFocus;
  uniform float uNear;
  uniform float uGrab;
  uniform float uEdge;
  uniform vec3 uWarm;
  uniform vec3 uClay;
  varying vec3 vLocal;
  varying float vAcross;
  void main() {
    float across = vAcross < uEdge
      ? smoothstep(0.0, uEdge, vAcross)
      : 1.0 - smoothstep(uEdge, 1.0, vAcross);
    float pool = 1.0 - smoothstep(${POOL_CORE_M.toFixed(4)}, ${POOL_END_M.toFixed(4)}, distance(vLocal, uFocus));
    float near = uNear * pool * ${NEAR_ALPHA.toFixed(3)};
    float held = uGrab * ${GRAB_ALPHA.toFixed(3)};
    vec3 color = mix(uWarm, mix(uWarm, uClay, ${GRAB_CLAY_MIX.toFixed(3)}), uGrab);
    gl_FragColor = vec4(color, across * max(near, held));
  }
`;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Ease `value` toward `target` over about three `seconds`, frame-rate independent. */
function approach(value: number, target: number, seconds: number, delta: number): number {
  return value + (target - value) * (1 - Math.exp(-delta / seconds));
}

export class TabletEdgeSystem extends createSystem({}) {
  private pen!: PenState;
  private edge!: TabletEdgeState;
  private tablet: Object3D | null = null;
  private ring: Mesh | null = null;
  private material: ShaderMaterial | null = null;
  private near = 0;
  private grab = 0;
  private readonly reading = createPinchReading();
  private readonly handFrame: HandFrame = { frame: null!, space: null!, origin: new Matrix4() };
  private readonly local = new Vector3();
  private readonly onRim = new Vector3();
  private readonly closestRim = new Vector3();
  /** Tablet space to the ring's own space (the model is Y-up; the tablet is Z-up). */
  private readonly tabletToRing = new Matrix4();

  init(): void {
    const tabletEntity: Entity | undefined = this.world.getSceneEntity(TABLET_NODE);
    const tablet = tabletEntity?.object3D;
    if (!tablet) {
      console.warn('[TabletEdgeSystem] Tablet missing from the scene.');
      return;
    }
    this.pen = getPen(this.world);
    this.edge = getTabletEdge(this.world);

    AssetManager.loadGLTFById(EDGE_GLOW_ASSET)
      .then(() => this.attachGlow(tablet))
      .catch((error: unknown) => console.warn('[TabletEdgeSystem] Could not load the edge glow.', error));
  }

  /** Put the ring on the tablet with its own shader material. */
  private attachGlow(tablet: Object3D): void {
    const ring = AssetManager.getGLTF(EDGE_GLOW_ASSET)?.scene.getObjectByName(EDGE_GLOW_MESH);
    if (!(ring instanceof Mesh)) {
      console.warn('[TabletEdgeSystem] The edge glow model has no mesh named EdgeGlow.');
      return;
    }
    // The ring's middle row (on the edge) sits at this fraction across it.
    const across = ring.geometry.getAttribute('uv');
    let edge = 0.5;
    for (let i = 0; i < across.count; i++) {
      const v = across.getY(i);
      if (v > 0.01 && v < 0.99) {
        edge = v;
        break;
      }
    }
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uFocus: { value: new Vector3() },
        uNear: { value: 0 },
        uGrab: { value: 0 },
        uEdge: { value: edge },
        uWarm: { value: new Color(WARM_WHITE) },
        uClay: { value: new Color(CLAY) },
      },
      // Light adds to what is behind it, so the rim brightens like a real glow
      // on the dark bezel and on a light desk alike.
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    ring.material = material;
    // The model lies flat (facing +Y); the tablet's page faces +Z.
    ring.rotation.set(Math.PI / 2, 0, 0);
    ring.position.z = RING_LIFT_M;
    ring.updateMatrix();
    this.tabletToRing.copy(ring.matrix).invert();
    ring.visible = false;
    // Rays pass through it: it is a hint, not a target.
    ring.raycast = () => {};
    (ring as unknown as { pointerEvents: string }).pointerEvents = 'none';
    tablet.add(ring);
    this.tablet = tablet;
    this.ring = ring;
    this.material = material;
  }

  update(delta: number): void {
    const { tablet, ring, material } = this;
    if (!tablet || !ring || !material) return;
    if (!tablet.visible) {
      this.near = 0;
      this.grab = 0;
      ring.visible = false;
      return;
    }

    const nearTarget = this.pen.held ? 0 : this.closestHandNearness(tablet);
    const grabTarget = this.edge.grabbed && !this.pen.held ? 1 : 0;
    this.near = approach(this.near, nearTarget, nearTarget > this.near ? RISE_S : FALL_S, delta);
    this.grab = approach(this.grab, grabTarget, grabTarget > this.grab ? RISE_S : FALL_S, delta);
    // While a hand is near, the pool follows it; while it fades, it stays put.
    // The shader works in the ring's own space, so the point is moved into it.
    if (nearTarget > 0) (material.uniforms.uFocus.value as Vector3).copy(this.closestRim).applyMatrix4(this.tabletToRing);
    material.uniforms.uNear.value = this.near;
    material.uniforms.uGrab.value = this.grab;
    ring.visible = this.near > 0.002 || this.grab > 0.002;
  }

  /**
   * How near the closest tracked hand is to the rim (0 far, 1 touching), and
   * the rim point nearest it in `closestRim` (tablet space). A hand over the
   * page counts as writing, not reaching for the edge.
   */
  private closestHandNearness(tablet: Object3D): number {
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    if (!frame || !space) return 0;
    this.handFrame.frame = frame;
    this.handFrame.space = space;
    this.handFrame.origin.copy(this.player.matrixWorld);
    tablet.updateWorldMatrix(true, false);
    let best = Infinity;
    for (const hand of HANDS) {
      if (!readPinch(this.world.input.xr.getPrimaryInputSource(hand), this.handFrame, this.reading)) continue;
      const local = tablet.worldToLocal(this.local.copy(this.reading.point));
      if (Math.abs(local.x) < SURFACE_WIDTH_M / 2 && Math.abs(local.y) < SURFACE_HEIGHT_M / 2) continue;
      this.nearestRimPoint(local.x, local.y, this.onRim);
      const distance = Math.hypot(local.x - this.onRim.x, local.y - this.onRim.y, local.z);
      if (distance < best) {
        best = distance;
        this.closestRim.copy(this.onRim);
      }
    }
    return 1 - smoothstep(FULL_M, NEAR_M, best);
  }

  /** The point on the tablet's rounded outline nearest (x, y), into `out` (z = 0). */
  private nearestRimPoint(x: number, y: number, out: Vector3): void {
    const innerX = HALF_W - CORNER_RADIUS_M;
    const innerY = HALF_H - CORNER_RADIUS_M;
    const cx = Math.min(innerX, Math.max(-innerX, x));
    const cy = Math.min(innerY, Math.max(-innerY, y));
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) {
      out.set(cx + (dx / d) * CORNER_RADIUS_M, cy + (dy / d) * CORNER_RADIUS_M, 0);
    } else if (HALF_W - Math.abs(x) < HALF_H - Math.abs(y)) {
      out.set(Math.sign(x) * HALF_W, y, 0);
    } else {
      out.set(x, Math.sign(y) * HALF_H, 0);
    }
  }
}
