/**
 * Classroom room shell: floor, four walls, ceiling, windows, chalkboard.
 *
 * Origin: floor level at the seated player's position (scene origin).
 * Interior: x -3.5..3.5, z -4.6 (front, chalkboard) .. +4.0 (back), 3 m high.
 * The player faces -Z toward the chalkboard; windows are on the left (-X).
 *
 * Walls are thin slabs (not single-sided planes) so they render from any
 * side. Wall-mounted details are authored in a wall-aligned group whose
 * local X/Y lie in the wall plane and local +Z points into the room.
 */

import { BoxGeometry, CylinderGeometry, Group, Mesh, type BufferGeometry, type Material } from '@iwsdk/core';
import { classroomMaterials as m } from './classroom-materials.js';

export const ROOM = { minX: -3.5, maxX: 3.5, minZ: -4.6, maxZ: 4.0, height: 3.0 } as const;
const WALL_T = 0.1;

function part(parent: Group, name: string, geometry: BufferGeometry, material: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/**
 * A wall-aligned group. `inward` is the yaw that turns local +Z toward the
 * room interior; detail inside it uses x (along wall), y (height), z (depth).
 */
function wallFrame(parent: Group, name: string, x: number, z: number, inwardYaw: number): Group {
  const frame = new Group();
  frame.name = name;
  frame.position.set(x, 0, z);
  frame.rotation.y = inwardYaw;
  parent.add(frame);
  return frame;
}

function addWindow(wall: Group, index: number, centerX: number): void {
  const w = 1.3;
  const h = 1.4;
  const y = 1.65;
  const win = new Group();
  win.name = `Window${index}`;
  win.position.set(centerX, y, 0);
  wall.add(win);
  part(win, 'Glass', new BoxGeometry(w, h, 0.01), m.glass, 0, 0, 0.005);
  // Frame bars sit proud of the glass so they read in grazing light.
  const bar = (name: string, bw: number, bh: number, bx: number, by: number) =>
    part(win, name, new BoxGeometry(bw, bh, 0.05), m.windowFrame, bx, by, 0.025);
  bar('FrameTop', w + 0.08, 0.06, 0, h / 2);
  bar('FrameBottom', w + 0.08, 0.06, 0, -h / 2);
  bar('FrameLeft', 0.06, h, -w / 2, 0);
  bar('FrameRight', 0.06, h, w / 2, 0);
  bar('MullionV', 0.035, h, 0, 0);
  bar('MullionH', w, 0.035, 0, 0.12);
  part(win, 'Sill', new BoxGeometry(w + 0.16, 0.04, 0.16), m.windowFrame, 0, -h / 2 - 0.03, 0.08);
}

function addChalkboard(wall: Group): void {
  const board = new Group();
  board.name = 'Chalkboard';
  board.position.set(0, 1.55, 0);
  wall.add(board);
  const w = 3.4;
  const h = 1.25;
  part(board, 'Board', new BoxGeometry(w, h, 0.02), m.chalkboard, 0, 0, 0.01);
  for (const [name, bw, bh, bx, by] of [
    ['FrameTop', w + 0.1, 0.06, 0, h / 2],
    ['FrameBottom', w + 0.1, 0.06, 0, -h / 2],
    ['FrameLeft', 0.06, h, -w / 2, 0],
    ['FrameRight', 0.06, h, w / 2, 0],
  ] as const) {
    part(board, name, new BoxGeometry(bw, bh, 0.04), m.boardFrame, bx, by, 0.02);
  }
  part(board, 'ChalkTray', new BoxGeometry(w, 0.03, 0.09), m.boardFrame, 0, -h / 2 - 0.03, 0.045);
  // A few chalk lines suggest a lesson without needing text rendering.
  const chalk = (name: string, lw: number, lx: number, ly: number) =>
    part(board, name, new BoxGeometry(lw, 0.018, 0.004), m.chalk, lx, ly, 0.022);
  chalk('ChalkTitle', 1.1, -0.9, 0.42);
  chalk('ChalkLine1', 1.9, -0.45, 0.2);
  chalk('ChalkLine2', 1.6, -0.6, 0.02);
  chalk('ChalkLine3', 1.2, -0.8, -0.16);
  chalk('ChalkNoteA', 0.7, 1.05, 0.3);
  chalk('ChalkNoteB', 0.55, 1.12, 0.12);
  part(board, 'ChalkStick', new BoxGeometry(0.08, 0.012, 0.012), m.chalk, 0.9, -h / 2 - 0.008, 0.06);
}

function addClock(wall: Group): void {
  const face = part(wall, 'ClockFace', new CylinderGeometry(0.18, 0.18, 0.03, 32), m.paper, 0, 2.6, 0.02);
  face.rotation.x = Math.PI / 2; // Cylinder axis along local +Z (wall normal).
  const rim = part(wall, 'ClockRim', new CylinderGeometry(0.2, 0.2, 0.02, 32), m.metal, 0, 2.6, 0.005);
  rim.rotation.x = Math.PI / 2;
  part(wall, 'ClockHandHour', new BoxGeometry(0.015, 0.09, 0.006), m.metal, 0, 2.64, 0.04);
  part(wall, 'ClockHandMinute', new BoxGeometry(0.12, 0.012, 0.006), m.metal, 0.05, 2.6, 0.042);
}

function addCorkboard(wall: Group): void {
  part(wall, 'Corkboard', new BoxGeometry(2.0, 1.0, 0.02), m.corkboard, -0.6, 1.5, 0.01);
  const notes = [
    [-1.2, 1.7], [-0.85, 1.35], [-0.45, 1.72], [-0.1, 1.38], [0.2, 1.68],
  ];
  notes.forEach(([x, y], i) =>
    part(wall, `PinnedNote${i}`, new BoxGeometry(0.21, 0.28, 0.004), m.paper, x, y, 0.024),
  );
  // Door to the right of the corkboard.
  part(wall, 'Door', new BoxGeometry(0.95, 2.1, 0.04), m.teacherWood, 1.9, 1.05, 0.02);
  part(wall, 'DoorHandle', new BoxGeometry(0.12, 0.025, 0.04), m.metal, 1.55, 1.0, 0.05);
}

function createClassroomRoom(): Group {
  const room = new Group();
  room.name = 'ClassroomRoom';
  const { minX, maxX, minZ, maxZ, height } = ROOM;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // Shell slabs: inner faces sit exactly on the interior bounds.
  part(room, 'Floor', new BoxGeometry(width, WALL_T, depth), m.floor, cx, -WALL_T / 2, cz);
  part(room, 'Ceiling', new BoxGeometry(width, WALL_T, depth), m.ceiling, cx, height + WALL_T / 2, cz);
  part(room, 'WallFront', new BoxGeometry(width, height, WALL_T), m.wall, cx, height / 2, minZ - WALL_T / 2);
  part(room, 'WallBack', new BoxGeometry(width, height, WALL_T), m.wall, cx, height / 2, maxZ + WALL_T / 2);
  part(room, 'WallLeft', new BoxGeometry(WALL_T, height, depth), m.wall, minX - WALL_T / 2, height / 2, cz);
  part(room, 'WallRight', new BoxGeometry(WALL_T, height, depth), m.wall, maxX + WALL_T / 2, height / 2, cz);

  // Baseboards along all four walls.
  part(room, 'BaseboardFront', new BoxGeometry(width, 0.1, 0.02), m.wallTrim, cx, 0.05, minZ + 0.01);
  part(room, 'BaseboardBack', new BoxGeometry(width, 0.1, 0.02), m.wallTrim, cx, 0.05, maxZ - 0.01);
  part(room, 'BaseboardLeft', new BoxGeometry(0.02, 0.1, depth), m.wallTrim, minX + 0.01, 0.05, cz);
  part(room, 'BaseboardRight', new BoxGeometry(0.02, 0.1, depth), m.wallTrim, maxX - 0.01, 0.05, cz);

  // Ceiling light panels in two rows.
  const panel = new BoxGeometry(1.2, 0.02, 0.6);
  [-2.6, -0.3, 2.0].forEach((z, row) =>
    [-1.6, 1.6].forEach((x, col) =>
      part(room, `CeilingLight${row}${col}`, panel, m.ceilingLight, x, height - 0.01, z),
    ),
  );

  // Wall-aligned detail frames (local +Z points into the room).
  const front = wallFrame(room, 'FrontWallDetail', cx, minZ, 0);
  addChalkboard(front);
  addClock(front);
  const left = wallFrame(room, 'LeftWallDetail', minX, 0, Math.PI / 2);
  // Along the left wall, local +X runs toward -Z (front of the room).
  [-2.4, -0.4, 1.6].forEach((along, i) => addWindow(left, i, -along));
  const back = wallFrame(room, 'BackWallDetail', cx, maxZ, Math.PI);
  addCorkboard(back);

  return room;
}

export const classroomRoomPrototype = createClassroomRoom();
