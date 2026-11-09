/**
 * The café's hands: the player's tracked hands drawn to match the night at
 * the café, in place of the stock white outline. Each hand is a soft,
 * translucent paper-lantern shape, warm cream with a faint inner glow, and
 * a thin amber rim at its edge, so it reads clearly over the dimmed room
 * and against the café's lights without hiding what it is over. The glow
 * brightens as the fingers pinch, so taking hold of something shows in
 * the hand itself.
 *
 * It uses IWSDK's own tracked hand mesh (the generic hand model, posed
 * from the joints every frame); only its materials are ours. Installed
 * with `themeHands(world)` once the world exists.
 */

import { AnimatedHand, BackSide, Color, MeshStandardMaterial, ShaderMaterial, SkinnedMesh, type VisualConstructor, type VisualImplementation, type World } from '@iwsdk/core';

/** The hand's look. */
export const HAND = {
  skin: 0xf4dfc4,
  /** How see-through the hand is (0 clear, 1 solid): clear enough to see a button under a fingertip. */
  opacity: 0.32,
  glow: 0xff9a4a,
  /** The inner glow at rest and when pinched. */
  glowRest: 0.07,
  glowPinch: 0.4,
  rim: 0xffc07a,
  rimOpacity: 0.85,
  /** How far the rim stands out from the hand (metres). */
  rimWidth: 0.0014,
};

/** The thin amber edge: the hand drawn again from behind, a little larger, so only its silhouette shows. */
function rimMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      rimColor: { value: new Color(HAND.rim) },
      rimOpacity: { value: HAND.rimOpacity },
      rimWidth: { value: HAND.rimWidth },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      uniform float rimWidth;
      void main() {
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        vec3 transformed = position + normal * rimWidth;
        #include <skinning_vertex>
        gl_Position = projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 rimColor;
      uniform float rimOpacity;
      void main() {
        gl_FragColor = vec4( rimColor, rimOpacity );
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    transparent: true,
    depthWrite: false,
  });
}

/** The hand itself: translucent warm skin with a glow that grows toward its edges and with the pinch. */
function skinMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: HAND.skin,
    roughness: 0.75,
    metalness: 0,
    transparent: true,
    opacity: HAND.opacity,
    emissive: HAND.glow,
    emissiveIntensity: HAND.glowRest,
  });
  // Add a rim term to the emissive (three's `emissive` uniform already carries the intensity):
  // brighter where the surface turns away from the eye.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float cafeRim = pow( 1.0 - saturate( dot( normalize( vViewPosition ), normal ) ), 2.5 );
      totalEmissiveRadiance += emissive * cafeRim * 2.0;`,
    );
  };
  material.customProgramCacheKey = () => 'cafe-hand';
  return material;
}

/** Built on the stock hand (the only exported hand visual); `init` is replaced wholesale, so none of its outline is set up. */
export class CafeHand extends AnimatedHand {
  static assetKeyPrefix = 'cafe-hand';
  static assetProfileId = 'generic-hand';
  private skin: MeshStandardMaterial | null = null;

  init(): void {
    const mesh = this.model.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh | undefined;
    if (!mesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.skin = skinMaterial();
    mesh.material = this.skin;
    mesh.renderOrder = 998;
    const rim = mesh.clone();
    rim.material = rimMaterial();
    rim.renderOrder = 999;
    mesh.parent?.add(rim);
  }

  update(): void {
    super.update();
    if (!this.skin) return;
    const pinch = this.xrInput?.getPinchStrength() ?? 0;
    this.skin.emissiveIntensity = HAND.glowRest + (HAND.glowPinch - HAND.glowRest) * pinch * pinch;
  }
}

/** Draw both hands as the café's hands. */
export function themeHands(world: World): void {
  const visual = CafeHand as unknown as VisualConstructor<VisualImplementation>;
  world.input.xr.visualAdapters.hand.left.updateVisualImplementation(visual);
  world.input.xr.visualAdapters.hand.right.updateVisualImplementation(visual);
}
