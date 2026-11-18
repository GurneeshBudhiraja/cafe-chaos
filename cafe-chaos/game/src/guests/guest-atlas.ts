/**
 * One texture per species for everything a guest draws: its skin, the
 * clothes it can wear, and a white patch for the plain-coloured face parts
 * (eyes, mouth, blush, the hairpin), so a guest can be drawn with one
 * material, and so in one draw call (guests/actor.ts folds every part into
 * one skinned mesh).
 *
 * Laid out top to bottom (texture space, as glTF has it: v grows down,
 * the texture is not flipped):
 * - the skin, then its top rows again under it: the skin's own texture
 *   coordinates run a little past the bottom (v up to about 1.13) and
 *   wrap round to the top, which the copy carries on in place;
 * - a gap, then the clothes' atlas;
 * - a gap, then the white patch.
 * The gaps keep the smaller mip levels of one from bleeding into the next.
 */

import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from '@iwsdk/core';

/** Rows of the skin repeated under it, as a share of its height (its texture coordinates reach v 1.128). */
const WRAP = 0.16;
/** Pixels between the regions. */
const GAP = 16;
/** The white patch's size (pixels). */
const WHITE = 16;

/** Where a region sits in the atlas: a texture coordinate (u, v) of the region maps to (u * su + ou, v * sv + ov). */
export interface Region {
  su: number;
  sv: number;
  ou: number;
  ov: number;
}

export interface GuestAtlas {
  texture: CanvasTexture;
  skin: Region;
  clothes: Region;
  /** The middle of the white patch. */
  white: { u: number; v: number };
}

const atlases = new Map<string, GuestAtlas>();

type Drawable = CanvasImageSource & { width: number; height: number };

/** The atlas for a skin texture and a clothes texture (made once, then shared by every guest of the species). */
export function guestAtlas(skin: Texture, clothes: Texture | null): GuestAtlas {
  const key = `${skin.uuid}|${clothes?.uuid ?? ''}`;
  const known = atlases.get(key);
  if (known) return known;
  const skinImage = skin.image as Drawable;
  const clothesImage = (clothes?.image as Drawable | undefined) ?? null;
  const sw = skinImage.width;
  const sh = skinImage.height;
  const wrap = Math.ceil(sh * WRAP);
  const cw = clothesImage?.width ?? 0;
  const ch = clothesImage?.height ?? 0;
  const width = Math.max(sw, cw, WHITE);
  const clothesTop = sh + wrap + GAP;
  const whiteTop = clothesTop + ch + GAP;
  const height = whiteTop + WHITE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(skinImage, 0, 0);
  // The skin's top rows again under it (where its wrapped coordinates land).
  ctx.drawImage(skinImage, 0, 0, sw, wrap, 0, sh, sw, wrap);
  if (clothesImage) ctx.drawImage(clothesImage, 0, clothesTop);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, whiteTop, WHITE, WHITE);
  const texture = new CanvasTexture(canvas);
  texture.name = `GuestAtlas-${skin.name || 'skin'}`;
  texture.colorSpace = SRGBColorSpace;
  // As the glTF textures: rows top to bottom, not flipped.
  texture.flipY = false;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = skin.anisotropy;
  const atlas: GuestAtlas = {
    texture,
    skin: { su: sw / width, sv: sh / height, ou: 0, ov: 0 },
    clothes: { su: cw / width, sv: ch / height, ou: 0, ov: clothesTop / height },
    white: { u: WHITE / 2 / width, v: (whiteTop + WHITE / 2) / height },
  };
  atlases.set(key, atlas);
  return atlas;
}

/** Every atlas made so far (the warm-up uploads them before the first guest needs one). */
export function allAtlases(): GuestAtlas[] {
  return [...atlases.values()];
}
