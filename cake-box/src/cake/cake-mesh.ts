/**
 * The look of a cake piece, built from its footprint polygon: a stack of
 * layers (sponge, jam, sponge, cream, sponge, frosting) extruded straight
 * up, so every cut face shows the layers in their painted textures; a
 * frosted top with soft swirls; strawberries and a piped bead border on
 * top; and grooves where a knife scored the top without cutting through.
 *
 * Frame: the piece's origin is on the board under its footprint's
 * centroid; Y is up; the footprint is in XZ. All metres.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  type Object3D,
} from '@iwsdk/core';
import { centroid, type Polygon, type Vec2 } from './polygon.js';
import { createFrostingTextures, createLayerTextures, createStrawberryTexture, type LayerSpec } from './textures.js';

/** The layers from the bottom up. */
export const LAYERS: LayerSpec[] = [
  { height: 0.026, color: '#ecc47c', roughness: 0.95, look: 'sponge' },
  { height: 0.005, color: '#b21e38', roughness: 0.3, look: 'jam' },
  { height: 0.026, color: '#ecc47c', roughness: 0.95, look: 'sponge' },
  { height: 0.008, color: '#fff7ec', roughness: 0.55, look: 'cream' },
  { height: 0.026, color: '#ecc47c', roughness: 0.95, look: 'sponge' },
  { height: 0.009, color: '#f3b3c5', roughness: 0.5, look: 'frosting' },
];
export const CAKE_HEIGHT = LAYERS.reduce((sum, layer) => sum + layer.height, 0);
const FROSTING_COLOR = '#f7c1d0';
/** The side texture repeats every this many metres around the cake; the top every this many across. */
const SIDE_REPEAT = 0.14;
const TOP_REPEAT = 0.22;
const GROOVE_COLOR = 0xc98fa0;

/** A decoration on top, at [x, z] in the piece's frame. */
export interface Decoration {
  kind: 'strawberry' | 'bead';
  at: Vec2;
}

let materials: { side: MeshStandardMaterial; top: MeshStandardMaterial } | null = null;
function getMaterials() {
  if (materials) return materials;
  const side = createLayerTextures(LAYERS, SIDE_REPEAT);
  const top = createFrostingTextures(FROSTING_COLOR);
  materials = {
    side: new MeshStandardMaterial({ map: side.map, roughnessMap: side.roughnessMap, roughness: 1, metalness: 0 }),
    top: new MeshStandardMaterial({ map: top.map, roughnessMap: top.roughnessMap, roughness: 1, metalness: 0 }),
  };
  return materials;
}

let strawberryMaterial: MeshStandardMaterial | null = null;
const calyxMaterial = new MeshStandardMaterial({ color: 0x3f8a33, roughness: 0.7, side: 2 });
const beadMaterial = new MeshStandardMaterial({ color: 0xfbd6e0, roughness: 0.45, metalness: 0 });
const grooveMaterial = new MeshStandardMaterial({ color: GROOVE_COLOR, roughness: 0.9 });
const boardMaterial = new MeshStandardMaterial({ color: 0xd8dade, metalness: 0.75, roughness: 0.32 });
const beadGeometry = new SphereGeometry(0.0048, 12, 9);
beadGeometry.scale(1, 0.85, 1);

