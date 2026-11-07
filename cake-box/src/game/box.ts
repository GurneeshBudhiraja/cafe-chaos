/**
 * The cake box: a pastel pink tray with cream dividers, one cell per card.
 * Each cell's floor carries its card (the target shape, drawn on paper), and
 * the front rim has a small light per cell that turns green, amber or red
 * for how well the piece in it fits.
 *
 * Frame: origin at the bottom centre of the box, Y up; cells run along +X
 * (columns) and +Z (rows, the front row nearest the player). Built at
 * runtime for a level (it paints canvases).
 */

import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { roundedRect, extrudeCentred } from '../scene-assets/kitchen.scene-asset.js';
import type { Card, Cell, Level } from './level.js';

export const BOX_FLOOR = 0.006;
const WALL = 0.03;
const WALL_T = 0.005;
const DIVIDER_H = 0.024;
const DIVIDER_T = 0.003;
const MARGIN = 0.012;

const boxMaterial = new MeshStandardMaterial({ color: 0xf2a9bd, roughness: 0.55, metalness: 0 });
const insideMaterial = new MeshStandardMaterial({ color: 0xfff1e6, roughness: 0.7, metalness: 0 });
const dividerMaterial = new MeshStandardMaterial({ color: 0xfff6ee, roughness: 0.6, metalness: 0 });
const lightOff = new Color(0xd9cfc6);
const LIGHT_COLORS = { great: new Color(0x5ad26a), close: new Color(0xf5c242), off: new Color(0xe8606a) };

export type Fit = 'great' | 'close' | 'off';
export function fitGrade(fit: number): Fit {
  return fit >= 0.85 ? 'great' : fit >= 0.65 ? 'close' : 'off';
}

export interface BoxCell {
  /** The cell's centre on the box floor, in the box's frame. */
  centre: Vector3;
  cell: Cell;
  card: Card;
  cardMesh: Mesh;
  light: Mesh;
}

export interface CakeBox {
  group: Group;
  cells: BoxCell[];
  /** Paint a cell's card and light for a fit (or none, when its piece is taken out). */
  showFit(cell: number, fit: number | null): void;
}

