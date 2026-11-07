/**
 * The Yappers' look: little egg-shaped creatures the size of a thumb, with
 * big eyes, a beak that yaps, a tuft, stubby arms and feet, and each its
 * own colour and hat so you can tell them apart (the rules name each other
 * by name, and the cards show the portraits). Built from primitives, with
 * a painted body texture (a lighter belly and a soft speckle).
 *
 * Origin at the feet; the Yapper faces +Z. Parts are exposed for the
 * animation system: eyes to blink, brows and beak for the mood, arms to
 * wave, the tuft and hat for a happy wobble.
 */

import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from '@iwsdk/core';
import { castShadows } from '../lighting.js';
import { COLORS, HATS, type Hat } from './rules.js';

/** The body: an egg about this tall (metres); a Yapper stands about 0.05 m tall. */
export const BODY_RADIUS = 0.02;
export const BODY_HEIGHT = BODY_RADIUS * 2.3;
/** The radius of a Yapper's footprint, for hovering and seating. */
export const YAPPER_RADIUS = 0.024;
/** The top of the head (where a hat or the card goes). */
export const HEAD_TOP_Y = BODY_HEIGHT;

export interface YapperParts {
  root: Group;
  body: Mesh;
  eyes: Mesh[];
  pupils: Mesh[];
  brows: Mesh[];
  /** Hinges: rotate about x to open the beak. */
  beakTop: Group;
  beakBottom: Group;
  tuft: Group;
  arms: Mesh[];
  feet: Mesh[];
  hat: Group | null;
  /** Spins when happy (the propeller hat only). */
  spinner: Mesh | null;
}

const white = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const ink = new MeshStandardMaterial({ color: 0x1e1a1f, roughness: 0.4 });
const glint = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.4 });
const beakMaterial = new MeshStandardMaterial({ color: 0xf0a040, roughness: 0.5 });
const beakInside = new MeshStandardMaterial({ color: 0x7a2c33, roughness: 0.8 });
const hatRed = new MeshStandardMaterial({ color: 0xd9484c, roughness: 0.6 });
const hatBlue = new MeshStandardMaterial({ color: 0x3d6fc4, roughness: 0.6 });
const hatPink = new MeshStandardMaterial({ color: 0xf07fb0, roughness: 0.6 });
const hatGreen = new MeshStandardMaterial({ color: 0x4f9f5c, roughness: 0.6 });
const hatYellow = new MeshStandardMaterial({ color: 0xf3cf4a, roughness: 0.6 });
const hatDark = new MeshStandardMaterial({ color: 0x33333a, roughness: 0.5 });
const hatMetal = new MeshStandardMaterial({ color: 0xdedee4, roughness: 0.3, metalness: 0.6 });

