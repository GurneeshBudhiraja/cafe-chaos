/**
 * Paper grain for the tablet's writing surface: a small tiling texture of
 * warm white with fine grain and faint fibres, so the page reads as paper
 * under passthrough lighting instead of a flat white card (flat fields also
 * look like display defects in a headset).
 *
 * Generated deterministically from a seed (no DOM, no canvas), so the asset
 * manifest can build it in both the runtime and editor realms.
 */

import { DataTexture, RepeatWrapping, RGBAFormat, SRGBColorSpace } from '@iwsdk/core';
import { makeRandom } from './lib/hardsurface.js';

const SIZE = 256;
/** Warm white paper (#f4eee4). */
const BASE: [number, number, number] = [244, 238, 228];

export function createPaperGrainTexture(seed = 7): DataTexture {
  const random = makeRandom(seed);
  const data = new Uint8Array(SIZE * SIZE * 4);
  // Fine grain.
  for (let i = 0; i < SIZE * SIZE; i++) {
    const n = (random() - 0.5) * 5;
    data[i * 4] = BASE[0] + n;
    data[i * 4 + 1] = BASE[1] + n;
    data[i * 4 + 2] = BASE[2] + n * 0.9;
    data[i * 4 + 3] = 255;
  }
  // Faint fibres: short, slightly darker strokes in random directions.
  for (let f = 0; f < 140; f++) {
    let x = random() * SIZE;
    let y = random() * SIZE;
    const angle = random() * Math.PI * 2;
    const length = 6 + random() * 18;
    for (let s = 0; s < length; s++) {
      const px = ((Math.floor(x) % SIZE) + SIZE) % SIZE;
      const py = ((Math.floor(y) % SIZE) + SIZE) % SIZE;
      const i = (py * SIZE + px) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, data[i + c] - 6);
      x += Math.cos(angle);
      y += Math.sin(angle);
    }
  }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  // Tile it a few times across the page so the grain is paper-fine.
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}
