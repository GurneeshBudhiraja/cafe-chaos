/**
 * Building the dock: a lacquered walnut board with a brass-coloured edge,
 * and a paper tile for each button with its icon and label drawn on it.
 * The tiles' paper is also their emissive map, so each tile glows softly
 * like a small lantern, more under a finger.
 */

import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { BOARD_H, BOARD_T, BOARD_W, BUTTONS, COLORS, GAP_M, PAD_M, TILE_GLOW, TILE_M, type DockAction, type DockButton } from './dock.js';

export interface Tile {
  action: DockAction;
  mesh: Mesh<PlaneGeometry, MeshStandardMaterial>;
  /** Its resting position on the board (it sinks from here when pressed). */
  restZ: number;
}

export interface Dock {
  group: Group;
  tiles: Tile[];
}

/** The dock, lying in its own XY plane (faces +Z), centred, tiles in BUTTONS order. */
export function buildDock(): Dock {
  const group = new Group();
  group.name = 'Dock';
  const board = new Mesh(new BoxGeometry(BOARD_W, BOARD_H, BOARD_T), new MeshStandardMaterial({ color: COLORS.board, roughness: 0.55, metalness: 0.05 }));
  board.name = 'DockBoard';
  group.add(board);
  const edge = new Mesh(
    new BoxGeometry(BOARD_W + 0.004, BOARD_H + 0.004, BOARD_T * 0.6),
    new MeshStandardMaterial({ color: COLORS.edge, roughness: 0.4, metalness: 0.5 }),
  );
  edge.name = 'DockEdge';
  edge.position.z = -BOARD_T * 0.25;
  group.add(edge);
  const tiles: Tile[] = [];
  const restZ = BOARD_T / 2 + 0.0008;
  BUTTONS.forEach((button, i) => {
    const x = -BOARD_W / 2 + PAD_M + TILE_M / 2 + i * (TILE_M + GAP_M);
    const texture = tileTexture(button);
    const material = new MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: TILE_GLOW.rest,
      roughness: 0.9,
      metalness: 0,
    });
    const mesh = new Mesh(new PlaneGeometry(TILE_M, TILE_M), material);
    mesh.name = `Dock-${button.action}`;
    mesh.position.set(x, 0, restZ);
    group.add(mesh);
    tiles.push({ action: button.action, mesh, restZ });
  });
  group.traverse((node) => {
    if (node instanceof Mesh) {
      node.castShadow = false;
      node.receiveShadow = false;
    }
  });
  return { group, tiles };
}

/** A tile's face: cream paper with a walnut border, the icon above and the label below. */
function tileTexture(button: DockButton): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Paper with a soft border.
  roundRect(ctx, 6, 6, size - 12, size - 12, 28);
  ctx.fillStyle = COLORS.paper;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = COLORS.inkSoft;
  ctx.stroke();
  // Icon.
  ctx.strokeStyle = COLORS.ink;
  ctx.fillStyle = COLORS.ink;
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawIcon(ctx, button.action, size / 2, 104, 44);
  // Label.
  ctx.font = `bold 48px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(button.label, size / 2, 200);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** The icons, drawn as strokes: centre (cx, cy), radius r. */
function drawIcon(ctx: CanvasRenderingContext2D, action: DockAction, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  switch (action) {
    case 'move': {
      // Four arrows from the centre.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx * r, cy + dy * r);
        const hx = cx + dx * r;
        const hy = cy + dy * r;
        const b = r * 0.42;
        ctx.moveTo(hx - dx * b - dy * b, hy - dy * b - dx * b);
        ctx.lineTo(hx, hy);
        ctx.lineTo(hx - dx * b + dy * b, hy - dy * b + dx * b);
      }
      ctx.stroke();
      break;
    }
    case 'turn': {
      // A three-quarter circle with an arrowhead.
      ctx.arc(cx, cy, r * 0.85, Math.PI * 0.75, Math.PI * 2.25);
      ctx.stroke();
      const ex = cx + Math.cos(Math.PI * 2.25) * r * 0.85;
      const ey = cy + Math.sin(Math.PI * 2.25) * r * 0.85;
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.45, ey - r * 0.2);
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex - r * 0.05, ey - r * 0.55);
      ctx.stroke();
      break;
    }
    case 'smaller':
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();
      break;
    case 'bigger':
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      break;
    case 'reset': {
      // A little house: back where it started.
      ctx.moveTo(cx - r, cy + r * 0.1);
      ctx.lineTo(cx, cy - r * 0.9);
      ctx.lineTo(cx + r, cy + r * 0.1);
      ctx.moveTo(cx - r * 0.7, cy - r * 0.1);
      ctx.lineTo(cx - r * 0.7, cy + r * 0.9);
      ctx.lineTo(cx + r * 0.7, cy + r * 0.9);
      ctx.lineTo(cx + r * 0.7, cy - r * 0.1);
      ctx.stroke();
      break;
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
