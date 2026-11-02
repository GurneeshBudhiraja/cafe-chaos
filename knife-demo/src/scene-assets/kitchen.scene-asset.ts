/**
 * The kitchen props, built in code (metres):
 *
 * - Knife: a chef's knife. Origin at the middle of the handle, where a hand
 *   holds it. The blade runs along +X, its edge faces -Y, its flat sides
 *   face ±Z. Parts: Handle, Bolster, Blade (the cutting edge is the blade's
 *   lower outline, see KNIFE_EDGE).
 * - Apple: origin at its centre; the stem points +Y. Parts: Skin, Stem, Leaf.
 * - Side table: a small wooden table with a cutting board on it. Origin on
 *   the floor under the table's centre; the board's top is at TABLE_TOP_Y +
 *   BOARD_THICKNESS.
 *
 * Deterministic and side-effect free (the asset module is evaluated in the
 * app and in the editor).
 */

import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  TubeGeometry,
  CatmullRomCurve3,
  Vector2,
  Vector3,
  type BufferGeometry,
} from '@iwsdk/core';

// ------------------------------------------------------------------ knife

/** The handle, from the butt to the bolster (X range, metres). */
const HANDLE_FROM_X = -0.075;
const HANDLE_TO_X = 0.045;
const BLADE_FROM_X = 0.052;
const BLADE_TIP_X = 0.262;

/**
 * The cutting edge in the knife's frame: from the heel to the tip (the
 * blade's lower outline). The slicing system tests these points.
 */
export const KNIFE_EDGE: ReadonlyArray<readonly [number, number]> = [
  [BLADE_FROM_X + 0.006, -0.034],
  [0.12, -0.034],
  [0.18, -0.03],
  [0.22, -0.019],
  [BLADE_TIP_X - 0.006, -0.002],
];

const steel = new MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.22 });
const brushedSteel = new MeshStandardMaterial({ color: 0xb9bfc5, metalness: 1, roughness: 0.38 });
const handleWood = new MeshStandardMaterial({ color: 0x2e1c14, roughness: 0.55 });

/** A rounded-rectangle outline in XY. */
function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): Shape {
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
function extrudeCentred(shape: Shape, depth: number, bevel: number): BufferGeometry {
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

function createKnife(): Group {
  const root = new Group();
  root.name = 'Knife';

  // Handle: a slightly swelling grip, rounded at the butt.
  const grip = new Shape();
  grip.moveTo(HANDLE_TO_X, -0.011);
  grip.bezierCurveTo(0.0, -0.014, -0.05, -0.015, HANDLE_FROM_X + 0.008, -0.013);
  grip.quadraticCurveTo(HANDLE_FROM_X - 0.002, -0.011, HANDLE_FROM_X, 0.0);
  grip.quadraticCurveTo(HANDLE_FROM_X, 0.012, HANDLE_FROM_X + 0.01, 0.0125);
  grip.bezierCurveTo(-0.04, 0.013, 0.0, 0.012, HANDLE_TO_X, 0.011);
  grip.lineTo(HANDLE_TO_X, -0.011);
  const handle = new Mesh(extrudeCentred(grip, 0.019, 0.004), handleWood);
  handle.name = 'Handle';
  root.add(handle);

  // Three steel rivets through the handle.
  const rivetGeometry = new CylinderGeometry(0.0028, 0.0028, 0.0195, 16);
  rivetGeometry.rotateX(Math.PI / 2);
  for (const x of [-0.052, -0.016, 0.022]) {
    const rivet = new Mesh(rivetGeometry, brushedSteel);
    rivet.position.set(x, 0.0005, 0);
    rivet.name = 'Rivet';
    root.add(rivet);
  }

  // Bolster: the steel collar between handle and blade.
  const bolster = new Mesh(extrudeCentred(roundedRect(HANDLE_TO_X - 0.002, -0.013, BLADE_FROM_X + 0.004, 0.0135, 0.004), 0.012, 0.002), brushedSteel);
  bolster.name = 'Bolster';
  root.add(bolster);

  // Blade: a straight spine, a deep heel and an edge curving up to the point.
  const blade = new Shape();
  blade.moveTo(BLADE_FROM_X, 0.012);
  blade.lineTo(0.2, 0.011);
  blade.quadraticCurveTo(0.24, 0.009, BLADE_TIP_X, 0.0);
  blade.quadraticCurveTo(0.235, -0.024, 0.18, -0.031);
  blade.quadraticCurveTo(0.14, -0.036, 0.1, -0.036);
  blade.lineTo(BLADE_FROM_X + 0.004, -0.036);
  blade.quadraticCurveTo(BLADE_FROM_X, -0.036, BLADE_FROM_X, -0.03);
  blade.lineTo(BLADE_FROM_X, 0.012);
  const bladeMesh = new Mesh(extrudeCentred(blade, 0.0022, 0.0006), steel);
  bladeMesh.name = 'Blade';
  root.add(bladeMesh);

  return root;
}

// ------------------------------------------------------------------ apple

export const APPLE_RADIUS = 0.042;

/**
 * The apple's outline [radius, height] from the bottom dimple to the top
 * dimple (metres; the centre is at height 0). Shared with the halves.
 */
export const APPLE_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.0, -0.031],
  [0.006, -0.034],
  [0.016, -0.0365],
  [0.026, -0.033],
  [0.035, -0.023],
  [0.041, -0.008],
  [0.0425, 0.006],
  [0.0405, 0.019],
  [0.0345, 0.029],
  [0.024, 0.0345],
  [0.012, 0.033],
  [0.0045, 0.0265],
  [0.0, 0.023],
];

