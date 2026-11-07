/**
 * The furniture, built in code (metres): a low wooden play table with a
 * soft blanket on its left half (where the puppies lie) and a clear right
 * half (where the bed goes). Origin on the floor under the table's centre;
 * the blanket's top is at TABLE_TOP_Y + BLANKET_THICKNESS.
 *
 * Deterministic and side-effect free (the asset module is evaluated in the
 * app and in the editor). The puppies and the bed are made at runtime per
 * level (see src/puppies and src/game).
 */

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  type BufferGeometry,
} from '@iwsdk/core';

/** The table top's height off the floor (metres). */
export const TABLE_TOP_Y = 0.86;
export const TABLE_SIZE = { width: 1.4, depth: 0.7 };
/** The blanket on the left half: its centre in the table's frame, and its size. */
export const BLANKET_SIZE = { width: 0.58, depth: 0.56 };
export const BLANKET_CENTRE = { x: -0.37, z: 0.0 };
export const BLANKET_THICKNESS = 0.012;
/** Where the bed goes: the right half of the table (its centre, in the table's frame). */
export const BED_SPOT = { x: 0.36, z: -0.03 };

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

/** A soft plaid for the blanket (cream, dusty rose and sage), with a woven grain. */
function plaidTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f3e9da';
  ctx.fillRect(0, 0, size, size);
  const bands = [
    { at: 0.18, w: 0.1, color: 'rgba(214, 150, 160, 0.55)' },
    { at: 0.5, w: 0.05, color: 'rgba(150, 170, 140, 0.5)' },
    { at: 0.82, w: 0.1, color: 'rgba(214, 150, 160, 0.55)' },
  ];
  for (const band of bands) {
    ctx.fillStyle = band.color;
    ctx.fillRect((band.at - band.w / 2) * size, 0, band.w * size, size);
    ctx.fillRect(0, (band.at - band.w / 2) * size, size, band.w * size);
  }
  // Woven grain: faint alternating threads.
  for (let i = 0; i < size; i += 3) {
    ctx.fillStyle = `rgba(120, 90, 70, ${0.04 + hash(i) * 0.05})`;
    ctx.fillRect(i, 0, 1, size);
    ctx.fillRect(0, i, size, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.anisotropy = 4;
  return texture;
}

const tableWood = new MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.55 });
const legWood = new MeshStandardMaterial({ color: 0x9c7049, roughness: 0.6 });
const blanketCloth = new MeshStandardMaterial({ color: 0xffffff, map: plaidTexture(), roughness: 0.95 });

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

  // The blanket: a soft, slightly rumpled pad on the left.
  const blanket = new Mesh(
    extrudeCentred(roundedRect(-BLANKET_SIZE.width / 2, -BLANKET_SIZE.depth / 2, BLANKET_SIZE.width / 2, BLANKET_SIZE.depth / 2, 0.04), BLANKET_THICKNESS, 0.004),
    blanketCloth,
  );
  blanket.rotation.x = -Math.PI / 2;
  blanket.position.set(BLANKET_CENTRE.x, TABLE_TOP_Y + BLANKET_THICKNESS / 2, BLANKET_CENTRE.z);
  blanket.name = 'Blanket';
  root.add(blanket);
  return root;
}

export const tablePrototype = createTable();
