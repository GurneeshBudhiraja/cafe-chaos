/**
 * A small, bright kitchen-diner room around the player (metres): wooden
 * plank floor, warm walls with a skirting board, a window letting in
 * daylight, and a ceiling. Origin on the floor at the room's centre; the
 * floor's top is y = 0. 4.4 m wide, 4.8 m deep, 2.6 m high.
 */

import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from '@iwsdk/core';

const WIDTH = 4.4;
const DEPTH = 4.8;
const HEIGHT = 2.6;

/** Repeatable noise (the module must be deterministic). */
function hash(n: number): number {
  const s = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
}

/** Oak planks: one canvas tile of staggered boards with a soft grain. */
function plankTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  // One tile is 2.4 m x 1.2 m of floor: eight rows of boards 15 cm wide,
  // 0.9 to 1.6 m long.
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rows = 8;
  const rowH = canvas.height / rows;
  for (let r = 0; r < rows; r++) {
    let x = -hash(r) * 500;
    let i = 0;
    while (x < canvas.width) {
      const w = 380 + hash(r * 7 + i) * 300;
      const tone = 118 + hash(r * 13 + i * 3) * 20;
      ctx.fillStyle = `rgb(${tone + 40}, ${tone}, ${tone - 55})`;
      ctx.fillRect(x, r * rowH, w, rowH);
      // Grain.
      for (let g = 0; g < 8; g++) {
        ctx.strokeStyle = `rgba(90, 60, 30, ${0.05 + hash(g + r * 31 + i) * 0.08})`;
        ctx.lineWidth = 1 + hash(g * 5 + i) * 2;
        const y = r * rowH + hash(g * 11 + i * 2 + r) * rowH;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + w * 0.3, y + 4, x + w * 0.6, y - 4, x + w, y + 2);
        ctx.stroke();
      }
      // Seams.
      ctx.fillStyle = 'rgba(60, 40, 22, 0.45)';
      ctx.fillRect(x, r * rowH, 2, rowH);
      x += w;
      i++;
    }
    ctx.fillStyle = 'rgba(60, 40, 22, 0.55)';
    ctx.fillRect(0, r * rowH, canvas.width, 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(WIDTH / 2.4, DEPTH / 1.2);
  texture.anisotropy = 8;
  return texture;
}

function createRoom(): Group {
  const root = new Group();
  root.name = 'KitchenRoom';

  const floor = new Mesh(
    new PlaneGeometry(WIDTH, DEPTH),
    new MeshLambertMaterial({ color: 0xffffff, map: plankTexture() }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'Floor';
  floor.receiveShadow = true;
  root.add(floor);

  // Walls and ceiling: the inside of a box.
  const shell = new Mesh(
    new BoxGeometry(WIDTH, HEIGHT, DEPTH),
    new MeshLambertMaterial({ color: 0xcdbca4, side: BackSide }),
  );
  // Its floor face sits just under the plank floor.
  shell.position.y = HEIGHT / 2 - 0.005;
  shell.name = 'Walls';
  shell.receiveShadow = true;
  root.add(shell);

  // Skirting board around the floor.
  const skirtMaterial = new MeshLambertMaterial({ color: 0xfaf7f1 });
  for (const [w, d, x, z] of [
    [WIDTH, 0.02, 0, -DEPTH / 2 + 0.01],
    [WIDTH, 0.02, 0, DEPTH / 2 - 0.01],
    [0.02, DEPTH, -WIDTH / 2 + 0.01, 0],
    [0.02, DEPTH, WIDTH / 2 - 0.01, 0],
  ]) {
    const skirt = new Mesh(new BoxGeometry(w, 0.09, d), skirtMaterial);
    skirt.position.set(x, 0.045, z);
    skirt.name = 'Skirting';
    root.add(skirt);
  }

  // A window on the front wall: bright sky behind a white frame.
  const window = new Group();
  window.name = 'Window';
  const sky = new Mesh(new PlaneGeometry(1.4, 1.1), new MeshBasicMaterial({ color: 0xdcecf7 }));
  window.add(sky);
  const frameMaterial = new MeshLambertMaterial({ color: 0xffffff });
  for (const [w, h, x, y] of [
    [1.5, 0.06, 0, 0.58],
    [1.5, 0.06, 0, -0.58],
    [0.06, 1.22, -0.72, 0],
    [0.06, 1.22, 0.72, 0],
    [0.04, 1.1, 0, 0],
    [1.4, 0.04, 0, 0.1],
  ]) {
    const bar = new Mesh(new BoxGeometry(w, h, 0.04), frameMaterial);
    bar.position.set(x, y, 0.02);
    window.add(bar);
  }
  window.position.set(0.3, 1.55, -DEPTH / 2 + 0.005);
  root.add(window);
  return root;
}

export const kitchenRoomPrototype = createRoom();