export const appleSkin = new MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
const stemMaterial = new MeshStandardMaterial({ color: 0x4a3420, roughness: 0.8 });
const leafMaterial = new MeshStandardMaterial({ color: 0x4f8a2f, roughness: 0.6, side: 2 });

/** Small, repeatable noise (no Math.random: the module must be deterministic). */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Paint the apple's skin: deep red, streaked, blushing yellow-green near the stem. */
export function paintAppleSkin(geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const red = new Color(0xb3121b);
  const dark = new Color(0x6e0a10);
  const blush = new Color(0xc9a23a);
  const c = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const angle = Math.atan2(x, z);
    // Vertical streaks around the apple.
    const streak = 0.5 + 0.5 * Math.sin(angle * 9 + hash(Math.round(angle * 40)) * 2.5);
    c.copy(red).lerp(dark, streak * 0.45);
    // Lighter towards the stem on one side.
    const top = Math.max(0, (y - 0.012) / 0.024) * (0.55 + 0.45 * Math.cos(angle - 0.8));
    c.lerp(blush, Math.min(0.6, top * 0.6));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}

/** The skin as a lathe, around +Y; `phiLength` < 2π makes part of it (a half). */
export function createAppleSkinGeometry(phiStart = 0, phiLength = Math.PI * 2): BufferGeometry {
  const g = new LatheGeometry(
    APPLE_PROFILE.map(([r, y]) => new Vector2(r, y)),
    48,
    phiStart,
    phiLength,
  );
  g.computeVertexNormals();
  paintAppleSkin(g);
  return g;
}

/** Stem and leaf, on top of the apple (part of the whole apple and of one half). */
export function createStemAndLeaf(): Group {
  const group = new Group();
  const stemCurve = new CatmullRomCurve3([
    new Vector3(0, 0.022, 0),
    new Vector3(0.001, 0.032, 0),
    new Vector3(0.004, 0.041, 0.001),
  ]);
  const stem = new Mesh(new TubeGeometry(stemCurve, 8, 0.0016, 6), stemMaterial);
  stem.name = 'Stem';
  group.add(stem);

  const leafShape = new Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.008, 0.007, 0.022, 0);
  leafShape.quadraticCurveTo(0.008, -0.007, 0, 0);
  const leaf = new Mesh(new ShapeGeometry(leafShape, 8), leafMaterial);
  leaf.name = 'Leaf';
  leaf.position.set(0.002, 0.034, 0);
  leaf.rotation.set(-1.1, 0.5, 0.35);
  group.add(leaf);
  return group;
}

function createApple(): Group {
  const root = new Group();
  root.name = 'Apple';
  const skin = new Mesh(createAppleSkinGeometry(), appleSkin);
  skin.name = 'Skin';
  root.add(skin);
  root.add(createStemAndLeaf());
  return root;
}

// ------------------------------------------------------------- side table

export const TABLE_TOP_Y = 0.74;
export const BOARD_THICKNESS = 0.022;
export const TABLE_SIZE = { width: 0.62, depth: 0.42 };
export const BOARD_SIZE = { width: 0.4, depth: 0.26 };

const tableWood = new MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.6 });
const boardWood = new MeshStandardMaterial({ color: 0xd2a56c, roughness: 0.7 });

function createSideTable(): Group {
  const root = new Group();
  root.name = 'SideTable';
  const topThickness = 0.03;
  const top = new Mesh(new BoxGeometry(TABLE_SIZE.width, topThickness, TABLE_SIZE.depth), tableWood);
  top.position.y = TABLE_TOP_Y - topThickness / 2;
  top.name = 'TableTop';
  root.add(top);
  const legHeight = TABLE_TOP_Y - topThickness;
  const legGeometry = new BoxGeometry(0.035, legHeight, 0.035);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new Mesh(legGeometry, tableWood);
      leg.position.set(sx * (TABLE_SIZE.width / 2 - 0.04), legHeight / 2, sz * (TABLE_SIZE.depth / 2 - 0.04));
      leg.name = 'Leg';
      root.add(leg);
    }
  }
  const board = new Mesh(
    extrudeCentred(roundedRect(-BOARD_SIZE.width / 2, -BOARD_SIZE.depth / 2, BOARD_SIZE.width / 2, BOARD_SIZE.depth / 2, 0.02), BOARD_THICKNESS, 0.004),
    boardWood,
  );
  // The outline is drawn in XY: lay it flat (its depth runs along Z).
  board.rotation.x = -Math.PI / 2;
  board.position.y = TABLE_TOP_Y + BOARD_THICKNESS / 2;
  board.name = 'CuttingBoard';
  root.add(board);
  return root;
}

export const knifePrototype = createKnife();
export const applePrototype = createApple();
export const sideTablePrototype = createSideTable();