/** Draw a card: paper with the shape on it; a coloured fill once a piece is in. */
function paintCard(canvas: HTMLCanvasElement, card: Card, cell: Cell, index: number, fit: number | null): void {
  const w = canvas.width;
  const h = canvas.height;
  const size = Math.min(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fdf6ea';
  ctx.fillRect(0, 0, w, h);
  // A paper border.
  ctx.strokeStyle = 'rgba(190, 150, 120, 0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.strokeRect(10, 10, w - 20, h - 20);
  // The shape, scaled so the cell is the canvas (z down the card is +z in the box).
  const scale = w / cell.width;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.beginPath();
  card.polygon.forEach(([x, z], i) => (i ? ctx.lineTo(x * scale, z * scale) : ctx.moveTo(x * scale, z * scale)));
  ctx.closePath();
  const grade = fit === null ? null : fitGrade(fit);
  ctx.fillStyle = grade === 'great' ? 'rgba(90, 210, 106, 0.55)' : grade === 'close' ? 'rgba(245, 194, 66, 0.5)' : grade === 'off' ? 'rgba(232, 96, 106, 0.45)' : 'rgba(240, 150, 175, 0.35)';
  ctx.fill();
  ctx.strokeStyle = '#b85c78';
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 8]);
  ctx.stroke();
  ctx.restore();
  // The card's number, top left.
  ctx.fillStyle = '#8a4a5e';
  ctx.font = `bold ${Math.round(size * 0.13)}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(String(index + 1), 22, 18);
  if (fit !== null) {
    ctx.font = `bold ${Math.round(size * 0.12)}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(fit * 100)}%`, w - 22, 18);
    ctx.textAlign = 'left';
  }
}

export function createCakeBox(level: Level): CakeBox {
  const group = new Group();
  group.name = 'CakeBox';
  const width = level.inner.width + 2 * MARGIN + 2 * WALL_T;
  const depth = level.inner.depth + 2 * MARGIN + 2 * WALL_T;

  // The tray: a rounded box shell, pink outside, cream inside.
  const floor = new Mesh(extrudeCentred(roundedRect(-width / 2, -depth / 2, width / 2, depth / 2, 0.02), BOX_FLOOR, 0.0015), boxMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = BOX_FLOOR / 2;
  floor.name = 'BoxFloor';
  group.add(floor);
  const inner = new Mesh(new PlaneGeometry(width - 2 * WALL_T, depth - 2 * WALL_T), insideMaterial);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = BOX_FLOOR + 0.0003;
  inner.name = 'BoxInside';
  group.add(inner);
  const wallGeometryX = new BoxGeometry(width, WALL, WALL_T);
  const wallGeometryZ = new BoxGeometry(WALL_T, WALL, depth - 2 * WALL_T);
  for (const sz of [-1, 1]) {
    const wall = new Mesh(wallGeometryX, boxMaterial);
    wall.position.set(0, BOX_FLOOR + WALL / 2, sz * (depth / 2 - WALL_T / 2));
    wall.name = 'BoxWall';
    group.add(wall);
  }
  for (const sx of [-1, 1]) {
    const wall = new Mesh(wallGeometryZ, boxMaterial);
    wall.position.set(sx * (width / 2 - WALL_T / 2), BOX_FLOOR + WALL / 2, 0);
    wall.name = 'BoxWall';
    group.add(wall);
  }
  // Dividers: a wall along each cell's edge that is not the box's own wall (shared edges drawn once).
  const innerW = level.inner.width;
  const innerD = level.inner.depth;
  const drawn = new Set<string>();
  const divider = (x: number, z: number, length: number, alongX: boolean) => {
    const key = `${alongX ? 'x' : 'z'}:${x.toFixed(4)},${z.toFixed(4)},${length.toFixed(4)}`;
    if (drawn.has(key)) return;
    drawn.add(key);
    const mesh = new Mesh(new BoxGeometry(alongX ? length : DIVIDER_T, DIVIDER_H, alongX ? DIVIDER_T : length), dividerMaterial);
    mesh.position.set(x, BOX_FLOOR + DIVIDER_H / 2, z);
    mesh.name = 'Divider';
    group.add(mesh);
  };
  for (const cell of level.cells) {
    const left = cell.x - cell.width / 2;
    const right = cell.x + cell.width / 2;
    const back = cell.z - cell.depth / 2;
    const front = cell.z + cell.depth / 2;
    if (left > -innerW / 2 + 1e-4) divider(left, cell.z, cell.depth, false);
    if (right < innerW / 2 - 1e-4) divider(right, cell.z, cell.depth, false);
    if (back > -innerD / 2 + 1e-4) divider(cell.x, back, cell.width, true);
    if (front < innerD / 2 - 1e-4) divider(cell.x, front, cell.width, true);
  }

  // The cells: a card on each floor, a light on the front rim.
  const cells: BoxCell[] = [];
  const lightGeometry = new BoxGeometry(0.016, 0.006, 0.008);
  const frontRow = Math.max(...level.cells.map((c) => c.z));
  level.cards.forEach((card, index) => {
    const cell = level.cells[index];
    const centre = new Vector3(cell.x, BOX_FLOOR, cell.z);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.round((512 * cell.depth) / cell.width);
    paintCard(canvas, card, cell, index, null);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const cardMesh = new Mesh(new PlaneGeometry(cell.width - 0.006, cell.depth - 0.006), new MeshStandardMaterial({ map: texture, roughness: 0.9 }));
    cardMesh.rotation.x = -Math.PI / 2;
    cardMesh.position.copy(centre).setY(BOX_FLOOR + 0.0006);
    cardMesh.name = 'Card';
    group.add(cardMesh);
    const light = new Mesh(lightGeometry, new MeshStandardMaterial({ color: lightOff, emissive: 0x000000, roughness: 0.4 }));
    // One light per cell on the front rim; a back-row cell's light sits a little left of its column's.
    const inBack = cell.z < frontRow - 1e-4;
    light.position.set(centre.x + (inBack ? -0.022 : 0), BOX_FLOOR + WALL + 0.003, depth / 2 - WALL_T / 2);
    light.name = 'CellLight';
    group.add(light);
    cells.push({ centre, cell, card, cardMesh, light });
  });

  const showFit = (index: number, fit: number | null) => {
    const cell = cells[index];
    const material = cell.cardMesh.material as MeshStandardMaterial;
    paintCard((material.map as CanvasTexture).image as HTMLCanvasElement, cell.card, cell.cell, index, fit);
    material.map!.needsUpdate = true;
    const lightMaterial = cell.light.material as MeshStandardMaterial;
    const color = fit === null ? lightOff : LIGHT_COLORS[fitGrade(fit)];
    lightMaterial.color.copy(color);
    lightMaterial.emissive.copy(fit === null ? new Color(0x000000) : color).multiplyScalar(0.5);
  };
  return { group, cells, showFit };
}
