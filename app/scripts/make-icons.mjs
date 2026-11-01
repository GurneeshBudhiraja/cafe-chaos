/**
 * Renders the app icon PNGs from public/icons/icon.svg (the one source).
 *
 * - icon-512.png, icon-192.png: the icon as drawn, a rounded dark tile with
 *   transparent corners.
 * - icon-512-maskable.png: full-bleed and opaque (the headset applies its
 *   own circle or squircle mask), with the artwork shrunk into the central
 *   80% safe zone so the mask never cuts it.
 *
 * Usage: node scripts/make-icons.mjs   (also writes previews at 48 px into artifacts/icons/)
 */

import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const SOURCE = 'public/icons/icon.svg';
const OUT = 'public/icons';
const PREVIEW = 'artifacts/icons';
/** The maskable safe zone is the central 80%. */
const SAFE_ZONE = 0.8;

const svg = await readFile(SOURCE, 'utf8');

// Maskable: the rounded tile becomes a full square, and the art is scaled about the centre.
const offset = (512 * (1 - SAFE_ZONE)) / 2;
const maskable = svg
  .replace(/<rect id="tile"[^>]*\/>/u, '<rect id="tile" width="512" height="512" fill="#2a2420"/>')
  .replace('<g id="art">', `<g id="art" transform="translate(${offset} ${offset}) scale(${SAFE_ZONE})">`);
if (maskable === svg) throw new Error('make-icons: icon.svg no longer has the "tile" rect and "art" group.');

const render = (source, size, file) =>
  sharp(Buffer.from(source), { density: 72 * (size / 512) * 4 })
    .resize(size, size)
    .png()
    .toFile(file);

await mkdir(OUT, { recursive: true });
await mkdir(PREVIEW, { recursive: true });
await render(svg, 512, `${OUT}/icon-512.png`);
await render(svg, 192, `${OUT}/icon-192.png`);
await render(maskable, 512, `${OUT}/icon-512-maskable.png`);
await render(svg, 48, `${PREVIEW}/icon-48.png`);
await render(maskable, 48, `${PREVIEW}/maskable-48.png`);
console.log('Icons written to', OUT);
