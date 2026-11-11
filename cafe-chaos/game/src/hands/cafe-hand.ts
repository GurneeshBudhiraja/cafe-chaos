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
 *
 * Installed with `themeHands(world)`.
 */

import { AnimatedHand, Color, MeshStandardMaterial, Vector3, type IUniform, type Mesh, type VisualConstructor, type VisualImplementation, type World } from '@iwsdk/core';
import { foldParts } from '../lib/fold-parts.js';

/** The hand's look, on top of the model's own cream and sage. */
export const HAND = {
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
    const cream = creamMaterial(segments[0].material as MeshStandardMaterial, this.uniforms);
    for (const segment of segments) segment.material = cream;
    // One mesh for the whole hand, its bones the joint nodes the headset poses.
    foldParts(root, segments, 'CafeHand-Skin');
    // The cuff is not a joint: it rides with the wrist.
    if (cuff) {
      const sage = (cuff.material as MeshStandardMaterial).clone();
      sage.emissive = new Color(sage.color);
      sage.emissiveIntensity = HAND.lift.strength * 0.6;
      cuff.material = sage;
      wrist.attach(cuff);
    }
  }

  update(): void {
    super.update();
    const pinch = this.xrInput?.getPinchStrength() ?? 0;
    this.uniforms.cafePinch.value = pinch * pinch;
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

/** Draw both hands as the café's hands. */
export function themeHands(world: World): void {
  const as = (visual: unknown): VisualConstructor<VisualImplementation> => visual as VisualConstructor<VisualImplementation>;
  world.input.xr.visualAdapters.hand.left.updateVisualImplementation(as(CafeHandLeft));
  world.input.xr.visualAdapters.hand.right.updateVisualImplementation(as(CafeHandRight));
}
