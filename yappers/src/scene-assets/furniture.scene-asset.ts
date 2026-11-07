/**
 * The furniture, built in code (metres): a low wooden play table with a
 * little pavement and bus stop on its left half (where the Yappers queue)
 * and a clear right half (where the bus parks). Origin on the floor under
 * the table's centre; the pavement's top is at TABLE_TOP_Y + STOP_THICKNESS.
 *
 * Deterministic and side-effect free (the asset module is evaluated in the
 * app and in the editor). The bus and the Yappers are made at runtime per
 * level (see src/game/bus.ts and src/yappers).
 */

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  type BufferGeometry,
} from '@iwsdk/core';

/** The table top's height off the floor (metres). */
export const TABLE_TOP_Y = 0.86;
export const TABLE_SIZE = { width: 1.4, depth: 0.7 };
/** The pavement on the left half: its centre in the table's frame, and its size. */
export const STOP_SIZE = { width: 0.56, depth: 0.46 };
export const STOP_CENTRE = { x: -0.37, z: 0.0 };
export const STOP_THICKNESS = 0.01;
/** Where the queue stands on the pavement: a line along x at this z, in the table's frame. */
export const QUEUE_Z = 0.06;
/** Where the bus parks: the right half of the table (its centre, in the table's frame). */
export const BUS_SPOT = { x: 0.33, z: -0.04 };

/** A rounded-rectangle outline in XY. */
export function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): Shape {
  const s = new Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** Extrude an XY outline to `depth` along Z, centred on z = 0, with a soft bevel. */
export function extrudeCentred(shape: Shape, depth: number, bevel: number): BufferGeometry {
  const g = new ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  g.computeVertexNormals();
  return g;
}

/** Repeatable noise (the module must be deterministic). */
function hash(n: number): number {
  const s = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
}

/** Pale paving slabs with a speckle, a kerb line along the front, and a painted queue line. */
function pavementTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const w = 1024;
  const h = Math.round((w * STOP_SIZE.depth) / STOP_SIZE.width);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#cfcbc3';
  ctx.fillRect(0, 0, w, h);
  // Speckle.
  for (let i = 0; i < 9000; i++) {
    const x = hash(i) * w;
    const y = hash(i + 0.5) * h;
    ctx.fillStyle = hash(i + 0.25) > 0.5 ? 'rgba(90, 85, 80, 0.12)' : 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(x, y, 2, 2);
  }
  // Slab joints.
  ctx.strokeStyle = 'rgba(80, 75, 70, 0.35)';
  ctx.lineWidth = 3;
  const slab = w / 7;
  for (let x = slab; x < w; x += slab) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = slab; y < h; y += slab) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // The kerb along the front edge (toward the player: +z is the canvas's bottom).
  ctx.fillStyle = '#9d9890';
  ctx.fillRect(0, h - 26, w, 26);
  // A painted yellow queue line along the front, with a "QUEUE" stencil.
  const lineY = h / 2 + ((QUEUE_Z + 0.03) / STOP_SIZE.depth) * h;
  ctx.strokeStyle = 'rgba(232, 190, 60, 0.9)';
  ctx.lineWidth = 7;
  ctx.setLineDash([34, 18]);
  ctx.beginPath();
  ctx.moveTo(40, lineY);
  ctx.lineTo(w - 40, lineY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(232, 190, 60, 0.9)';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('QUEUE HERE', w / 2, lineY + 52);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** The round bus-stop sign: a white bus pictogram on a blue disc. */
function signTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2f62b8';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.stroke();
  // A little bus: body, windows, wheels.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(52, 86, 152, 76, 14);
  ctx.fill();
  ctx.fillStyle = '#2f62b8';
  for (let i = 0; i < 3; i++) ctx.fillRect(66 + i * 46, 98, 34, 28);
  ctx.beginPath();
  ctx.arc(88, 168, 16, 0, Math.PI * 2);
  ctx.arc(168, 168, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BUS', size / 2, 70);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const tableWood = new MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.55 });
const legWood = new MeshStandardMaterial({ color: 0x9c7049, roughness: 0.6 });
const paving = new MeshStandardMaterial({ color: 0xffffff, map: pavementTexture(), roughness: 0.95 });
const pavingSide = new MeshStandardMaterial({ color: 0xb6b1a8, roughness: 0.95 });
const pole = new MeshStandardMaterial({ color: 0x4a5058, roughness: 0.4, metalness: 0.5 });
const signFace = new MeshStandardMaterial({ color: 0xffffff, map: signTexture(), roughness: 0.5 });
const signBack = new MeshStandardMaterial({ color: 0x2f62b8, roughness: 0.5 });

function createTable(): Group {
  const root = new Group();
  root.name = 'Table';
  const topThickness = 0.035;

  // A rounded wooden top on four turned legs.
  const top = new Mesh(
    extrudeCentred(roundedRect(-TABLE_SIZE.width / 2, -TABLE_SIZE.depth / 2, TABLE_SIZE.width / 2, TABLE_SIZE.depth / 2, 0.05), topThickness, 0.006),
    tableWood,
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = TABLE_TOP_Y - topThickness / 2;
  top.name = 'TableTop';
  root.add(top);
  const legHeight = TABLE_TOP_Y - topThickness;
  const legGeometry = new CylinderGeometry(0.022, 0.03, legHeight, 14);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new Mesh(legGeometry, legWood);
      leg.position.set(sx * (TABLE_SIZE.width / 2 - 0.08), legHeight / 2, sz * (TABLE_SIZE.depth / 2 - 0.08));
      leg.name = 'Leg';
      root.add(leg);
    }
  }
  // A rail under the top, front and back.
  for (const sz of [-1, 1]) {
    const rail = new Mesh(new BoxGeometry(TABLE_SIZE.width - 0.2, 0.05, 0.025), legWood);
    rail.position.set(0, TABLE_TOP_Y - topThickness - 0.025, sz * (TABLE_SIZE.depth / 2 - 0.08));
    rail.name = 'Rail';
    root.add(rail);
  }

  // The pavement: a slab of paving on the left, its top textured.
  const slab = new Mesh(new BoxGeometry(STOP_SIZE.width, STOP_THICKNESS, STOP_SIZE.depth), [pavingSide, pavingSide, paving, pavingSide, pavingSide, pavingSide]);
  slab.position.set(STOP_CENTRE.x, TABLE_TOP_Y + STOP_THICKNESS / 2, STOP_CENTRE.z);
  slab.name = 'Pavement';
  root.add(slab);

  // The bus-stop sign, at the pavement's back-right corner, out of the queue's way.
  const sign = new Group();
  sign.name = 'BusStopSign';
  const post = new Mesh(new CylinderGeometry(0.004, 0.004, 0.16, 10), pole);
  post.position.y = 0.08;
  const disc = new Mesh(new CylinderGeometry(0.03, 0.03, 0.004, 32), [signBack, signFace, signBack]);
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 0.17;
  const foot = new Mesh(new CylinderGeometry(0.012, 0.014, 0.006, 16), pole);
  foot.position.y = 0.003;
  const cap = new Mesh(new SphereGeometry(0.006, 10, 8), pole);
  cap.position.y = 0.205;
  sign.add(post, disc, foot, cap);
  sign.position.set(STOP_CENTRE.x + STOP_SIZE.width / 2 - 0.05, TABLE_TOP_Y + STOP_THICKNESS, STOP_CENTRE.z - STOP_SIZE.depth / 2 + 0.06);
  root.add(sign);
  return root;
}

export const tablePrototype = createTable();
