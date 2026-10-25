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
 * - a frosted body: milky white glass with a soft top-to-bottom light
 *   gradient and fine grain (no dark tint). Passthrough cannot be blurred by a WebXR app (the system
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
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from '@iwsdk/core';
import type { PanelElement } from './panel-helpers.js';

export interface LiquidGlassOptions {
  /** Corner radius in UIKit pixels; match the element's border-radius. */
  radiusPx: number;
  /** Width of the curved edge in UIKit pixels. */
  bevelPx?: number;
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
    vec3 body = mix(vec3(0.84, 0.87, 0.91), vec3(0.96, 0.97, 0.99), vUv.y);
    body += (grainNoise(floor(p)) - 0.5) * 0.04;

    // Sheen band that slides with the viewing angle across the panel.
    vec2 viewOnPanel = vec2(dot(v, vTangent), dot(v, vBitangent));
    float band = dot(vUv - 0.5 + viewOnPanel * 0.7, normalize(vec2(1.0, -0.65)));
    float sheen = smoothstep(0.24, 0.0, abs(band + 0.12)) * 0.07;

    // Gloss: light caught just inside the top edge, fading downwards.
    float gloss = smoothstep(uBevel * 3.0, 0.0, halfSize.y - p.y) * 0.07;

    vec3 color = body + sheen + innerGlow + gloss;
    color += spec * 1.2 + fill + fresnel * 0.45;
    color = mix(color, vec3(1.0), rim * rimLit * 0.9);

    float alpha = 0.26 + 0.06 * vUv.y + sheen + gloss;
    alpha += spec * 0.6 + fill * 0.5 + fresnel * 0.35 + innerGlow + rim * rimLit * 0.6;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0) * mask);
  }
`;

/**
 * Put a liquid-glass slab behind `element` (a UIKit element whose own
 * background should be transparent). Returns the mesh; it is removed and
 * disposed through `cleanupFuncs`.
 */
export function attachLiquidGlass(
  element: PanelElement,
  cleanupFuncs: Array<() => void>,
  { radiusPx, bevelPx = 16 }: LiquidGlassOptions,
): Mesh {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uSize: { value: new Vector2(1, 1) },
      uRadius: { value: radiusPx },
      uBevel: { value: bevelPx },
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
  return mesh;
}
