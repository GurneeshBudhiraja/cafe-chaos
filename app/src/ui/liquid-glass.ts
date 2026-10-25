/**
 * Liquid glass: a shader-drawn glass slab behind a UIKit element.
 *
 * UIKit panels are flat colour, so the window's glass is a separate mesh
 * beside the root element (UIKit only accepts UIKit children). The root's
 * world matrix is scaled to the element's size, so a 1x1 plane that copies
 * it before each render covers the window exactly, including when compact
 * mode shrinks it.
 *
 * What the shader draws (all lighting is view dependent, so it moves as the
 * head moves, which is what makes glass read as glass in a headset):
 * - a body: either a photo (the lock-screen wallpaper, cover-fitted, with a
 *   slight parallax so it reads as depth behind the glass) or milky frosted
 *   glass with a soft light gradient and fine grain; setImageMix blends; Passthrough cannot be blurred by a WebXR app (the system
 *   composites it under the app layer), so the frost is what keeps the
 *   text readable over a busy room;
 * - a rounded bevel along the edge whose normals bend light: a sharp
 *   specular catch-light (key light from the top left), a softer fill
 *   from the bottom right, and Fresnel brightening at grazing angles;
 * - a thin bright rim, stronger on the lit top-left edge, an inner glow and
 *   a soft gloss just inside the top edge;
 * - a faint sheen band that slides with the viewing angle (parallax).
 *
 * No textures and no discard (cheap on Quest's tiled GPU). Per frame the CPU
 * only copies one matrix; the size uniform changes only with the layout.
 */

import {
  DoubleSide,
  Matrix4,
  Mesh,
  NoColorSpace,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  type Texture,
} from '@iwsdk/core';
import type { PanelElement } from './panel-helpers.js';

export interface LiquidGlassOptions {
  /** Corner radius in UIKit pixels; match the element's border-radius. */
  radiusPx: number;
  /** Width of the curved edge in UIKit pixels. */
  bevelPx?: number;
  /** Draw the bevel highlights, rim, inner glow and top gloss (default on). */
  edgeHighlights?: boolean;
  /** Opacity of the frosted body (0.26 default: see-through glass). */
  frostAlpha?: number;
}

/** Handle for a glass slab: the mesh plus controls for its photo body. */
export interface LiquidGlass {
  mesh: Mesh;
  /** Use `texture` as the body photo (cover-fitted to the slab). */
  setImage(texture: Texture): void;
  /** 0 shows frosted glass, 1 shows the photo. */
  setImageMix(mix: number): void;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    // The plane is only rotated and scaled, so the model axes give its frame.
    vTangent = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
    vBitangent = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    vNormal = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 uSize;     // element size in UIKit pixels
  uniform float uRadius;  // corner radius, pixels
  uniform float uBevel;   // curved edge width, pixels
  uniform sampler2D uImage;
  uniform float uImageAspect; // image width / height
  uniform float uImageMix;    // 0 frosted glass, 1 photo
  uniform float uEdge;        // 1 draws edge highlights, 0 a clean edge
  uniform float uFrostAlpha;  // opacity of the frosted body

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;