/** Small, repeatable noise (no Math.random: the same cake must always look the same). */
function hash(x: number, z: number, k: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The layered body: side walls (one textured strip) with the bottom, and the frosted top. */
export function createCakeBody(poly: Polygon): Mesh[] {
  const { side, top } = getMaterials();
  const n = poly.length;
  const [cx, cz] = centroid(poly);

  // Sides: one quad per edge over the full height, textured bottom to top.
  const sp: number[] = [];
  const sn: number[] = [];
  const suv: number[] = [];
  let u = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % n];
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez) || 1;
    const nx = ez / len;
    const nz = -ex / len;
    const u0 = u / SIDE_REPEAT;
    const u1 = (u + len) / SIDE_REPEAT;
    u += len;
    // Wound to face outward (three.js front faces are counter-clockwise seen from outside).
    sp.push(ax, 0, az, bx, CAKE_HEIGHT, bz, bx, 0, bz, ax, 0, az, ax, CAKE_HEIGHT, az, bx, CAKE_HEIGHT, bz);
    for (let k = 0; k < 6; k++) sn.push(nx, 0, nz);
    suv.push(u0, 0, u1, 1, u1, 0, u0, 0, u0, 1, u1, 1);
  }
  // The bottom: a fan, mapped into the bottom sponge band.
  const bottomV = (LAYERS[0].height * 0.5) / CAKE_HEIGHT;
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % n];
    sp.push(cx, 0, cz, ax, 0, az, bx, 0, bz);
    sn.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
    suv.push(0.5, bottomV, ax / SIDE_REPEAT + 0.5, bottomV, bx / SIDE_REPEAT + 0.5, bottomV);
  }
  const sideGeometry = new BufferGeometry();
  sideGeometry.setAttribute('position', new BufferAttribute(new Float32Array(sp), 3));
  sideGeometry.setAttribute('normal', new BufferAttribute(new Float32Array(sn), 3));
  sideGeometry.setAttribute('uv', new BufferAttribute(new Float32Array(suv), 2));
  sideGeometry.computeBoundingSphere();
  const sides = new Mesh(sideGeometry, side);
  sides.name = 'CakeSides';

  // The top: a fan around the centroid, mapped by position so the swirls run on across cuts.
  const tp: number[] = [];
  const tuv: number[] = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % n];
    tp.push(cx, CAKE_HEIGHT, cz, bx, CAKE_HEIGHT, bz, ax, CAKE_HEIGHT, az);
    tuv.push(cx / TOP_REPEAT, cz / TOP_REPEAT, bx / TOP_REPEAT, bz / TOP_REPEAT, ax / TOP_REPEAT, az / TOP_REPEAT);
  }
  const topGeometry = new BufferGeometry();
  topGeometry.setAttribute('position', new BufferAttribute(new Float32Array(tp), 3));
  topGeometry.setAttribute('normal', new BufferAttribute(new Float32Array(tp.map((_, k) => (k % 3 === 1 ? 1 : 0))), 3));
  topGeometry.setAttribute('uv', new BufferAttribute(new Float32Array(tuv), 2));
  topGeometry.computeBoundingSphere();
  const topMesh = new Mesh(topGeometry, top);
  topMesh.name = 'CakeTop';
  return [sides, topMesh];
}

// ------------------------------------------------------------ strawberry

let strawberryGeometry: LatheGeometry | null = null;
/** A strawberry standing on its wide end, point up, with its seeds painted into the vertex colours. */
function getStrawberryGeometry(): LatheGeometry {
  if (strawberryGeometry) return strawberryGeometry;
  const profile: [number, number][] = [
    [0.0, 0.0],
    [0.005, 0.0008],
    [0.0085, 0.003],
    [0.0105, 0.008],
    [0.0108, 0.013],
    [0.0098, 0.018],
    [0.0078, 0.023],
    [0.005, 0.027],
    [0.0022, 0.0295],
    [0.0, 0.0305],
  ];
  const segments = 22;
  const g = new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
  g.computeVertexNormals();
  strawberryGeometry = g;
  return g;
}

let calyxGeometry: ShapeGeometry | null = null;
function getCalyxGeometry(): ShapeGeometry {
  if (calyxGeometry) return calyxGeometry;
  const shape = new Shape();
  const leaves = 6;
  for (let i = 0; i <= leaves; i++) {
    const a = (i / leaves) * Math.PI * 2;
    const tip = [Math.cos(a) * 0.0115, Math.sin(a) * 0.0115];
    const mid = [Math.cos(a + Math.PI / leaves) * 0.004, Math.sin(a + Math.PI / leaves) * 0.004];
    if (i === 0) shape.moveTo(tip[0], tip[1]);
    else shape.lineTo(tip[0], tip[1]);
    shape.lineTo(mid[0], mid[1]);
  }
  calyxGeometry = new ShapeGeometry(shape, 1);
  calyxGeometry.rotateX(-Math.PI / 2);
  return calyxGeometry;
}

