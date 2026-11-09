/**
 * The light spill: how the café's light reaches the player's real table.
 * A wide disc lies on the table under the café, drawn additively, so it
 * only ever brightens what is behind it (the dimmed passthrough): the
 * lamps' pools fall on it and fade with distance, the key light washes
 * it warm, and where the café blocks that light the disc stays dark, so
 * the building's shadow lies on the real table. Its edge feathers out,
 * because light has a reach.
 *
 * It is a standard material with the indirect light (ambient, fill and
 * environment) removed from its shader, so only the café's own lights
 * show on it.
 */

import { AdditiveBlending, CanvasTexture, CircleGeometry, Color, Mesh, MeshStandardMaterial, ShaderChunk } from '@iwsdk/core';
import { SPILL, SPILL_RADIUS } from './mood.js';

/** The line in three's lighting chunk that reads a directional light (the key light is the only one). */
const KEY_CALL = 'getDirectionalLightInfo( directionalLight, directLight );';

/** A radial feather: solid under the café, then a smooth fade to nothing at the rim (light has a reach). */
function featherTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const solidTo = 0.3;
  g.addColorStop(0, '#fff');
  g.addColorStop(solidTo, '#fff');
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const v = Math.round(255 * (1 - t) ** 2.2);
    g.addColorStop(solidTo + (1 - solidTo) * t, `rgb(${v},${v},${v})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

export function makeSpill(): Mesh {
  const material = new MeshStandardMaterial({
    color: new Color(SPILL.color).multiplyScalar(SPILL.strength),
    roughness: 1,
    metalness: 0,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    alphaMap: featherTexture(),
  });
  // Direct light only, and the key light at a fraction: drop the chunk that adds the indirect
  // (ambient, hemisphere, environment) light, and scale the directional light where it is read.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_fragment_end>', '')
      .replace('#include <lights_fragment_begin>', ShaderChunk.lights_fragment_begin.replace(KEY_CALL, `${KEY_CALL} directLight.color *= ${SPILL.keyShare.toFixed(3)};`));
  };
  material.customProgramCacheKey = () => 'cafe-spill';
  const disc = new Mesh(new CircleGeometry(SPILL_RADIUS, 64), material);
  disc.name = 'LightSpill';
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.0008;
  disc.receiveShadow = true;
  disc.renderOrder = -10;
  return disc;
}
