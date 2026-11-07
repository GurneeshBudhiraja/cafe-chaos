/**
 * The bus: a miniature open-top bus parked on the table, long side toward
 * the player, its front to the left (toward the queue). Rows of bench
 * seats, two each side of an aisle, with the back-rests toward the rear.
 * No roof, so passengers can be dropped straight into their seats and
 * seen from above. The cab has a dashboard, a steering wheel and a seat
 * for the driver (a Yapper the game puts there).
 *
 * The bus's frame: origin on the table under the centre of the passenger
 * floor; x along the bus (front at -x), z across it (+z is the near side).
 * `seatLocal(seat)` gives where a passenger's feet go.
 */

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { castShadows } from '../lighting.js';
import { extrudeCentred, roundedRect } from '../scene-assets/furniture.scene-asset.js';
import { SEATS_PER_ROW, seatColumn, seatRow } from '../yappers/rules.js';

/** Distance between rows, along the bus (metres). */
export const ROW_PITCH = 0.085;
export const SEAT_WIDTH = 0.05;
export const AISLE = 0.035;
/** The passenger floor's height over the table, and a seat cushion's top. */
export const BUS_FLOOR_Y = 0.035;
export const SEAT_TOP_Y = BUS_FLOOR_Y + 0.022;
const WALL_TOP_Y = BUS_FLOOR_Y + 0.045;
const WALL = 0.008;
const CAB_LENGTH = 0.115;
const REAR_LENGTH = 0.035;
/** Across the bus: the four seat centres. */
const SEAT_Z = [-(AISLE / 2 + 1.5 * SEAT_WIDTH), -(AISLE / 2 + 0.5 * SEAT_WIDTH), AISLE / 2 + 0.5 * SEAT_WIDTH, AISLE / 2 + 1.5 * SEAT_WIDTH];
export const BUS_WIDTH = SEATS_PER_ROW * SEAT_WIDTH + AISLE + 2 * WALL;

export interface Bus {
  group: Group;
  rows: number;
  /** The body's footprint, in the bus's frame: its centre along x, and half its size. */
  centreX: number;
  half: { x: number; z: number };
  /** The cabin's extent along x (front edge, rear edge), in the bus's frame. */
  cabin: { front: number; rear: number };
  /** Where a passenger's feet go for a seat, in the bus's frame. */
  seatLocal(seat: number): Vector3;
  /** Where the driver's feet go, and the way the driver faces (yaw). */
  driverLocal: Vector3;
  /** The whole body (for a happy bounce) and the wheels (they turn). */
  parts: { body: Group; wheels: Mesh[] };
}

const paintRed = new MeshStandardMaterial({ color: 0xc8372f, roughness: 0.35, metalness: 0.1 });
const paintCream = new MeshStandardMaterial({ color: 0xf4e9cf, roughness: 0.4, metalness: 0.05 });
const chassisDark = new MeshStandardMaterial({ color: 0x3b3b40, roughness: 0.7 });
const floorRubber = new MeshStandardMaterial({ color: 0x57545a, roughness: 0.95 });
const tyre = new MeshStandardMaterial({ color: 0x222226, roughness: 0.9 });
const hub = new MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.3, metalness: 0.6 });
const chrome = new MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.25, metalness: 0.8 });
const glass = new MeshStandardMaterial({ color: 0xa9d4ee, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45, side: DoubleSide });
const lamp = new MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffe18a, emissiveIntensity: 0.6, roughness: 0.3 });
const tailLamp = new MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff3a2a, emissiveIntensity: 0.5, roughness: 0.3 });
const cushion = new MeshStandardMaterial({ color: 0x3f7fb5, roughness: 0.9 });
const cushionTrim = new MeshStandardMaterial({ color: 0x2c5f8a, roughness: 0.9 });
const dash = new MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.6 });