function createStrawberry(at: Vec2): Group {
  const berry = new Group();
  berry.name = 'Strawberry';
  strawberryMaterial ??= new MeshStandardMaterial({ map: createStrawberryTexture(), roughness: 0.28, metalness: 0 });
  const flesh = new Mesh(getStrawberryGeometry(), strawberryMaterial);
  const calyx = new Mesh(getCalyxGeometry(), calyxMaterial);
  calyx.position.y = 0.0012;
  const stem = new Mesh(new CylinderGeometry(0.0009, 0.0012, 0.006, 6), calyxMaterial);
  stem.position.y = 0.002;
  stem.rotation.z = 0.25;
  berry.add(flesh, calyx, stem);
  // Pressed a little into the frosting, leaning slightly, turned at random.
  berry.position.set(at[0], CAKE_HEIGHT - 0.0015, at[1]);
  berry.rotation.y = hash(at[0], at[1], 3) * Math.PI * 2;
  berry.rotation.z = (hash(at[0], at[1], 5) - 0.5) * 0.25;
  berry.rotation.x = (hash(at[0], at[1], 6) - 0.5) * 0.25;
  return berry;
}

function createBead(at: Vec2): Mesh {
  const bead = new Mesh(beadGeometry, beadMaterial);
  bead.name = 'Bead';
  bead.position.set(at[0], CAKE_HEIGHT + 0.001, at[1]);
  return bead;
}

/** A knife's score line across the top: a shallow groove from `a` to `b`. */
function createGroove([a, b]: [Vec2, Vec2]): Mesh {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const geometry = new BufferGeometry();
  // A thin strip just above the frosting (no depth: it is a mark, not a hole).
  const w = 0.0012;
  const strip = new Float32Array([-len / 2, 0, -w, len / 2, 0, w, len / 2, 0, -w, -len / 2, 0, -w, -len / 2, 0, w, len / 2, 0, w]);
  geometry.setAttribute('position', new BufferAttribute(strip, 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  const mesh = new Mesh(geometry, grooveMaterial);
  mesh.name = 'Groove';
  mesh.position.set((a[0] + b[0]) / 2, CAKE_HEIGHT + 0.0006, (a[1] + b[1]) / 2);
  mesh.rotation.y = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  return mesh;
}

/** Everything a cake piece looks like: the body, its decorations and any grooves. */
export function buildCakeLook(poly: Polygon, decorations: Decoration[], grooves: [Vec2, Vec2][]): Object3D[] {
  const parts: Object3D[] = [...createCakeBody(poly)];
  for (const deco of decorations) parts.push(deco.kind === 'bead' ? createBead(deco.at) : createStrawberry(deco.at));
  for (const groove of grooves) parts.push(createGroove(groove));
  return parts;
}

/** The decorations of a whole cake: a piped bead border just inside its outline, and strawberries on top. */
export function decorateCake(poly: Polygon, strawberries: Vec2[]): Decoration[] {
  const decorations: Decoration[] = strawberries.map((at) => ({ kind: 'strawberry', at }));
  const inset = 0.0065;
  const spacing = 0.0108;
  const n = poly.length;
  const [cx, cz] = centroid(poly);
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % n];
    const len = Math.hypot(bx - ax, bz - az);
    const count = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      let x = ax + (bx - ax) * t;
      let z = az + (bz - az) * t;
      // Pull in toward the centre by the inset.
      const dx = cx - x;
      const dz = cz - z;
      const d = Math.hypot(dx, dz) || 1;
      x += (dx / d) * inset;
      z += (dz / d) * inset;
      decorations.push({ kind: 'bead', at: [x, z] });
    }
  }
  return decorations;
}

/** A round silver cake board for a cake of the given bounding radius, resting on the cutting board. */
export function createCakeBoard(radius: number): Mesh {
  const board = new Mesh(new CylinderGeometry(radius + 0.018, radius + 0.02, 0.004, 48), boardMaterial);
  board.name = 'CakeBoard';
  board.position.y = 0.002;
  return board;
}
