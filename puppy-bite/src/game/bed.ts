/**
 * The dog bed: a soft bolster rim around a quilted mattress whose stitching
 * marks the cells, so the player can see where puppies will settle.
 *
 * Frame: origin at the bed's bottom centre (on the table), Y up; cells run
 * along +X (columns) and +Z (rows, the front row nearest the player). The
 * mattress top, where puppies lie, is MATTRESS_TOP up. Built at runtime
 * for a level (it paints a canvas).
 */

import {
  BoxGeometry,
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { CELL } from '../puppies/shapes.js';
import { roundedRect } from '../scene-assets/furniture.scene-asset.js';

export const MATTRESS_TOP = 0.028;
const RIM_WIDTH = 0.045;
const RIM_HEIGHT = 0.065;
const RIM_INSET = 0.008;

const rimMaterial = new MeshStandardMaterial({ color: 0x8fa5c6, roughness: 0.92, metalness: 0 });
const baseMaterial = new MeshStandardMaterial({ color: 0x6f86a8, roughness: 0.9 });

export interface Bed {
  group: Group;
  columns: number;
  rows: number;
  /** The corner of cell (0, 0) on the mattress top, in the bed's frame. */
  corner: Vector3;
  /** The mattress's half size (metres). */
  half: { x: number; z: number };
}

/** One cell's worth of quilting: stitched edges and a soft dimple in the middle. */
function quiltTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const fill = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size * 0.7);
  fill.addColorStop(0, '#fbf3e4');
  fill.addColorStop(0.7, '#f1e4cf');
  fill.addColorStop(1, '#e2d1b8');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  // Stitches along the cell's edges.
  ctx.strokeStyle = 'rgba(150, 120, 95, 0.75)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  // The dimple: a little shaded button.
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(140, 110, 90, 0.35)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createBed(columns: number, rows: number): Bed {
  const group = new Group();
  group.name = 'Bed';
  const innerW = columns * CELL;
  const innerD = rows * CELL;
  const outerW = innerW + 2 * RIM_WIDTH;
  const outerD = innerD + 2 * RIM_WIDTH;

  // The base: a slim pad under everything.
  const base = new Mesh(new BoxGeometry(outerW, 0.012, outerD), baseMaterial);
  base.position.y = 0.006;
  base.name = 'BedBase';
  group.add(base);

  // The bolster rim: a rounded ring, extruded up with a soft bevel.
  const outline = roundedRect(-outerW / 2, -outerD / 2, outerW / 2, outerD / 2, 0.05);
  const hole = roundedRect(-innerW / 2 - RIM_INSET, -innerD / 2 - RIM_INSET, innerW / 2 + RIM_INSET, innerD / 2 + RIM_INSET, 0.025);
  (outline as Shape).holes.push(hole);
  const rimGeometry = new ExtrudeGeometry(outline, {
    depth: RIM_HEIGHT - 0.03,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.012,
    bevelSegments: 4,
    curveSegments: 12,
  });
  rimGeometry.computeVertexNormals();
  const rim = new Mesh(rimGeometry, rimMaterial);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.012 + 0.015;
  rim.name = 'BedRim';
  group.add(rim);

  // The quilted mattress, its texture repeating once per cell.
  const texture = quiltTexture();
  texture.repeat.set(columns, rows);
  const mattress = new Mesh(
    new BoxGeometry(innerW + 2 * RIM_INSET, MATTRESS_TOP - 0.012, innerD + 2 * RIM_INSET),
    [
      baseMaterial,
      baseMaterial,
      new MeshStandardMaterial({ map: texture, roughness: 0.95 }),
      baseMaterial,
      baseMaterial,
      baseMaterial,
    ],
  );
  mattress.position.y = 0.012 + (MATTRESS_TOP - 0.012) / 2;
  mattress.name = 'Mattress';
  group.add(mattress);

  group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return { group, columns, rows, corner: new Vector3(-innerW / 2, MATTRESS_TOP, -innerD / 2), half: { x: innerW / 2, z: innerD / 2 } };
}
