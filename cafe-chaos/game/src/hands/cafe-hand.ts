/**
 * The café's hands: the player's tracked hands drawn as soft plush
 * hands in the café's warm cream, in place of the stock white outline.
 *
 * They are solid, so they belong in the scene with the café: a hand
 * reaching behind the door frame is hidden by it, a hand in front of a
 * table hides it, and a guest hangs from real-looking fingers. What
 * gives them their feel is all in the material:
 * - a matte cream body lit by the café's own lamps, with a little light
 *   of its own so it never goes muddy in the dimmed room;
 * - a fine felt grain, worked out from each point's place on the hand
 *   (so it stays put as the fingers bend, and needs no texture);
 * - a soft bright edge where the surface turns away from the eye, the
 *   way velvet catches light, which rounds the fingers;
 * - the tips of the thumb and forefinger glow amber as they close, so a
 *   pinch shows in the hand itself;
 * - the cut end at the wrist fades out instead of ending in a hard edge.
 *
 * The mesh is IWSDK's own tracked hand (the generic hand model, posed
 * from the headset's joints every frame); only its material is ours, so
 * this is code, not a modelled asset. Installed with `themeHands(world)`.
 */

import { AnimatedHand, Color, Matrix4, MeshStandardMaterial, Vector2, Vector3, type IUniform, type SkinnedMesh, type VisualConstructor, type VisualImplementation, type World } from '@iwsdk/core';

/** The hand's look. */
export const HAND = {
  /** The plush's colour, and how rough it is (1 is fully matte). */
  skin: 0xf6c9a0,
  roughness: 0.95,
  /**
   * Its own light: a warm peach at this strength. The room's fill light is
   * cool and dim, and without this the cream reads as grey; with it the
   * hands stay the colour of the café's lamp-lit paper wherever they are.
   */
  lift: { color: 0xf2a878, strength: 0.42 },
  /** The felt grain: how fine (cells per metre) and how strong (0 none). */
  grain: { scale: 2100, strength: 0.055 },
  /** The velvet edge light: colour, strength, and how tightly it hugs the edge (higher is tighter). */
  edge: { color: 0xffe2c2, strength: 0.42, power: 2.6 },
  /** The pinch glow at the thumb and forefinger tips: colour, strength when fully pinched, and its reach from each tip (metres). */
  pinch: { color: 0xff9440, strength: 1.6, reach: 0.034 },
  /** The wrist fades out over this length before the mesh's cut end (metres). */
  wristFade: 0.03,
};

/** The values that differ per hand, handed to its shader. */
interface HandUniforms {
  cafePinch: IUniform<number>;
  cafeWrist: IUniform<Vector2>;
  cafeThumbTip: IUniform<Vector3>;
  cafeIndexTip: IUniform<Vector3>;
}

/** The plush material for one hand. */
function plushMaterial(uniforms: HandUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: HAND.skin,
    roughness: HAND.roughness,
    metalness: 0,
    emissive: new Color(HAND.lift.color),
    emissiveIntensity: HAND.lift.strength,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      cafeEdgeColor: { value: new Color(HAND.edge.color).multiplyScalar(HAND.edge.strength) },
      cafePinchColor: { value: new Color(HAND.pinch.color).multiplyScalar(HAND.pinch.strength) },
    });
    // Each point's place on the hand at rest, before the joints bend it.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCafeRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCafeRest = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vCafeRest;
        uniform float cafePinch;
        uniform vec2 cafeWrist;
        uniform vec3 cafeThumbTip;
        uniform vec3 cafeIndexTip;
        uniform vec3 cafeEdgeColor;
        uniform vec3 cafePinchColor;
        // A small value noise over the hand's rest shape: the felt grain.
        float cafeHash( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
        float cafeGrain( vec3 p ) {
          vec3 i = floor( p ); vec3 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( mix( cafeHash( i ), cafeHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( cafeHash( i + vec3( 0, 1, 0 ) ), cafeHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                      mix( mix( cafeHash( i + vec3( 0, 0, 1 ) ), cafeHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( cafeHash( i + vec3( 0, 1, 1 ) ), cafeHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        // The wrist's cut end thins out to nothing (a fine dither, so the hand stays in the solid pass).
        float cafeSolid = 1.0 - smoothstep( cafeWrist.x, cafeWrist.y, vCafeRest.y );
        if ( cafeSolid < fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) ) discard;
        diffuseColor.rgb *= 1.0 - ${HAND.grain.strength.toFixed(3)} + ${(HAND.grain.strength * 2).toFixed(3)} * cafeGrain( vCafeRest * ${HAND.grain.scale.toFixed(1)} );`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 0.85 + 0.3 * cafeGrain( vCafeRest * ${HAND.grain.scale.toFixed(1)} );
        // The velvet edge, and the glow at the two pinching fingertips.
        float cafeEdge = pow( 1.0 - saturate( dot( normalize( vViewPosition ), normal ) ), ${HAND.edge.power.toFixed(2)} );
        totalEmissiveRadiance += cafeEdgeColor * cafeEdge;
        float cafeTip = max( 1.0 - distance( vCafeRest, cafeThumbTip ) / ${HAND.pinch.reach.toFixed(4)}, 1.0 - distance( vCafeRest, cafeIndexTip ) / ${HAND.pinch.reach.toFixed(4)} );
        totalEmissiveRadiance += cafePinchColor * cafePinch * smoothstep( 0.0, 1.0, cafeTip );`,
      );
  };
  material.customProgramCacheKey = () => 'cafe-hand-plush';
  return material;
}

/** Built on the stock hand (the only exported hand visual); `init` is replaced wholesale, so none of its outline is set up. */
export class CafeHand extends AnimatedHand {
  static assetKeyPrefix = 'cafe-hand';
  static assetProfileId = 'generic-hand';
  private readonly uniforms: HandUniforms = {
    cafePinch: { value: 0 },
    cafeWrist: { value: new Vector2(1, 2) },
    cafeThumbTip: { value: new Vector3() },
    cafeIndexTip: { value: new Vector3() },
  };

  init(): void {
    const mesh = this.model.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh | undefined;
    if (!mesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // Where things are on this hand at rest: the wrist's cut end (the mesh's top) and the two pinching fingertips.
    mesh.geometry.computeBoundingBox();
    const top = mesh.geometry.boundingBox!.max.y;
    this.uniforms.cafeWrist.value.set(top - HAND.wristFade, top);
    const rest = new Matrix4();
    mesh.skeleton.bones.forEach((bone, i) => {
      const tip = bone.name === 'thumb-tip' ? this.uniforms.cafeThumbTip : bone.name === 'index-finger-tip' ? this.uniforms.cafeIndexTip : null;
      tip?.value.setFromMatrixPosition(rest.copy(mesh.skeleton.boneInverses[i]).invert());
    });
    mesh.material = plushMaterial(this.uniforms);
    mesh.renderOrder = 0;
  }

  update(): void {
    super.update();
    const pinch = this.xrInput?.getPinchStrength() ?? 0;
    this.uniforms.cafePinch.value = pinch * pinch;
  }
}

/** Draw both hands as the café's hands. */
export function themeHands(world: World): void {
  const visual = CafeHand as unknown as VisualConstructor<VisualImplementation>;
  world.input.xr.visualAdapters.hand.left.updateVisualImplementation(visual);
  world.input.xr.visualAdapters.hand.right.updateVisualImplementation(visual);
}
