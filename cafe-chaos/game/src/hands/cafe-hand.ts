/**
 * The café's hands: the player's tracked hands drawn as the café's own
 * minimal cream hands (models/20-hands: `cafe-hand-left.glb` and
 * `-right.glb`), in place of the stock white outline.
 *
 * The model is a matte cream hand of soft tapered finger segments with
 * ball joints (so bends stay continuous), a plain rounded palm and a
 * thin sage cuff. It needs no skinning of its own: each segment is a
 * node named after a WebXR hand joint, and IWSDK's hand visual poses
 * every such node from the headset's joints each frame.
 *
 * What this file adds:
 * - The 21 cream segments are folded into one skinned mesh whose bones
 *   are those joint nodes (lib/fold-parts.ts), so a hand is two draw
 *   calls (the hand and its cuff), not 22.
 * - The hands are solid, so they belong in the scene with the café: a
 *   hand behind the door frame is hidden by it, and a guest hangs from
 *   real-looking fingers.
 * - The cream is warmed a little and keeps a warm light of its own (the
 *   night's fill is a dim blue, and the plain cream reads as lilac grey
 *   in it), with a soft bright edge where the surface turns away from
 *   the eye, which rounds the fingers.
 * - The tips of the thumb and forefinger glow amber as they close, so a
 *   pinch shows in the hand itself.
 * - The segments are modelled for one hand's proportions, but the
 *   headset reports the player's own joints, so on any other hand a
 *   fixed-length segment would fall short of the next knuckle or run
 *   through it. Each frame every segment is stretched (or shortened)
 *   along its length to reach exactly from its joint to the next, and
 *   the palm to the first knuckles and as wide as the hand's spread,
 *   so the hand stays in one piece whatever its size.
 *
 * The game plays in passthrough, where the player's real hands are
 * always in view (the dimmer only tints the cameras), so a model hand
 * is drawn over a real one and the two never quite agree: a solid hand
 * hides part of the real one and reads as a second hand on top of it.
 * `HAND.style` chooses:
 * - 'occluded' (the default): the player's own hands, in front of the
 *   café wherever they really are in front of it. Nothing of the hand
 *   is drawn; an unseen copy of the tracked hand is put into the depth
 *   buffer before anything else, so the café is not drawn where the
 *   hand covers it and the cameras' picture of the real hand shows
 *   there instead (see `OccludingHand`);
 * - 'outline': IWSDK's own grey hand, a faint outline that fades
 *   toward the wrist and sits around the real hand rather than over
 *   it. The café is still drawn over the real hand;
 * - 'cream': the café's solid cream hands;
 * - 'real': nothing drawn, the player's own hands only.
 *
 * Installed with `themeHands(world)`.
 */

import { AnimatedHand, Color, MeshStandardMaterial, ShaderMaterial, Vector3, type IUniform, type Mesh, type Object3D, type VisualConstructor, type VisualImplementation, type World } from '@iwsdk/core';
import { foldParts } from '../lib/fold-parts.js';

/**
 * Each finger's segments, in order from the knuckle: a segment is named
 * after the joint it starts from and reaches to the next joint named.
 */
