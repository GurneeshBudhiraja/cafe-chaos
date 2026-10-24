/**
 * Classroom furniture prototypes: student desk, student chair, teacher desk.
 *
 * Conventions for all three (meters):
 * - Origin on the floor at the footprint center; +Y up.
 * - The student sits on the +Z side of a desk and faces -Z (toward the
 *   chalkboard). The chair back is on its +Z side. The teacher desk's
 *   modesty panel faces +Z, toward the students.
 * - castShadow stays off; this is a light desktop backdrop.
 */

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  type BufferGeometry,
  type Material,
} from '@iwsdk/core';
import { classroomMaterials as m } from './classroom-materials.js';
import { bevelBox } from './lib/hardsurface.js';

/** Top surface height of a student desk; the tablet rests just above it. */
export const STUDENT_DESK_HEIGHT_M = 0.72;

const LEG = new CylinderGeometry(0.014, 0.014, 1, 8); // scaled to length

/** Add a named mesh to `parent` at a position. */
function part(
  parent: Group,
  name: string,
  geometry: BufferGeometry,
  material: Material,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Four vertical legs from the floor to `height`, inset from the corners. */
function legs(parent: Group, prefix: string, halfX: number, halfZ: number, height: number): void {
  const corners = [
    [-halfX, -halfZ],
    [halfX, -halfZ],
    [-halfX, halfZ],
    [halfX, halfZ],
  ];
  corners.forEach(([x, z], i) => {
    const leg = part(parent, `${prefix}Leg${i}`, LEG, m.metal, x, height / 2, z);
    leg.scale.y = height;
  });
}

function createStudentDesk(): Group {
  const desk = new Group();
  desk.name = 'StudentDesk';
  const topThickness = 0.03;
  part(
    desk,
    'DeskTop',
    bevelBox(0.62, topThickness, 0.46, 0.006),
    m.deskTop,
    0,
    STUDENT_DESK_HEIGHT_M - topThickness / 2,
    0,
  );
  // Book rack under the top, open toward the student (+Z).
  part(desk, 'BookRack', new BoxGeometry(0.54, 0.012, 0.34), m.metal, 0, 0.58, -0.04);
  part(desk, 'RackBack', new BoxGeometry(0.54, 0.11, 0.012), m.metal, 0, 0.635, -0.21);
  legs(desk, 'Desk', 0.27, 0.19, STUDENT_DESK_HEIGHT_M - topThickness);
  // Foot rail ties the legs together and reads as a sturdy frame.
  part(desk, 'FootRail', new BoxGeometry(0.54, 0.016, 0.016), m.metal, 0, 0.12, -0.19);
  return desk;
}

function createStudentChair(): Group {
  const chair = new Group();
  chair.name = 'StudentChair';
  const seatHeight = 0.45;
  part(chair, 'Seat', bevelBox(0.42, 0.03, 0.4, 0.008), m.seat, 0, seatHeight, 0);
  // Backrest panel on posts at the +Z edge.
  part(chair, 'Backrest', bevelBox(0.4, 0.22, 0.025, 0.006), m.seat, 0, 0.72, 0.19);
  for (const x of [-0.17, 0.17]) {
    const post = part(chair, `BackPost${x < 0 ? 'L' : 'R'}`, LEG, m.metal, x, 0.62, 0.185);
    post.scale.y = 0.34;
  }
  legs(chair, 'Chair', 0.18, 0.17, seatHeight - 0.015);
  return chair;
}

function createTeacherDesk(): Group {
  const desk = new Group();
  desk.name = 'TeacherDesk';
  const height = 0.76;
  part(desk, 'DeskTop', bevelBox(1.4, 0.04, 0.72, 0.008), m.teacherWood, 0, height - 0.02, 0);
  // Pedestal drawers on the right, side panel on the left, modesty panel front.
  part(desk, 'Pedestal', bevelBox(0.42, height - 0.04, 0.66, 0.006), m.teacherWood, 0.47, (height - 0.04) / 2, 0);
  part(desk, 'SidePanel', new BoxGeometry(0.03, height - 0.04, 0.66), m.teacherWood, -0.67, (height - 0.04) / 2, 0);
  part(desk, 'ModestyPanel', new BoxGeometry(1.32, 0.42, 0.02), m.teacherWood, 0, 0.48, 0.32);
  for (const [i, y] of [0.6, 0.38, 0.16].entries()) {
    part(desk, `DrawerHandle${i}`, new BoxGeometry(0.12, 0.012, 0.012), m.metal, 0.47, y, 0.337);
  }
  // A small stack of papers so the desk reads as in use.
  part(desk, 'Papers', new BoxGeometry(0.3, 0.02, 0.22), m.paper, -0.3, height + 0.01, -0.05);
  return desk;
}

export const studentDeskPrototype = createStudentDesk();
export const studentChairPrototype = createStudentChair();
export const teacherDeskPrototype = createTeacherDesk();
