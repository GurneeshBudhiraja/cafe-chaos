/**
 * The look of a puppy: a soft, plush little dog built from rounded parts
 * (a capsule body, a round head with a muzzle and floppy ears, stubby legs
 * with round paws, a curling tail, sleepy closed eyes), in one of five
 * poses and one of several coats. The coats are painted canvases: a base
 * fur with a fine grain, and for the patched coats a few soft blotches.
 *
 * Frame: the puppy's origin is the centre of its footprint's bounding box,
 * on the ground; Y is up; the footprint's columns run along +X and its
 * rows along +Z. Parts the animation moves are named (see PuppyParts).
 * Runtime only (it paints canvases).
 */

import {
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { CELL, footprintSize, PUPPY_SCALE, type Pose } from './shapes.js';

export type Coat = 'golden' | 'choco' | 'blacktan' | 'patched' | 'grey' | 'cream';
export const COATS: Coat[] = ['golden', 'choco', 'blacktan', 'patched', 'grey', 'cream'];

/** The parts the animation moves, kept on the group's userData. */
export interface PuppyParts {
  /** Breathing: scaled gently up and down. */
  body: Object3D;
  /** The tail's pivot (at its base): wagged about Y. */
  tail: Object3D;
  /** The ears' pivots: twitched now and then. */
  ears: Object3D[];
  /** The whole puppy's root for the snuggle squash. */
  root: Group;
}

const COAT_COLORS: Record<Coat, { fur: string; dark: string; accent: string; blotch?: string }> = {
  golden: { fur: '#e2b36b', dark: '#b8863f', accent: '#f4dcaf' },
  choco: { fur: '#6b3f26', dark: '#452616', accent: '#a9775a' },
  blacktan: { fur: '#2d2a2c', dark: '#1a1819', accent: '#c88f55' },
  patched: { fur: '#f3ece0', dark: '#8f5a3c', accent: '#f7f2e8', blotch: '#8f5a3c' },
  grey: { fur: '#9a9aa3', dark: '#6b6b74', accent: '#d9d9de' },
  cream: { fur: '#f1e3c9', dark: '#cdb48e', accent: '#fbf5ea' },
};

function hash(a: number, b: number, k = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The fur: the base colour with a fine grain, and blotches for a patched coat. */
function furTexture(coat: Coat, seed: number): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const colors = COAT_COLORS[coat];
  ctx.fillStyle = colors.fur;
  ctx.fillRect(0, 0, size, size);
  if (colors.blotch) {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors.blotch;
      ctx.beginPath();
      const cx = hash(seed, i, 1) * size;
      const cy = hash(seed, i, 2) * size;
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const r = 28 + hash(seed, i * 13 + k, 3) * 22;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.8;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  // Fine fur grain: short darker and lighter strokes.
  for (let i = 0; i < 2600; i++) {
    const x = hash(seed, i, 4) * size;
    const y = hash(seed, i, 5) * size;
    ctx.strokeStyle = hash(seed, i, 6) > 0.5 ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (hash(seed, i, 7) - 0.5) * 6, y + 3 + hash(seed, i, 8) * 4);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

interface Materials {
  fur: MeshStandardMaterial;
  dark: MeshStandardMaterial;
  accent: MeshStandardMaterial;
  nose: MeshStandardMaterial;
}

const noseMaterial = new MeshStandardMaterial({ color: 0x2a2024, roughness: 0.35 });
const materialCache = new Map<string, Materials>();
function materials(coat: Coat, seed: number): Materials {
  const key = `${coat}:${seed % 7}`;
  let m = materialCache.get(key);
  if (!m) {
    const colors = COAT_COLORS[coat];
    m = {
      fur: new MeshStandardMaterial({ map: furTexture(coat, seed % 7), roughness: 0.96, metalness: 0 }),
      dark: new MeshStandardMaterial({ color: colors.dark, roughness: 0.95 }),
      accent: new MeshStandardMaterial({ color: colors.accent, roughness: 0.95 }),
      nose: noseMaterial,
    };
    materialCache.set(key, m);
  }
  return m;
}

// Shared geometries.
const sphere = new SphereGeometry(1, 20, 14);
const eyeArc = new TorusGeometry(0.0046, 0.0016, 5, 10, Math.PI);
const pawGeometry = new SphereGeometry(0.0085, 12, 9);
const COLLAR_COLORS = [0xe25d5d, 0x4f9ad6, 0x62b86a, 0xf0b33c, 0xa36bd6, 0xef8fb5];
const tagGeometry = new SphereGeometry(0.0045, 10, 8);

function ball(m: MeshStandardMaterial, rx: number, ry: number, rz: number, name = ''): Mesh {
  const mesh = new Mesh(sphere, m);
  mesh.scale.set(rx, ry, rz);
  mesh.name = name;
  return mesh;
}

/** A capsule lying along +X (its length between the cap centres). */
function capsule(m: MeshStandardMaterial, radius: number, length: number, name = ''): Mesh {
  const mesh = new Mesh(new CapsuleGeometry(radius, length, 6, 16), m);
  mesh.rotation.z = Math.PI / 2;
  mesh.name = name;
  return mesh;
}

/** A head looking along -Z (the muzzle out front), with closed eyes, floppy ears and a collar. Returns the head and its ear pivots. */
function createHead(m: Materials, r: number, seed = 0): { head: Group; ears: Object3D[] } {
  const head = new Group();
  head.name = 'Head';
  // A collar with a little tag, round the neck below the head.
  const collarMaterial = new MeshStandardMaterial({ color: COLLAR_COLORS[seed % COLLAR_COLORS.length], roughness: 0.5 });
  const collar = new Mesh(new TorusGeometry(r * 0.72, r * 0.11, 8, 24), collarMaterial);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, -r * 0.62, r * 0.1);
  collar.name = 'Collar';
  head.add(collar);
  const tag = new Mesh(tagGeometry, new MeshStandardMaterial({ color: 0xe6c35a, metalness: 0.8, roughness: 0.3 }));
  tag.position.set(0, -r * 0.78, -r * 0.6);
  tag.scale.set(1, 1, 0.4);
  tag.name = 'Tag';
  head.add(tag);
  head.add(ball(m.fur, r, r * 0.92, r * 0.95, 'Skull'));
  const muzzle = ball(m.accent, r * 0.52, r * 0.4, r * 0.55, 'Muzzle');
  muzzle.position.set(0, -r * 0.22, -r * 0.72);
  head.add(muzzle);
  const nose = ball(m.nose, r * 0.19, r * 0.15, r * 0.17, 'Nose');
  nose.position.set(0, -r * 0.1, -r * 1.22);
  head.add(nose);
  // Closed, content eyes: two little arcs.
  for (const side of [-1, 1]) {
    const eye = new Mesh(eyeArc, m.nose);
    eye.position.set(side * r * 0.42, r * 0.12, -r * 0.82);
    eye.rotation.set(0, 0, Math.PI);
    eye.scale.setScalar(r / 0.03);
    eye.name = 'Eye';
    head.add(eye);
  }
  // Floppy ears hanging from the sides, hinged at the top.
  const ears: Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new Group();
    pivot.position.set(side * r * 0.78, r * 0.55, -r * 0.05);
    const ear = ball(m.dark, r * 0.42, r * 0.7, r * 0.22, 'Ear');
    ear.position.set(side * r * 0.12, -r * 0.55, 0);
    ear.rotation.z = -side * 0.25;
    pivot.add(ear);
    pivot.name = 'EarPivot';
    head.add(pivot);
    ears.push(pivot);
  }
  return { head, ears };
}

/** A tail from `from` through `via` to `to` (in the pivot's frame), as a slim tube; returns its pivot. */
function createTail(m: Materials, points: [number, number, number][], radius = 0.0065): Group {
  const pivot = new Group();
  pivot.name = 'TailPivot';
  const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
  const tail = new Mesh(new TubeGeometry(curve, 14, radius, 8), m.fur);
  tail.name = 'Tail';
  const tip = ball(m.accent, radius * 1.1, radius * 1.1, radius * 1.1, 'TailTip');
  tip.position.copy(curve.getPoint(1));
  pivot.add(tail, tip);
  return pivot;
}

function createLeg(m: Materials, radius: number, length: number, name = 'Leg'): Group {
  const leg = new Group();
  leg.name = name;
  const bone = capsule(m.fur, radius, length);
  bone.position.x = length / 2;
  const paw = new Mesh(pawGeometry, m.accent);
  paw.position.set(length + radius * 0.4, -radius * 0.1, 0);
  paw.scale.set(1.1, 0.8, 1.2);
  paw.name = 'Paw';
  leg.add(bone, paw);
  return leg;
}

/** Build a puppy in a pose. `seed` varies the coat's blotches and the lean. */
export function createPuppyLook(pose: Pose, coat: Coat, seed = 0): { group: Group; parts: PuppyParts } {
  const m = materials(coat, seed);
  const root = new Group();
  root.name = 'Puppy';
  // The pose, built around the footprint's centre.
  const posed = new Group();
  posed.name = `Pose:${pose}`;
  root.add(posed);
  let body: Object3D;
  let tail: Group;
  let ears: Object3D[];
  let tailOverride: [number, number, number][] = [];

  if (pose === 'tiny') {
    // A ball of a pup: round body, head tucked on top, tail round the side.
    body = ball(m.fur, 0.022, 0.017, 0.022, 'Body');
    body.position.y = 0.017;
    const h = createHead(m, 0.019, seed);
    // Head up front (+Z), chin on its paws, ears out.
    h.head.position.set(0.002, 0.024, 0.011);
    h.head.rotation.set(0.3, Math.PI - 0.3, 0);
    ears = h.ears;
    tail = createTail(m, [[0, 0, 0], [0.012, 0.004, 0.008], [0.016, 0.006, 0.02]], 0.005);
    tail.position.set(-0.014, 0.012, 0.008);
    posed.add(body, h.head, tail);
  } else if (pose === 'loaf') {
    // Sphinx: body along Z, head up at the front (+Z, toward the player), front paws out ahead.
    body = capsule(m.fur, 0.023, 0.04, 'Body');
    body.rotation.set(0, Math.PI / 2, Math.PI / 2);
    body.position.set(0, 0.022, -0.008);
    const h = createHead(m, 0.026, seed);
    h.head.position.set(0, 0.046, 0.03);
    h.head.rotation.set(0.15, Math.PI, 0);
    ears = h.ears;
    for (const side of [-1, 1]) {
      const leg = createLeg(m, 0.0085, 0.028, 'FrontLeg');
      leg.position.set(side * 0.014, 0.009, 0.028);
      leg.rotation.y = -Math.PI / 2;
      posed.add(leg);
      // Hind legs tucked beside the body.
      const haunch = ball(m.fur, 0.014, 0.012, 0.016, 'Haunch');
      haunch.position.set(side * 0.022, 0.012, -0.03);
      posed.add(haunch);
    }
    tail = createTail(m, [[0, 0, 0], [0.012, 0.004, -0.018], [0.03, 0.006, -0.026]]);
    tail.position.set(0.004, 0.012, -0.034);
    posed.add(body, h.head, tail);
  } else if (pose === 'sprawl') {
    // Flat on the belly in column 0, head at the +Z end, hind legs and tail out into column 1 at the -Z end.
    const cx = -CELL / PUPPY_SCALE / 2; // The body's column centre (modelled units).
    body = capsule(m.fur, 0.022, 0.05, 'Body');
    body.rotation.set(0, Math.PI / 2, Math.PI / 2);
    body.position.set(cx, 0.018, 0.0);
    body.scale.set(1, 0.85, 1);
    const h = createHead(m, 0.026, seed);
    h.head.position.set(cx, 0.03, 0.045);
    h.head.rotation.set(0.25, Math.PI, 0);
    ears = h.ears;
    for (const side of [-1, 1]) {
      const leg = createLeg(m, 0.008, 0.03, 'FrontLeg');
      leg.position.set(cx + side * 0.018, 0.008, 0.03);
      leg.rotation.y = -Math.PI / 2;
      leg.rotation.z = side * 0.35;
      posed.add(leg);
    }
    // Both hind legs splayed out to +X.
    for (const k of [0, 1]) {
      const leg = createLeg(m, 0.0085, 0.034, 'HindLeg');
      leg.position.set(cx + 0.012, 0.009, -0.03 + k * 0.014);
      leg.rotation.y = -0.2 + k * 0.35;
      posed.add(leg);
    }
    tail = createTail(m, [[0, 0, 0], [0.016, 0.004, -0.008], [0.034, 0.006, -0.006]]);
    tail.position.set(cx + 0.008, 0.012, -0.03);
    posed.add(body, h.head, tail);
  } else if (pose === 'stretch') {
    // On its side along X, head at +X, legs stretched out front and back, tail trailing at -X.
    body = capsule(m.fur, 0.024, 0.06, 'Body');
    body.position.set(0.002, 0.02, 0);
    body.scale.set(1, 0.85, 1);
    const h = createHead(m, 0.026, seed);
    h.head.position.set(0.058, 0.022, 0);
    // Lying on its side: the muzzle points +X, the ears flop toward the ground.
    h.head.rotation.set(0, -Math.PI / 2, 0);
    h.head.rotateX(-Math.PI / 2 + 0.3);
    ears = h.ears;
    for (const k of [0, 1]) {
      const front = createLeg(m, 0.008, 0.032, 'FrontLeg');
      front.position.set(0.028, 0.012 + k * 0.012, 0.012 - k * 0.006);
      front.rotation.y = -0.15 + k * 0.3;
      posed.add(front);
      const hind = createLeg(m, 0.0085, 0.034, 'HindLeg');
      hind.position.set(-0.026, 0.011 + k * 0.012, 0.01 - k * 0.004);
      hind.rotation.y = Math.PI + 0.2 - k * 0.35;
      posed.add(hind);
    }
    tail = createTail(m, [[0, 0, 0], [-0.016, 0.0, 0.008], [-0.034, 0.002, 0.004]]);
    tail.position.set(-0.03, 0.014, -0.004);
    posed.add(body, h.head, tail);
  } else {
    // Curled in a ring: the body is a flattened torus, the head rests on it at the front, the tail curls over the back.
    const ring = new Mesh(new TorusGeometry(0.029, 0.021, 12, 24), m.fur);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1, 1, 0.8);
    ring.position.y = 0.017;
    ring.name = 'Body';
    body = ring;
    const h = createHead(m, 0.026, seed);
    // Resting on the ring at the front (+Z), looking up at the player a little.
    h.head.position.set(0.012, 0.036, 0.026);
    h.head.rotation.set(0.45, Math.PI + 0.5, -0.15);
    tailOverride = [[0, 0, 0], [-0.012, 0.012, 0.012], [-0.03, 0.016, 0.02], [-0.04, 0.012, 0.03]];
    ears = h.ears;
    // A hind paw peeking out, and the tail curling across the top.
    const paw = new Mesh(pawGeometry, m.accent);
    paw.position.set(0.03, 0.012, 0.03);
    paw.scale.set(1.2, 0.8, 1.2);
    posed.add(paw);
    tail = createTail(m, tailOverride);
    tail.position.set(0.03, 0.02, -0.012);
    posed.add(body, h.head, tail);
  }

  // A touch of individuality: a slight lean. And the modelled size, scaled to the cell.
  posed.rotation.y = (hash(seed, 1, 9) - 0.5) * 0.12;
  posed.scale.setScalar(PUPPY_SCALE);
  root.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = false;
  });
  return { group: root, parts: { body, tail, ears, root } };
}

/** The footprint's size in metres (unturned), for scattering and the hover ring. */
export function footprintMetres(pose: Pose): { width: number; depth: number } {
  const { columns, rows } = footprintSize(pose);
  return { width: columns * CELL, depth: rows * CELL };
}