const FINGERS: readonly (readonly string[])[] = [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ...['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].map((f) => [`${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`]),
];
/** The palm (the wrist's segment) reaches from the wrist to this knuckle, and spans these two. */
const PALM = { reach: 'middle-finger-phalanx-proximal', across: ['index-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal'] as const };
/** How far a segment may be stretched or shortened from its modelled length. */
const STRETCH = { min: 0.6, max: 1.5 };

/** A segment, the joint its far end reaches, and the modelled distance between them. */
interface Span {
  node: Object3D;
  far: Object3D;
  rest: number;
}

type HandStyle = 'occluded' | 'outline' | 'cream' | 'real';
/** 'occluded' unless the address asks for another (`?hands=cream`): for trying the styles on the headset, and for pictures that need a hand in them. */
function handStyle(): HandStyle {
  const asked = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hands') : null;
  return asked === 'outline' || asked === 'cream' || asked === 'real' ? asked : 'occluded';
}

/** The hand's look, on top of the model's own cream and sage. */
export const HAND = {
  /**
   * 'occluded': the real hands, shown in front of the café where they
   * are in front of it. 'outline': IWSDK's stock outline hand (it
   * surrounds the real hand instead of covering it). 'cream': the cream
   * model hands, solid, so they cover the real hand and read as a second
   * hand on top of it. 'real': no model at all (the café draws over the
   * real hands).
   */
  style: handStyle(),
  /**
   * The unseen hand that hides the café ('occluded'). It is the tracked
   * hand model grown outward by `grow` metres, so the edge of the real
   * hand (and the little the tracking lags behind it) stays clear of the
   * café; too much and a rim of the room shows around the hand.
   * `outline` also draws IWSDK's faint outline around it.
   */
  occluder: { grow: 0.0025, outline: false },
  /**
   * The night's fill light is a dim blue, and the model's near-white
   * cream takes it on and reads as lilac grey. Two things keep it cream:
   * the base colour is warmed by this tint, and the hand has a warm light
   * of its own at this strength.
   */
  tint: 0xffdcb8,
  lift: { color: 0xf4c49a, strength: 0.42 },
  /** The edge light: colour, strength, and how tightly it hugs the edge (higher is tighter). */
  edge: { color: 0xffe6cc, strength: 0.35, power: 2.6 },
  /** The pinch glow at the thumb and forefinger tips: colour, strength when fully pinched, and its reach from each tip (metres). */
  pinch: { color: 0xff9440, strength: 1.5, reach: 0.036 },
};

/** The values that differ per hand, handed to its shader. */
interface HandUniforms {
  cafePinch: IUniform<number>;
  cafeThumbTip: IUniform<Vector3>;
  cafeIndexTip: IUniform<Vector3>;
}

/** The model's cream, with the lift, the edge light and the pinch glow added. */
function creamMaterial(source: MeshStandardMaterial, uniforms: HandUniforms): MeshStandardMaterial {
  const material = source.clone();
  material.color.multiply(new Color(HAND.tint));
  material.emissive = new Color(HAND.lift.color);
  material.emissiveIntensity = HAND.lift.strength;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      cafeEdgeColor: { value: new Color(HAND.edge.color).multiplyScalar(HAND.edge.strength) },
      cafePinchColor: { value: new Color(HAND.pinch.color).multiplyScalar(HAND.pinch.strength) },
    });
    // Each point's place on the hand at rest, before the joints move it.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCafeRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCafeRest = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vCafeRest;
        uniform float cafePinch;
        uniform vec3 cafeThumbTip;
        uniform vec3 cafeIndexTip;
        uniform vec3 cafeEdgeColor;
        uniform vec3 cafePinchColor;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        // The soft edge, and the glow at the two pinching fingertips.
        float cafeEdge = pow( 1.0 - saturate( dot( normalize( vViewPosition ), normal ) ), ${HAND.edge.power.toFixed(2)} );
        totalEmissiveRadiance += cafeEdgeColor * cafeEdge;
        float cafeTip = max( 1.0 - distance( vCafeRest, cafeThumbTip ) / ${HAND.pinch.reach.toFixed(4)}, 1.0 - distance( vCafeRest, cafeIndexTip ) / ${HAND.pinch.reach.toFixed(4)} );
        totalEmissiveRadiance += cafePinchColor * cafePinch * smoothstep( 0.0, 1.0, cafeTip );`,
      );
  };
  material.customProgramCacheKey = () => 'cafe-hand-cream';
  return material;
}

/**
 * Built on IWSDK's hand visual for its joint posing (`update` poses
 * every node named after a joint); `init` is replaced wholesale, since
 * the stock one expects its own skinned outline hand.
 */
class CafeHand extends AnimatedHand {
  static assetKeyPrefix = 'cafe-hand';
  private readonly uniforms: HandUniforms = {
    cafePinch: { value: 0 },
    cafeThumbTip: { value: new Vector3() },
    cafeIndexTip: { value: new Vector3() },
  };
  /** The finger segments, each stretched to its next joint every frame. */
  private readonly spans: Span[] = [];
  /** The palm: the wrist's segment, its length to the first knuckle and its width across the knuckles, with the cuff that rides on it. */
  private palm: { span: Span; across: [Object3D, Object3D]; width: number; cuff: Mesh | undefined } | null = null;

  init(): void {
    const wrist = this.model.getObjectByName('wrist');
    const root = wrist?.parent;
    if (!wrist || !root) return;
    // The cream segments (every mesh but the cuff), in their rest places.
    const segments: Mesh[] = [];
    let cuff: Mesh | undefined;
    this.model.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (mesh.name === 'cuff') cuff = mesh;
      else segments.push(mesh);
    });
    if (segments.length === 0) return;
    // Where the two pinching fingertips are at rest, for the glow.
    root.updateMatrixWorld(true);
    const tipOf = (name: string, out: Vector3): void => {
      const tip = this.model.getObjectByName(name);
      if (tip) root.worldToLocal(tip.getWorldPosition(out));
    };
    tipOf('thumb-tip', this.uniforms.cafeThumbTip.value);
    tipOf('index-finger-tip', this.uniforms.cafeIndexTip.value);
    this.measure(root, wrist, cuff);
    const cream = creamMaterial(segments[0].material as MeshStandardMaterial, this.uniforms);
    for (const segment of segments) segment.material = cream;
    // One mesh for the whole hand, its bones the joint nodes the headset poses.
    const skin = foldParts(root, segments, 'CafeHand-Skin');
    // The cuff is not a joint: it rides with the wrist.
    if (cuff) {
      const sage = (cuff.material as MeshStandardMaterial).clone();
      sage.emissive = new Color(sage.color);
      sage.emissiveIntensity = HAND.lift.strength * 0.6;
      cuff.material = sage;
      wrist.attach(cuff);
    }
    // Real hands only: the model is still the thing the SDK poses and the pinch reads from, but nothing of it is drawn.
    // (The model's own `visible` is reset by the SDK every frame, so the meshes are hidden instead.)
    if (HAND.style === 'real') {
      if (skin) skin.visible = false;
      if (cuff) cuff.visible = false;
    }
  }

  /** Note each segment's modelled length (the rest pose), to stretch it from later. */
  private measure(root: Object3D, wrist: Object3D, cuff: Mesh | undefined): void {
    const node = (name: string): Object3D | undefined => this.model.getObjectByName(name);
    // Every segment is a direct child of the root, so its position is the joint's place in the hand's space.
    const span = (from: Object3D | undefined, to: Object3D | undefined): Span | null =>
      from && to && from.parent === root && to.parent === root ? { node: from, far: to, rest: from.position.distanceTo(to.position) } : null;
    for (const finger of FINGERS) {
      for (let i = 0; i + 1 < finger.length; i++) {
        const s = span(node(finger[i]), node(finger[i + 1]));
        if (s && s.rest > 0.001) this.spans.push(s);
      }
    }
    const reach = span(wrist, node(PALM.reach));
    const across: [Object3D | undefined, Object3D | undefined] = [node(PALM.across[0]), node(PALM.across[1])];
    if (reach && reach.rest > 0.001 && across[0]?.parent === root && across[1]?.parent === root) {
      const width = across[0].position.distanceTo(across[1].position);
      if (width > 0.001) this.palm = { span: reach, across: [across[0], across[1]], width, cuff };
    }
  }

  update(): void {
    super.update();
    this.fit();
    const pinch = this.xrInput?.getPinchStrength() ?? 0;
    this.uniforms.cafePinch.value = pinch * pinch;
  }

  /**
   * Stretch each segment along its length (the joint's -Z) to reach the
   * next joint where the headset now puts it, and the palm to the first
   * knuckles and across the hand's spread. The skinned hand follows its
   * bones' scale, so the cream stays continuous at every knuckle.
   */
  private fit(): void {
    const ratio = (live: number, rest: number): number => Math.min(STRETCH.max, Math.max(STRETCH.min, live / rest));
    for (const s of this.spans) s.node.scale.z = ratio(s.node.position.distanceTo(s.far.position), s.rest);
    const palm = this.palm;
    if (!palm) return;
    const wrist = palm.span.node;
    const sz = ratio(wrist.position.distanceTo(palm.span.far.position), palm.span.rest);
    const sx = ratio(palm.across[0].position.distanceTo(palm.across[1].position), palm.width);
    wrist.scale.set(sx, 1, sz);
    // The cuff rides on the wrist but is a ring of its own size: undo the palm's stretch on it.
    palm.cuff?.scale.set(1 / sx, 1, 1 / sz);
  }
}

/**
 * The hand that hides the café behind it, so the player's real hand is
 * seen in front.
 *
 * In passthrough the page draws over the cameras' picture: wherever the
 * page leaves a pixel untouched (clear), the real world shows. So the
 * real hand cannot be drawn over the café, but the café can be left out
 * where the hand is. This is IWSDK's tracked hand model (posed from the
 * headset's joints every frame) with a material that writes depth and
 * no colour, drawn before everything else: anything further away than
 * the hand then fails the depth test there and is not drawn, and the
 * real hand shows through. Things nearer than the hand (a guest held
 * between the fingers and the eye) still draw over it, as they should.
 */
const occluderMaterial = new ShaderMaterial({
  uniforms: { grow: { value: HAND.occluder.grow } },
  vertexShader: /* glsl */ `
    #include <common>
    #include <skinning_pars_vertex>
    uniform float grow;
    void main() {
      #include <skinbase_vertex>
      #include <beginnormal_vertex>
      #include <skinnormal_vertex>
      #include <defaultnormal_vertex>
      vec3 transformed = position + normal * grow;
      #include <skinning_vertex>
      gl_Position = projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 );
    }`,
  fragmentShader: /* glsl */ `void main() { gl_FragColor = vec4( 0.0 ); }`,
  colorWrite: false,
  depthWrite: true,
  depthTest: true,
});
/** Before the dimmer and the café (both sort after this). */
const OCCLUDER_ORDER = -2000;

class OccludingHand extends AnimatedHand {
  // Its own cache entry, so it is not handed a stock outline hand made earlier.
  static assetKeyPrefix = 'cafe-occluding-hand';

  init(): void {
    super.init();
    // The stock hand is two skinned meshes: the body (it writes depth, but among the see-through things, after the café is drawn) and the outline.
    this.model.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.renderOrder === 999) mesh.visible = HAND.occluder.outline;
      else {
        mesh.name = 'HandOccluder';
        mesh.material = occluderMaterial;
        mesh.renderOrder = OCCLUDER_ORDER;
      }
    });
  }
}

const modelUrl = (side: 'left' | 'right'): string => `${import.meta.env.BASE_URL}models/cafe-hand-${side}.glb`;

/** Each hand has its own model (the right is the left's mirror) and its own cache entry. */
class CafeHandLeft extends CafeHand {
  static assetProfileId = 'cafe-hand-left';
  static assetPath = modelUrl('left');
}
class CafeHandRight extends CafeHand {
  static assetProfileId = 'cafe-hand-right';
  static assetPath = modelUrl('right');
}

/** Draw both hands as the café's hands (or leave IWSDK's outline hands, for 'outline'). */
export function themeHands(world: World): void {
  if (HAND.style === 'outline') return;
  const as = (visual: unknown): VisualConstructor<VisualImplementation> => visual as VisualConstructor<VisualImplementation>;
  if (HAND.style === 'occluded') {
    world.input.xr.visualAdapters.hand.left.updateVisualImplementation(as(OccludingHand));
    world.input.xr.visualAdapters.hand.right.updateVisualImplementation(as(OccludingHand));
    return;
  }
  world.input.xr.visualAdapters.hand.left.updateVisualImplementation(as(CafeHandLeft));
  world.input.xr.visualAdapters.hand.right.updateVisualImplementation(as(CafeHandRight));
}
