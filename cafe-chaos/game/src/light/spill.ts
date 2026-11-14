/**
 * The light spill: how the café's light reaches the player's real table.
 * A wide disc lies on the table under the café, drawn additively, so it
 * only ever brightens what is behind it (the dimmed passthrough): the
 * lamps' pools and the house light pouring out of the café fall on it
 * and fade with distance, and where the door frame, rail and fence block
 * the house light their shadows lie on the real table. Nothing lights
 * the disc evenly, so it has no edge of its own.
 *
 * It is a matte (Lambert) material, the cheapest that is lit per pixel:
 * the disc covers a large part of the view, so its shader is kept light.
 * The indirect light (ambient, fill and environment) and the moon are
 * removed from its shader, so only the café's own lamps show on it.
 */

import { CanvasTexture, CircleGeometry, Color, CustomBlending, Mesh, MeshLambertMaterial, OneFactor, ShaderChunk, SrcAlphaFactor, ZeroFactor } from '@iwsdk/core';
import { SPILL, SPILL_RADIUS } from './mood.js';

/** The line in three's lighting chunk that reads a directional light (the moon is the only one). */
const MOON_CALL = 'getDirectionalLightInfo( directionalLight, directLight );';

/** The mask's size (pixels), and how far inside the table's edge the glow fades out (metres, café space). */
const MASK = { size: 256, soften: 0.03 };

/** A radial feather: solid, then a smooth fade to nothing at the rim, so the disc's own edge never shows. */
function drawFeather(ctx: CanvasRenderingContext2D): void {
  const size = MASK.size;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const solidTo = 0.55;
  g.addColorStop(0, '#fff');
  g.addColorStop(solidTo, '#fff');
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const v = Math.round(255 * (1 - t) ** 2.2);
    g.addColorStop(solidTo + (1 - solidTo) * t, `rgb(${v},${v},${v})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function featherTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MASK.size;
  drawFeather(canvas.getContext('2d')!);
  return new CanvasTexture(canvas);
}

/**
 * Cut the spill to the real table: `outline` is the table's edge in café
 * space (x, z), or null when there is no table under the café (then the
 * spill is hidden). Cheap enough to call when the café or the table moves.
 */
export function fitSpill(spill: Mesh, outline: readonly { x: number; z: number }[] | null): void {
  spill.visible = !!outline && outline.length >= 3;
  if (!spill.visible) return;
  const map = (spill.material as MeshLambertMaterial).alphaMap as CanvasTexture;
  const canvas = map.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const size = MASK.size;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, size, size);
  drawFeather(ctx);
  // The disc lies flat: its texture's u runs with café x, and (the texture flipped) its rows with café z.
  const px = (x: number): number => ((x / SPILL_RADIUS + 1) / 2) * size;
  const pz = (z: number): number => ((z / SPILL_RADIUS + 1) / 2) * size;
  const soften = (MASK.soften / (2 * SPILL_RADIUS)) * size;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.filter = `blur(${soften.toFixed(1)}px)`;
  ctx.beginPath();
  outline!.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
  map.needsUpdate = true;
}

export function makeSpill(): Mesh {
  const material = new MeshLambertMaterial({
    color: new Color(SPILL.color).multiplyScalar(SPILL.strength),
    transparent: true,
    // Add colour only, never alpha: the page's canvas is composited over the passthrough with
    // premultiplied alpha, so an ordinary additive blend would also cover the real table (and
    // darken it) wherever the disc lies. This way the disc can only brighten what is behind it.
    blending: CustomBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
    depthWrite: false,
    alphaMap: featherTexture(),
  });
  // Direct light from the lamps only: drop the chunk that adds the indirect (ambient, hemisphere,
  // environment) light, and zero the directional light (the moon) where it is read.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_fragment_end>', '')
      .replace('#include <lights_fragment_begin>', ShaderChunk.lights_fragment_begin.replace(MOON_CALL, `${MOON_CALL} directLight.color = vec3( 0.0 );`));
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