function hash(n: number, k = 0): number {
  const s = Math.sin(n * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The body's paint: the colour with a lighter belly in front and a soft speckle. */
function bodyTexture(color: number, seed: number): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const base = new Color(color);
  const light = base.clone().lerp(new Color(0xffffff), 0.45);
  const dark = base.clone().lerp(new Color(0x000000), 0.18);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, size, size);
  // The belly: +Z is at u = 0.25; v runs from the top (0) to the feet (1).
  const grad = ctx.createRadialGradient(size * 0.25, size * 0.68, size * 0.02, size * 0.25, size * 0.68, size * 0.26);
  grad.addColorStop(0, `#${light.getHexString()}`);
  grad.addColorStop(0.7, `#${light.getHexString()}`);
  grad.addColorStop(1, `#${base.getHexString()}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // Speckle, denser toward the back.
  for (let i = 0; i < 260; i++) {
    const x = hash(i + seed * 13) * size;
    const y = hash(i + seed * 13, 1) * size;
    const away = Math.abs(((x / size + 0.75) % 1) - 0.5) * 2;
    if (hash(i, 2) > 0.35 + away * 0.6) continue;
    ctx.fillStyle = `rgba(${Math.round(dark.r * 255)}, ${Math.round(dark.g * 255)}, ${Math.round(dark.b * 255)}, 0.35)`;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + hash(i, 3) * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function hatMaterial(seed: number): MeshStandardMaterial {
  return [hatRed, hatBlue, hatPink, hatGreen, hatYellow][seed % 5];
}

/** A hat, its origin on the top of the head; the glasses sit at eye level instead. */
function createHat(kind: Hat, seed: number): { group: Group | null; spinner: Mesh | null } {
  const g = new Group();
  g.name = `Hat:${kind}`;
  let spinner: Mesh | null = null;
  const m = hatMaterial(seed);
  switch (kind) {
    case 'none':
      return { group: null, spinner: null };
    case 'cap': {
      const dome = new Mesh(new SphereGeometry(0.0125, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m);
      dome.scale.y = 0.75;
      dome.position.y = -0.003;
      const peak = new Mesh(new CylinderGeometry(0.013, 0.013, 0.0015, 20, 1, false, -Math.PI / 2, Math.PI), m);
      peak.position.set(0, -0.003, 0.006);
      peak.scale.z = 0.9;
      const button = new Mesh(new SphereGeometry(0.002, 8, 6), hatDark);
      button.position.y = 0.0065;
      g.add(dome, peak, button);
      break;
    }
    case 'bow': {
      const knot = new Mesh(new SphereGeometry(0.0035, 10, 8), hatPink);
      const left = new Mesh(new SphereGeometry(0.006, 12, 10), hatPink);
      left.scale.set(1.3, 0.75, 0.6);
      left.position.set(-0.007, 0.001, 0);
      const right = left.clone();
      right.position.x = 0.007;
      g.add(knot, left, right);
      g.position.set(0.008, -0.004, 0.004);
      g.rotation.z = -0.5;
      break;
    }
    case 'beanie': {
      const dome = new Mesh(new SphereGeometry(0.0135, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m);
      dome.position.y = -0.004;
      const brim = new Mesh(new TorusGeometry(0.0125, 0.0025, 10, 24), m === hatRed ? hatYellow : hatRed);
      brim.rotation.x = Math.PI / 2;
      brim.position.y = -0.0035;
      const pompom = new Mesh(new SphereGeometry(0.0045, 12, 10), white);
      pompom.position.y = 0.011;
      g.add(dome, brim, pompom);
      break;
    }
    case 'glasses': {
      // Round frames in front of the eyes, joined by a bridge.
      for (const side of [-1, 1]) {
        const rim = new Mesh(new TorusGeometry(0.0062, 0.001, 8, 24), hatDark);
        rim.position.set(side * 0.0078, 0, 0);
        g.add(rim);
      }
      const bridge = new Mesh(new BoxGeometry(0.004, 0.0012, 0.0012), hatDark);
      g.add(bridge);
      g.position.set(0, 0.031 - HEAD_TOP_Y, 0.0215);
      break;
    }
    case 'flower': {
      const stem = new Mesh(new CylinderGeometry(0.001, 0.001, 0.008, 6), hatGreen);
      stem.position.y = 0.002;
      g.add(stem);
      for (let i = 0; i < 5; i++) {
        const petal = new Mesh(new SphereGeometry(0.0035, 10, 8), m === hatGreen ? hatPink : m);
        const a = (i / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.0045, 0.0075, Math.sin(a) * 0.0045);
        petal.scale.y = 0.5;
        g.add(petal);
      }
      const centre = new Mesh(new SphereGeometry(0.0025, 10, 8), hatYellow);
      centre.position.y = 0.0085;
      g.add(centre);
      g.position.set(0.01, -0.003, 0.002);
      g.rotation.z = -0.6;
      break;
    }
    case 'propeller': {
      const cap = new Mesh(new SphereGeometry(0.0115, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m);
      cap.scale.y = 0.65;
      cap.position.y = -0.003;
      const shaft = new Mesh(new CylinderGeometry(0.001, 0.001, 0.007, 8), hatMetal);
      shaft.position.y = 0.006;
      spinner = new Mesh(new BoxGeometry(0.022, 0.0012, 0.004), hatYellow);
      spinner.position.y = 0.0095;
      const blade2 = new Mesh(new BoxGeometry(0.004, 0.0012, 0.022), hatYellow);
      spinner.add(blade2);
      g.add(cap, shaft, spinner);
      break;
    }
    case 'headphones': {
      const band = new Mesh(new TorusGeometry(0.0205, 0.0018, 8, 32, Math.PI), hatDark);
      band.position.y = -0.016;
      for (const side of [-1, 1]) {
        const cup = new Mesh(new CylinderGeometry(0.006, 0.006, 0.004, 16), m);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(side * 0.0215, -0.019, 0.003);
        const pad = new Mesh(new CylinderGeometry(0.0045, 0.0045, 0.002, 16), hatDark);
        pad.rotation.z = Math.PI / 2;
        pad.position.set(side * 0.019, -0.019, 0.003);
        g.add(cup, pad);
      }
      g.add(band);
      break;
    }
  }
  return { group: g, spinner };
}

/** Build a Yapper; `color` and `hat` are indices into COLORS and HATS. */
export function createYapperLook(color: number, hat: number, seed: number): { group: Group; parts: YapperParts } {
  const group = new Group();
  group.name = 'Yapper';
  const root = new Group();
  root.name = 'YapperRoot';
  group.add(root);
  const tint = COLORS[color % COLORS.length];
  const skin = new MeshStandardMaterial({ color: 0xffffff, map: bodyTexture(tint, seed), roughness: 0.7 });
  const darker = new MeshStandardMaterial({ color: new Color(tint).lerp(new Color(0x000000), 0.35), roughness: 0.7 });

  // The body: an egg standing on its feet.
  const body = new Mesh(new SphereGeometry(BODY_RADIUS, 28, 20), skin);
  body.scale.set(1, BODY_HEIGHT / (2 * BODY_RADIUS), 0.95);
  body.position.y = BODY_HEIGHT / 2;
  body.name = 'Body';
  root.add(body);

  // Feet: two small pads, toes forward.
  const feet: Mesh[] = [];
  for (const side of [-1, 1]) {
    const foot = new Mesh(new SphereGeometry(0.0062, 12, 8), darker);
    foot.scale.set(1, 0.5, 1.35);
    foot.position.set(side * 0.0095, 0.003, 0.006);
    root.add(foot);
    feet.push(foot);
  }

  // Arms: short stubs at the sides, hanging a little forward.
  const arms: Mesh[] = [];
  for (const side of [-1, 1]) {
    const arm = new Mesh(new SphereGeometry(0.0055, 12, 8), darker);
    arm.scale.set(0.8, 1.6, 0.8);
    arm.position.set(side * BODY_RADIUS * 0.98, BODY_HEIGHT * 0.45, 0.003);
    arm.rotation.z = side * 0.25;
    root.add(arm);
    arms.push(arm);
  }

  // Eyes: big whites, pupils with a glint, and a brow over each.
  const eyes: Mesh[] = [];
  const pupils: Mesh[] = [];
  const brows: Mesh[] = [];
  const eyeY = BODY_HEIGHT * 0.66;
  for (const side of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(0.0062, 16, 12), white);
    eye.position.set(side * 0.0078, eyeY, 0.0165);
    eye.scale.set(1, 1.15, 0.7);
    const pupil = new Mesh(new SphereGeometry(0.0033, 12, 8), ink);
    pupil.position.set(0, -0.0005, 0.0048);
    pupil.scale.set(1, 1, 0.6);
    const shine = new Mesh(new SphereGeometry(0.0011, 8, 6), glint);
    shine.position.set(-0.0012, 0.0014, 0.003);
    pupil.add(shine);
    eye.add(pupil);
    root.add(eye);
    eyes.push(eye);
    pupils.push(pupil);
    const brow = new Mesh(new BoxGeometry(0.0085, 0.0014, 0.0012), darker);
    brow.position.set(side * 0.0078, eyeY + 0.0095, 0.0185);
    brow.rotation.z = side * 0.15;
    root.add(brow);
    brows.push(brow);
  }

  // The beak: two cones, hinged at the face, that open when yapping.
  const beakTop = new Mesh(new ConeGeometry(0.0048, 0.0095, 12), beakMaterial);
  beakTop.rotation.x = Math.PI / 2;
  beakTop.position.set(0, 0, 0.0045);
  const beakBottom = new Mesh(new ConeGeometry(0.0038, 0.0075, 12), beakMaterial);
  beakBottom.rotation.x = Math.PI / 2;
  beakBottom.position.set(0, -0.0015, 0.0035);
  const topHinge = new Group();
  topHinge.position.set(0, BODY_HEIGHT * 0.5, 0.0175);
  topHinge.add(beakTop);
  const bottomHinge = new Group();
  bottomHinge.position.set(0, BODY_HEIGHT * 0.5 - 0.001, 0.0175);
  bottomHinge.add(beakBottom);
  const mouth = new Mesh(new SphereGeometry(0.003, 8, 6), beakInside);
  mouth.position.set(0, BODY_HEIGHT * 0.5 - 0.0005, 0.0185);
  mouth.scale.set(1.2, 0.6, 0.5);
  root.add(topHinge, bottomHinge, mouth);

  // The tuft: three little feathers on top, leaning back.
  const tuft = new Group();
  tuft.position.y = HEAD_TOP_Y - 0.002;
  for (const [dx, lean, len] of [
    [0, -0.35, 0.011],
    [-0.0035, -0.7, 0.008],
    [0.0035, -0.05, 0.0085],
  ]) {
    const feather = new Mesh(new ConeGeometry(0.0014, len, 6), darker);
    feather.position.set(dx, len / 2, 0);
    const pivot = new Group();
    pivot.add(feather);
    pivot.rotation.x = lean;
    pivot.rotation.z = -dx * 40;
    tuft.add(pivot);
  }
  root.add(tuft);

  // The hat.
  const { group: hatGroup, spinner } = createHat(HATS[hat % HATS.length], seed);
  if (hatGroup) {
    hatGroup.position.y += HEAD_TOP_Y - 0.001;
    if (HATS[hat % HATS.length] !== 'glasses') tuft.visible = false;
    root.add(hatGroup);
  }

  castShadows(group);
  return {
    group,
    parts: { root, body, eyes, pupils, brows, beakTop: topHinge, beakBottom: bottomHinge, tuft, arms, feet, hat: hatGroup, spinner },
  };
}

/** The portrait colours for 2D drawings (cards, the scoreboard). */
export function portraitColors(color: number): { body: string; dark: string } {
  const base = new Color(COLORS[color % COLORS.length]);
  return { body: `#${base.getHexString()}`, dark: `#${base.clone().lerp(new Color(0x000000), 0.35).getHexString()}` };
}