  // Signed distance to a rounded rectangle (negative inside), in pixels.
  float roundedBox(vec2 p, vec2 halfSize, float r) {
    vec2 q = abs(p) - halfSize + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  float grainNoise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 halfSize = uSize * 0.5;
    vec2 p = (vUv - 0.5) * uSize;
    float d = roundedBox(p, halfSize, uRadius);
    float aa = max(fwidth(d), 1e-3);
    float mask = 1.0 - smoothstep(-aa, aa, d);

    // Outward edge direction from the distance field.
    vec2 grad = vec2(
      roundedBox(p + vec2(1.0, 0.0), halfSize, uRadius) - roundedBox(p - vec2(1.0, 0.0), halfSize, uRadius),
      roundedBox(p + vec2(0.0, 1.0), halfSize, uRadius) - roundedBox(p - vec2(0.0, 1.0), halfSize, uRadius)
    );
    grad = length(grad) > 1e-4 ? normalize(grad) : vec2(0.0);

    // Bevel: 1 at the very edge, easing to 0 over uBevel pixels inward.
    float bevel = 1.0 - clamp(-d / uBevel, 0.0, 1.0);
    bevel *= bevel;
    vec3 n = normalize(vNormal + (vTangent * grad.x + vBitangent * grad.y) * bevel * 1.6);

    vec3 v = normalize(cameraPosition - vWorldPos);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float fresnel = pow(1.0 - ndv, 3.0) * bevel;

    vec3 keyLight = normalize(vec3(-0.55, 0.85, 0.6));
    vec3 fillLight = normalize(vec3(0.6, -0.55, 0.5));
    float spec = pow(max(dot(n, normalize(keyLight + v)), 0.0), 70.0) * bevel;
    float fill = pow(max(dot(n, normalize(fillLight + v)), 0.0), 28.0) * bevel * 0.35;

    // Thin rim, brighter on the edge facing the key light.
    float rim = 1.0 - smoothstep(0.0, 2.4, -d);
    float rimLit = 0.45 + 0.55 * clamp(dot(grad, normalize(vec2(-0.55, 0.85))) * 0.5 + 0.5, 0.0, 1.0);
    float innerGlow = exp(d / 12.0) * 0.16;

    // Frosted body: milky white glass, brighter towards the top, with grain.
    vec3 frost = mix(vec3(0.84, 0.87, 0.91), vec3(0.96, 0.97, 0.99), vUv.y);
    frost += (grainNoise(floor(p)) - 0.5) * 0.04;

    vec2 viewOnPanel = vec2(dot(v, vTangent), dot(v, vBitangent));

    // Photo body: cover-fit the image, zoom in slightly and shift it against
    // the viewing angle so it sits a little "behind" the glass.
    float panelAspect = uSize.x / uSize.y;
    vec2 imageUv = vUv - 0.5;
    if (panelAspect > uImageAspect) imageUv.y *= uImageAspect / panelAspect;
    else imageUv.x *= panelAspect / uImageAspect;
    imageUv = imageUv / 1.05 - viewOnPanel * 0.02 + 0.5;
    // Dimmed, and darker towards the bottom where the cards sit (as lock
    // screens do), so the lime text keeps its contrast over bright scenery.
    float scrim = mix(0.4, 0.84, smoothstep(0.1, 0.8, vUv.y));
    vec3 photo = texture2D(uImage, imageUv).rgb * scrim;

    vec3 body = mix(frost, photo, uImageMix);

    // Sheen band that slides with the viewing angle across the panel.
    float band = dot(vUv - 0.5 + viewOnPanel * 0.7, normalize(vec2(1.0, -0.65)));
    float sheen = smoothstep(0.24, 0.0, abs(band + 0.12)) * 0.07;

    // Gloss: light caught just inside the top edge, fading downwards.
    float gloss = smoothstep(uBevel * 3.0, 0.0, halfSize.y - p.y) * 0.07 * uEdge;
    spec *= uEdge;
    fill *= uEdge;
    fresnel *= uEdge;
    rim *= uEdge;
    innerGlow *= uEdge;

    vec3 color = body + sheen + innerGlow + gloss;
    color += spec * 1.2 + fill + fresnel * 0.45;
    color = mix(color, vec3(1.0), rim * rimLit * 0.9);

    float alpha = mix(uFrostAlpha + 0.06 * vUv.y, 0.97, uImageMix) + sheen + gloss;
    alpha += spec * 0.6 + fill * 0.5 + fresnel * 0.35 + innerGlow + rim * rimLit * 0.6;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0) * mask);
  }
`;

/**
 * Put a liquid-glass slab behind `element` (a UIKit element whose own
 * background should be transparent). It is removed and disposed through
 * `cleanupFuncs`.
 */
export function attachLiquidGlass(
  element: PanelElement,
  cleanupFuncs: Array<() => void>,
  { radiusPx, bevelPx = 16, edgeHighlights = true, frostAlpha = 0.26 }: LiquidGlassOptions,
): LiquidGlass {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uSize: { value: new Vector2(1, 1) },
      uRadius: { value: radiusPx },
      uBevel: { value: bevelPx },
      uImage: { value: null },
      uImageAspect: { value: 1 },
      uImageMix: { value: 0 },
      uEdge: { value: edgeHighlights ? 1 : 0 },
      uFrostAlpha: { value: frostAlpha },
    },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.name = 'LiquidGlass';
  mesh.renderOrder = -1; // drawn before the element's own content
  // Follow the element: copy its world matrix (plus a small push behind it)
  // right before rendering. three.js computes the model-view matrix after
  // onBeforeRender, so this frame already uses the copied matrix.
  const behind = new Matrix4().makeTranslation(0, 0, -0.01);
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = () => {
    mesh.matrixWorld.multiplyMatrices(element.matrixWorld, behind);
  };
  const host = element.parent;
  if (!host) throw new Error('attachLiquidGlass: element is not in the scene yet.');
  host.add(mesh);

  // Keep the shader's pixel size in step with the layout (compact mode).
  const size = (element as unknown as {
    size: { subscribe(fn: (value: [number, number] | undefined) => void): () => void };
  }).size;
  const unsubscribe = size.subscribe((value) => {
    if (value) material.uniforms.uSize.value.set(value[0], value[1]);
  });

  cleanupFuncs.push(() => {
    unsubscribe();
    host.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
  });

  return {
    mesh,
    setImage(texture) {
      // The shader writes display colours directly (no colour management),
      // so sample the photo's sRGB values as they are.
      texture.colorSpace = NoColorSpace;
      texture.needsUpdate = true;
      const image = texture.image as { width?: number; height?: number } | undefined;
      material.uniforms.uImage.value = texture;
      material.uniforms.uImageAspect.value =
        image?.width && image.height ? image.width / image.height : 1.6;
    },
    setImageMix(mix) {
      material.uniforms.uImageMix.value = mix;
    },
  };
}