/** "YAPPER LINES" and a route number, for the cream band on each side. */
function bannerTexture(mirror: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.fillStyle = '#2b4a7a';
  ctx.font = 'bold 72px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('YAPPER LINES', canvas.width / 2, canvas.height / 2 + 4);
  ctx.fillStyle = '#c8372f';
  ctx.beginPath();
  ctx.arc(110, 64, 44, 0, Math.PI * 2);
  ctx.arc(canvas.width - 110, 64, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText('7', 110, 68);
  ctx.fillText('7', canvas.width - 110, 68);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A bench for one pair of seats: cushion, back-rest, and a trim line between the two seats. */
function bench(): Group {
  const g = new Group();
  const width = 2 * SEAT_WIDTH - 0.004;
  const depth = 0.042;
  const seat = new Mesh(extrudeCentred(roundedRect(-depth / 2, -width / 2, depth / 2, width / 2, 0.008), SEAT_TOP_Y - BUS_FLOOR_Y, 0.003), cushion);
  seat.rotation.x = -Math.PI / 2;
  seat.position.y = (SEAT_TOP_Y - BUS_FLOOR_Y) / 2;
  const back = new Mesh(extrudeCentred(roundedRect(-width / 2, 0, width / 2, 0.034, 0.006), 0.009, 0.002), cushion);
  back.rotation.y = -Math.PI / 2;
  back.position.set(depth / 2 - 0.002, SEAT_TOP_Y - BUS_FLOOR_Y - 0.004, 0);
  back.rotation.x = 0;
  const divide = new Mesh(new BoxGeometry(depth - 0.006, 0.002, 0.003), cushionTrim);
  divide.position.y = SEAT_TOP_Y - BUS_FLOOR_Y + 0.0005;
  const legs = new Mesh(new BoxGeometry(0.03, 0.006, width - 0.02), chassisDark);
  legs.position.y = 0.003;
  g.add(seat, back, divide, legs);
  return g;
}

export function createBus(rows: number): Bus {
  const group = new Group();
  group.name = 'Bus';
  const body = new Group();
  body.name = 'BusBody';
  group.add(body);

  const cabinLength = rows * ROW_PITCH;
  const front = -cabinLength / 2;
  const rear = cabinLength / 2;
  const noseX = front - CAB_LENGTH;
  const tailX = rear + REAR_LENGTH;
  const length = tailX - noseX;
  const centreX = (noseX + tailX) / 2;
  const wallZ = BUS_WIDTH / 2 - WALL / 2;

  // Chassis and floor: a dark plate low down, the floor on it.
  const chassis = new Mesh(new BoxGeometry(length - 0.02, 0.012, BUS_WIDTH - 0.03), chassisDark);
  chassis.position.set(centreX, 0.019, 0);
  const floor = new Mesh(new BoxGeometry(length, BUS_FLOOR_Y - 0.025, BUS_WIDTH), floorRubber);
  floor.position.set(centreX, (BUS_FLOOR_Y + 0.025) / 2, 0);
  body.add(chassis, floor);

  // Side walls: red below, a cream band above, with the banner on the band.
  for (const side of [-1, 1]) {
    const lower = new Mesh(new BoxGeometry(length, 0.024, WALL), paintRed);
    lower.position.set(centreX, BUS_FLOOR_Y + 0.012 - 0.01, side * wallZ);
    const upper = new Mesh(new BoxGeometry(length, WALL_TOP_Y - (BUS_FLOOR_Y + 0.014), WALL), paintCream);
    upper.position.set(centreX, (WALL_TOP_Y + BUS_FLOOR_Y + 0.014) / 2, side * wallZ);
    const banner = new Mesh(new PlaneGeometry(cabinLength * 0.9, 0.016), new MeshStandardMaterial({ map: bannerTexture(side < 0), transparent: true, roughness: 0.5 }));
    banner.position.set(0, (WALL_TOP_Y + BUS_FLOOR_Y + 0.014) / 2, side * (wallZ + WALL / 2 + 0.0005));
    banner.rotation.y = side > 0 ? 0 : Math.PI;
    const rail = new Mesh(new CylinderGeometry(0.0025, 0.0025, length, 10), chrome);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(centreX, WALL_TOP_Y + 0.002, side * wallZ);
    body.add(lower, upper, banner, rail);
  }

  // The rear: a wall with a window and tail lamps, and a bumper.
  const rearWall = new Mesh(new BoxGeometry(WALL, WALL_TOP_Y - 0.025, BUS_WIDTH), paintRed);
  rearWall.position.set(tailX - WALL / 2, (WALL_TOP_Y + 0.025) / 2, 0);
  const rearWindow = new Mesh(new PlaneGeometry(BUS_WIDTH * 0.6, 0.018), glass);
  rearWindow.rotation.y = Math.PI / 2;
  rearWindow.position.set(tailX + 0.0006, WALL_TOP_Y - 0.014, 0);
  body.add(rearWall, rearWindow);
  for (const side of [-1, 1]) {
    const tl = new Mesh(new BoxGeometry(0.003, 0.008, 0.012), tailLamp);
    tl.position.set(tailX + 0.001, BUS_FLOOR_Y, side * (BUS_WIDTH / 2 - 0.02));
    body.add(tl);
  }
  const rearBumper = new Mesh(new BoxGeometry(0.008, 0.008, BUS_WIDTH + 0.006), chrome);
  rearBumper.position.set(tailX + 0.002, 0.03, 0);
  body.add(rearBumper);

  // The cab: a bonnet, a windscreen raked back, headlights, a bumper, a dashboard and the wheel.
  const bonnetTop = BUS_FLOOR_Y + 0.036;
  const bonnetLength = CAB_LENGTH - 0.034;
  const bonnet = new Mesh(extrudeCentred(roundedRect(-bonnetLength / 2, -(BUS_WIDTH - 0.006) / 2, bonnetLength / 2, (BUS_WIDTH - 0.006) / 2, 0.014), bonnetTop - 0.024, 0.004), paintRed);
  bonnet.rotation.x = -Math.PI / 2;
  bonnet.position.set(noseX + 0.004 + bonnetLength / 2, (bonnetTop + 0.024) / 2, 0);
  body.add(bonnet);
  const screenH = 0.042;
  const screenFrame = new Group();
  screenFrame.position.set(noseX + bonnetLength + 0.004, bonnetTop - 0.002, 0);
  screenFrame.rotation.z = -0.38;
  const screen = new Mesh(new PlaneGeometry(BUS_WIDTH - 0.014, screenH), glass);
  screen.rotation.y = -Math.PI / 2;
  screen.position.y = screenH / 2;
  screenFrame.add(screen);
  for (const y of [0, screenH]) {
    const bar = new Mesh(new CylinderGeometry(0.002, 0.002, BUS_WIDTH - 0.012, 8), chrome);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = y;
    screenFrame.add(bar);
  }
  for (const side of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.002, 0.002, screenH, 8), chrome);
    post.position.set(0, screenH / 2, side * (BUS_WIDTH / 2 - 0.007));
    screenFrame.add(post);
  }
  body.add(screenFrame);
  for (const side of [-1, 1]) {
    const headlight = new Mesh(new SphereGeometry(0.0085, 14, 10), lamp);
    headlight.position.set(noseX + 0.003, BUS_FLOOR_Y + 0.014, side * (BUS_WIDTH / 2 - 0.03));
    const ring = new Mesh(new TorusGeometry(0.009, 0.0016, 8, 20), chrome);
    ring.rotation.y = Math.PI / 2;
    ring.position.copy(headlight.position);
    body.add(headlight, ring);
  }
  const bumper = new Mesh(new BoxGeometry(0.008, 0.008, BUS_WIDTH + 0.006), chrome);
  bumper.position.set(noseX - 0.002, 0.03, 0);
  const grille = new Mesh(new BoxGeometry(0.003, 0.014, 0.05), chassisDark);
  grille.position.set(noseX - 0.0005, BUS_FLOOR_Y + 0.01, 0);
  body.add(bumper, grille);
  // Dashboard across the front of the cabin, the wheel on the near side.
  const dashboard = new Mesh(new BoxGeometry(0.022, 0.016, BUS_WIDTH - 0.02), dash);
  dashboard.position.set(noseX + bonnetLength + 0.013, bonnetTop - 0.006, 0);
  const column = new Mesh(new CylinderGeometry(0.0015, 0.0015, 0.03, 8), chrome);
  column.rotation.z = -0.9;
  column.position.set(front + 0.004, BUS_FLOOR_Y + 0.036, SEAT_Z[3] - 0.004);
  const wheel = new Mesh(new TorusGeometry(0.011, 0.0018, 8, 24), chassisDark);
  wheel.rotation.z = Math.PI / 2 - 0.9;
  wheel.position.set(front + 0.016, BUS_FLOOR_Y + 0.045, SEAT_Z[3] - 0.004);
  body.add(dashboard, column, wheel);
  // The driver's bench: a single seat on the near side behind the wheel.
  const driverSeat = new Mesh(extrudeCentred(roundedRect(-0.02, -0.022, 0.02, 0.022, 0.006), SEAT_TOP_Y - BUS_FLOOR_Y, 0.003), cushion);
  driverSeat.rotation.x = -Math.PI / 2;
  const driverX = front + 0.045;
  driverSeat.position.set(driverX, BUS_FLOOR_Y + (SEAT_TOP_Y - BUS_FLOOR_Y) / 2, SEAT_Z[3] - 0.004);
  body.add(driverSeat);
  const driverLocal = new Vector3(driverX, SEAT_TOP_Y, SEAT_Z[3] - 0.004);

  // The seats: one bench per pair per row, back-rests to the rear. The first row sits behind the driver.
  for (let row = 0; row < rows; row++) {
    const x = front + ROW_PITCH * (row + 0.5) + 0.008;
    for (const side of [0, 1]) {
      const b = bench();
      b.position.set(x, BUS_FLOOR_Y, (SEAT_Z[side * 2] + SEAT_Z[side * 2 + 1]) / 2);
      body.add(b);
    }
  }

  // Wheels: four, with hubs, in arches.
  const wheels: Mesh[] = [];
  for (const x of [noseX + 0.06, tailX - 0.055]) {
    for (const side of [-1, 1]) {
      const w = new Mesh(new CylinderGeometry(0.024, 0.024, 0.012, 24), tyre);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.024, side * (BUS_WIDTH / 2 + 0.002));
      const h = new Mesh(new CylinderGeometry(0.013, 0.013, 0.013, 16), hub);
      h.rotation.x = Math.PI / 2;
      w.add(h);
      h.rotation.set(0, 0, 0);
      group.add(w);
      wheels.push(w);
    }
  }
  castShadows(group, true);
  glass.transparent = true;

  return {
    group,
    rows,
    centreX,
    half: { x: length / 2 + 0.01, z: BUS_WIDTH / 2 + 0.01 },
    cabin: { front, rear },
    seatLocal: (seat: number) => new Vector3(front + ROW_PITCH * (seatRow(seat) + 0.5), SEAT_TOP_Y, SEAT_Z[seatColumn(seat)]),
    driverLocal,
    parts: { body, wheels },
  };
}
