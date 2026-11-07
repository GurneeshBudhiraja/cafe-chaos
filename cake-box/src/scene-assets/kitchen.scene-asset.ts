/**
 * The kitchen props, built in code (metres):
 *
 * - Knife: a chef's knife. Origin at the middle of the handle, where a hand
 *   holds it. The blade runs along +X, its edge faces -Y, its flat sides
 *   face ±Z. Parts: Handle, Bolster, Blade (the cutting edge is the blade's
 *   lower outline, see KNIFE_EDGE).
 * - Counter: a kitchen counter with a cutting board on the left (where the
 *   cake stands) and a clear area on the right (where the box goes). Origin
 *   on the floor under the counter's centre; the board's top is at
 *   COUNTER_TOP_Y + BOARD_THICKNESS.
 *
 * Deterministic and side-effect free (the asset module is evaluated in the
 * app and in the editor). The cake and the box are made at runtime per
 * level (see src/cake and src/game).
 */

import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
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
 * blade's lower outline). The cutting system tests these points.
 */
export const KNIFE_EDGE: ReadonlyArray<readonly [number, number]> = [
  [BLADE_FROM_X + 0.006, -0.034],
  [0.09, -0.034],
  [0.12, -0.034],
  [0.15, -0.032],
  [0.18, -0.03],
  [0.22, -0.019],
  [BLADE_TIP_X - 0.006, -0.002],
];

const steel = new MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.22 });
const brushedSteel = new MeshStandardMaterial({ color: 0xb9bfc5, metalness: 1, roughness: 0.38 });
const handleWood = new MeshStandardMaterial({ color: 0x2e1c14, roughness: 0.55 });

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
  const bolster = new Mesh(
    extrudeCentred(roundedRect(HANDLE_TO_X - 0.002, -0.013, BLADE_FROM_X + 0.004, 0.0135, 0.004), 0.012, 0.002),
    brushedSteel,
  );
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

// ---------------------------------------------------------------- counter

/** The counter top's height off the floor, and the board on it (metres). */
export const COUNTER_TOP_Y = 0.9;
export const BOARD_THICKNESS = 0.02;
export const COUNTER_SIZE = { width: 1.5, depth: 0.62 };
/** The cutting board, on the left half of the counter (its centre, in the counter's frame). */
export const BOARD_SIZE = { width: 0.46, depth: 0.4 };
export const BOARD_CENTRE = { x: -0.34, z: 0.0 };
/** Where the box goes: the right half of the counter (its centre, in the counter's frame). */
export const BOX_SPOT = { x: 0.36, z: -0.02 };

const counterStone = new MeshStandardMaterial({ color: 0xcfc9bd, roughness: 0.5 });
const cabinetWood = new MeshStandardMaterial({ color: 0x5a6b5c, roughness: 0.65 });
const cabinetTrim = new MeshStandardMaterial({ color: 0x4a5a4c, roughness: 0.7 });
const handleBrass = new MeshStandardMaterial({ color: 0xc9a85c, metalness: 0.8, roughness: 0.35 });
const boardWood = new MeshStandardMaterial({ color: 0xd2a56c, roughness: 0.7 });

function createCounter(): Group {
  const root = new Group();
  root.name = 'Counter';
  const topThickness = 0.04;

  // The stone top, slightly wider than the cabinets.
  const top = new Mesh(new BoxGeometry(COUNTER_SIZE.width, topThickness, COUNTER_SIZE.depth), counterStone);
  top.position.y = COUNTER_TOP_Y - topThickness / 2;
  top.name = 'CounterTop';
  root.add(top);

  // Cabinets underneath: a plinth, a body and three door fronts with brass handles.
  const bodyHeight = COUNTER_TOP_Y - topThickness - 0.08;
  const body = new Mesh(new BoxGeometry(COUNTER_SIZE.width - 0.04, bodyHeight, COUNTER_SIZE.depth - 0.04), cabinetWood);
  body.position.y = 0.08 + bodyHeight / 2;
  body.name = 'Cabinets';
  root.add(body);
  const plinth = new Mesh(new BoxGeometry(COUNTER_SIZE.width - 0.08, 0.08, COUNTER_SIZE.depth - 0.1), cabinetTrim);
  plinth.position.y = 0.04;
  plinth.name = 'Plinth';
  root.add(plinth);
  const doorWidth = (COUNTER_SIZE.width - 0.04) / 3 - 0.02;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * ((COUNTER_SIZE.width - 0.04) / 3);
    const door = new Mesh(new BoxGeometry(doorWidth, bodyHeight - 0.04, 0.012), cabinetTrim);
    door.position.set(x, 0.08 + bodyHeight / 2, COUNTER_SIZE.depth / 2 - 0.02 + 0.006);
    door.name = 'Door';
    root.add(door);
    const handle = new Mesh(new BoxGeometry(0.012, 0.11, 0.012), handleBrass);
    handle.position.set(x + doorWidth / 2 - 0.04, 0.08 + bodyHeight / 2 + 0.1, COUNTER_SIZE.depth / 2 - 0.02 + 0.018);
    handle.name = 'Handle';
    root.add(handle);
  }

  // The cutting board, on the left.
  const board = new Mesh(
    extrudeCentred(roundedRect(-BOARD_SIZE.width / 2, -BOARD_SIZE.depth / 2, BOARD_SIZE.width / 2, BOARD_SIZE.depth / 2, 0.02), BOARD_THICKNESS, 0.004),
    boardWood,
  );
  // The outline is drawn in XY: lay it flat (its depth runs along Z).
  board.rotation.x = -Math.PI / 2;
  board.position.set(BOARD_CENTRE.x, COUNTER_TOP_Y + BOARD_THICKNESS / 2, BOARD_CENTRE.z);
  board.name = 'CuttingBoard';
  root.add(board);
  return root;
}

export const knifePrototype = createKnife();
export const counterPrototype = createCounter();
