/**
 * Painted-at-runtime textures for the cake: the layered side (sponge with
 * its crumb pores, jam, cream, frosting), the frosted top with its soft
 * swirls, and matching roughness so the jam glistens while the sponge stays
 * matte. Canvas-drawn, repeatable (hashed noise, no Math.random), made
 * once and shared.
 */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from '@iwsdk/core';

export interface LayerSpec {
  height: number;
  color: string;
  /** How matte the layer is (1 matte, 0 glossy). */
  roughness: number;
  look: 'sponge' | 'jam' | 'cream' | 'frosting';
}

/** Repeatable noise in [0, 1). */
function hash(a: number, b: number, k = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function makeTexture(canvas: HTMLCanvasElement, srgb: boolean): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  if (srgb) texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * The side of the cake: the layers stacked bottom (v = 0) to top (v = 1),
 * `metresAcross` of cake per repeat along u. Returns the colour map and
 * the roughness map.
 */
export function createLayerTextures(layers: LayerSpec[], metresAcross: number): { map: Texture; roughnessMap: Texture } {
  const w = 1024;
  const h = 512;
  const total = layers.reduce((sum, l) => sum + l.height, 0);
  const map = document.createElement('canvas');
  const rough = document.createElement('canvas');
  map.width = rough.width = w;
  map.height = rough.height = h;
  const ctx = map.getContext('2d')!;
  const rctx = rough.getContext('2d')!;
  // Canvas y runs down; v = 0 (the bottom layer) is at the canvas bottom.
  let y1 = h;
  layers.forEach((layer, index) => {
    const bandH = (layer.height / total) * h;
    const y0 = y1 - bandH;
    ctx.fillStyle = layer.color;
    ctx.fillRect(0, y0, w, bandH);
    const grey = Math.round(layer.roughness * 255);
    rctx.fillStyle = `rgb(${grey},${grey},${grey})`;
    rctx.fillRect(0, y0, w, bandH);
    const pxPerMetre = w / metresAcross;
    if (layer.look === 'sponge') {
      // Pores: small dark holes of varied size, denser than they look big.
      const count = Math.round((bandH / h) * 9000);
      for (let i = 0; i < count; i++) {
        const x = hash(i, index, 1) * w;
        const y = y0 + hash(i, index, 2) * bandH;
        const r = 0.6 + hash(i, index, 3) * 2.2;
        ctx.fillStyle = `rgba(120, 78, 30, ${0.25 + hash(i, index, 4) * 0.4})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.6 + hash(i, index, 5) * 0.6), hash(i, index, 6) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // Lighter crumb flecks, and a toasted edge where the sponge meets the next layer.
      for (let i = 0; i < count / 3; i++) {
        const x = hash(i, index, 7) * w;
        const y = y0 + hash(i, index, 8) * bandH;
        ctx.fillStyle = `rgba(255, 240, 200, ${0.18 + hash(i, index, 9) * 0.25})`;
        ctx.fillRect(x, y, 1 + hash(i, index, 10) * 2, 1 + hash(i, index, 11));
      }
      const toast = ctx.createLinearGradient(0, y0, 0, y1);
      toast.addColorStop(0, 'rgba(170, 110, 50, 0.28)');
      toast.addColorStop(0.12, 'rgba(170, 110, 50, 0)');
      toast.addColorStop(0.88, 'rgba(170, 110, 50, 0)');
      toast.addColorStop(1, 'rgba(170, 110, 50, 0.28)');
      ctx.fillStyle = toast;
      ctx.fillRect(0, y0, w, bandH);
    } else if (layer.look === 'jam') {
      // Glossy jam: a bright streak and a few seeds.
      const shine = ctx.createLinearGradient(0, y0, 0, y1);
      shine.addColorStop(0, 'rgba(255, 150, 160, 0.0)');
      shine.addColorStop(0.35, 'rgba(255, 170, 180, 0.35)');
      shine.addColorStop(0.6, 'rgba(120, 10, 30, 0.15)');
      shine.addColorStop(1, 'rgba(90, 0, 20, 0.35)');
      ctx.fillStyle = shine;
      ctx.fillRect(0, y0, w, bandH);
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = 'rgba(70, 20, 10, 0.8)';
        ctx.fillRect(hash(i, index, 12) * w, y0 + 2 + hash(i, index, 13) * (bandH - 4), 2, 2);
      }
    } else if (layer.look === 'cream') {
      // Whipped cream: soft lighter and darker smears.
      for (let i = 0; i < 160; i++) {
        const x = hash(i, index, 14) * w;
        const light = hash(i, index, 15) > 0.5;
        ctx.fillStyle = light ? 'rgba(255, 255, 255, 0.35)' : 'rgba(225, 205, 180, 0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y0 + bandH * (0.3 + hash(i, index, 16) * 0.4), 6 + hash(i, index, 17) * 14, bandH * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Frosting: faint vertical smears from the spatula.
      for (let i = 0; i < 300; i++) {
        const x = hash(i, index, 18) * w;
        ctx.fillStyle = hash(i, index, 19) > 0.5 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(210, 140, 160, 0.18)';
        ctx.fillRect(x, y0, 1 + hash(i, index, 20) * 2, bandH);
      }
    }
    // A thin shadow line where the layers meet.
    ctx.fillStyle = 'rgba(80, 40, 20, 0.35)';
    ctx.fillRect(0, y0, w, 1);
    void pxPerMetre;
    y1 = y0;
  });
  return { map: makeTexture(map, true), roughnessMap: makeTexture(rough, false) };
}

/** The frosted top: pink buttercream with soft spatula swirls (one repeat per `metres` of cake). */
export function createFrostingTextures(color: string): { map: Texture; roughnessMap: Texture } {
  const size = 1024;
  const map = document.createElement('canvas');
  const rough = document.createElement('canvas');
  map.width = map.height = rough.width = rough.height = size;
  const ctx = map.getContext('2d')!;
  const rctx = rough.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  rctx.fillStyle = 'rgb(120,120,120)';
  rctx.fillRect(0, 0, size, size);
  // Swirls: translucent arcs, lighter on one edge, darker on the other, like spread cream.
  for (let i = 0; i < 420; i++) {
    const cx = hash(i, 1) * size;
    const cy = hash(i, 2) * size;
    const r = 30 + hash(i, 3) * 120;
    const a0 = hash(i, 4) * Math.PI * 2;
    const a1 = a0 + 0.6 + hash(i, 5) * 1.6;
    const width = 6 + hash(i, 6) * 14;
    ctx.lineCap = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.06 + hash(i, 7) * 0.1})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
    ctx.lineWidth = width * 0.5;
    ctx.strokeStyle = `rgba(200, 120, 150, ${0.05 + hash(i, 8) * 0.09})`;
    ctx.beginPath();
    ctx.arc(cx + width * 0.45, cy + width * 0.45, r, a0, a1);
    ctx.stroke();
    // Ridges are a touch shinier.
    rctx.lineCap = 'round';
    rctx.lineWidth = width;
    rctx.strokeStyle = `rgba(80, 80, 80, ${0.12 + hash(i, 9) * 0.12})`;
    rctx.beginPath();
    rctx.arc(cx, cy, r, a0, a1);
    rctx.stroke();
  }
  // Fine grain.
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = hash(i, 10) > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(180,110,130,0.1)';
    ctx.fillRect(hash(i, 11) * size, hash(i, 12) * size, 1.5, 1.5);
  }
  return { map: makeTexture(map, true), roughnessMap: makeTexture(rough, false) };
}

/** A strawberry's skin: red, darker at the stem end, with staggered pale seeds in little pits (u around, v base to tip). */
export function createStrawberryTexture(): Texture {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const skin = ctx.createLinearGradient(0, h, 0, 0);
  skin.addColorStop(0, '#8f1420');
  skin.addColorStop(0.25, '#c4202c');
  skin.addColorStop(0.8, '#d8303a');
  skin.addColorStop(1, '#e8505a');
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, w, h);
  // Seeds: rows around the berry, each row offset by half a step, fewer toward the tip.
  const rows = 9;
  for (let r = 0; r < rows; r++) {
    const v = 0.12 + (r / rows) * 0.78;
    const count = Math.max(4, Math.round(14 * (1 - v * 0.55)));
    for (let k = 0; k < count; k++) {
      const u = ((k + (r % 2) * 0.5) / count) % 1;
      const x = u * w;
      const y = h - v * h;
      // The pit (a soft dark hollow) and the seed in it.
      ctx.fillStyle = 'rgba(90, 10, 20, 0.55)';
      ctx.beginPath();
      ctx.ellipse(x, y, 5.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0d58a';
      ctx.beginPath();
      ctx.ellipse(x + 0.5, y - 0.5, 2.6, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(x - 0.4, y - 1.6, 0.9, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return makeTexture(canvas, true);
}
