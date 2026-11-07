/**
 * What the player sees of the score: a small scoreboard standing behind
 * the box, and the same on a little panel riding on the back of the left
 * wrist (like a watch), so a glance at the hand says how the level is
 * going. Both are canvases painted by `paintStatus`.
 */

import { CanvasTexture, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D, type World } from '@iwsdk/core';
import type { LevelScore } from '../systems/box-system.js';
import { fitGrade } from './box.js';
import type { Level } from './level.js';

const GRADE_COLORS = { great: '#4fbf5f', close: '#e6b23a', off: '#dd5f69' };

export interface Status {
  level: Level | null;
  score: LevelScore;
  cuts: number;
}

/** Paint the status: the difficulty, the cuts, a tile per card with its fit, and the stars. */
export function paintStatus(canvas: HTMLCanvasElement, status: Status): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  // A soft cream card with a rounded edge.
  ctx.fillStyle = '#fff8ef';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.06);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190, 120, 145, 0.6)';
  ctx.lineWidth = w * 0.012;
  ctx.stroke();
  const { level, score, cuts } = status;
  const pad = w * 0.07;
  ctx.fillStyle = '#9a4d66';
  ctx.font = `bold ${Math.round(h * 0.17)}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const title = level ? level.difficulty[0].toUpperCase() + level.difficulty.slice(1) : 'Cake Box';
  ctx.fillText(title, pad, pad);
  if (!level) return;
  ctx.font = `${Math.round(h * 0.12)}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillStyle = cuts > level.cuts.length ? '#c0504f' : '#6a6a6a';
  ctx.fillText(`cuts ${cuts} / ${level.cuts.length}`, w - pad, pad + h * 0.03);
  // One tile per card: its shape, and its fit once a piece is in.
  const n = level.cards.length;
  const tileW = (w - 2 * pad - (n - 1) * pad * 0.5) / n;
  const tileH = h * 0.44;
  const top = pad + h * 0.24;
  level.cards.forEach((card, i) => {
    const x = pad + i * (tileW + pad * 0.5);
    const fit = score.fits[i] ?? null;
    ctx.fillStyle = fit === null ? '#f6ebe0' : `${GRADE_COLORS[fitGrade(fit)]}55`;
    ctx.beginPath();
    ctx.roundRect(x, top, tileW, tileH, w * 0.02);
    ctx.fill();
    // The card's shape, fitted into the tile.
    const xs = card.polygon.map((p) => p[0]);
    const zs = card.polygon.map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) || 1;
    const scale = (Math.min(tileW, tileH) * 0.62) / span;
    const cx = x + tileW / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * scale;
    const cz = top + tileH * 0.46 - ((Math.max(...zs) + Math.min(...zs)) / 2) * scale;
    ctx.beginPath();
    card.polygon.forEach(([px, pz], k) => (k ? ctx.lineTo(cx + px * scale, cz + pz * scale) : ctx.moveTo(cx + px * scale, cz + pz * scale)));
    ctx.closePath();
    ctx.fillStyle = fit === null ? 'rgba(240, 150, 175, 0.5)' : GRADE_COLORS[fitGrade(fit)];
    ctx.fill();
    ctx.strokeStyle = '#b85c78';
    ctx.lineWidth = w * 0.006;
    ctx.stroke();
    ctx.fillStyle = '#6a6a6a';
    ctx.font = `bold ${Math.round(h * 0.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(fit === null ? `card ${i + 1}` : `${Math.round(fit * 100)}%`, x + tileW / 2, top + tileH - h * 0.13);
  });
  // The stars, or what to do next.
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(h * 0.15)}px sans-serif`;
  if (score.complete) {
    ctx.fillStyle = '#e0a526';
    ctx.fillText('★'.repeat(score.stars) + '☆'.repeat(3 - score.stars), w / 2, h - pad - h * 0.15);
  } else {
    ctx.fillStyle = '#9a9a9a';
    ctx.font = `${Math.round(h * 0.1)}px sans-serif`;
    const filled = score.fits.filter((f) => f !== null).length;
    ctx.fillText(filled === 0 ? 'cut the cake to match the cards' : `${n - filled} to go`, w / 2, h - pad - h * 0.11);
  }
}

function makePanel(widthM: number, heightM: number, px: number): { mesh: Mesh; canvas: HTMLCanvasElement; texture: CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = Math.round((px * heightM) / widthM);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(new PlaneGeometry(widthM, heightM), new MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.8, side: DoubleSide }));
  return { mesh, canvas, texture };
}

/** The scoreboard: a card leaning on a small stand, placed by the caller. */
export class Scoreboard {
  readonly group = new Group();
  private readonly panel = makePanel(0.2, 0.12, 640);

  constructor() {
    this.group.name = 'Scoreboard';
    const stand = new Mesh(new PlaneGeometry(0.2, 0.12), new MeshStandardMaterial({ color: 0xf2a9bd, roughness: 0.6, side: DoubleSide }));
    stand.position.set(0, 0.06, -0.002);
    this.panel.mesh.position.set(0, 0.06, 0);
    // Leaning back a little, like a card against a stand.
    this.group.add(stand, this.panel.mesh);
    this.group.rotation.x = -0.35;
  }

  show(status: Status): void {
    paintStatus(this.panel.canvas, status);
    this.panel.texture.needsUpdate = true;
  }
}

/** The wrist panel: rides on the back of the left wrist, facing out of the back of the hand. */
export class WristHud {
  readonly group = new Group();
  private readonly panel = makePanel(0.075, 0.045, 480);
  private readonly matrix = new Matrix4();
  private readonly wristAt = new Vector3();
  private readonly forward = new Vector3();
  private readonly side = new Vector3();
  private readonly back = new Vector3();
  private readonly across = new Vector3();

  constructor(private readonly world: World) {
    this.group.name = 'WristHud';
    this.group.add(this.panel.mesh);
    this.group.visible = false;
    world.createTransformEntity(this.group);
  }

  show(status: Status): void {
    paintStatus(this.panel.canvas, status);
    this.panel.texture.needsUpdate = true;
  }

  /**
   * Call every frame: sits over the back of the left hand, like a watch,
   * if the hand is tracked. The hand's own directions come from its
   * joints: forward from the wrist to the middle knuckle, across from the
   * little-finger knuckle to the index knuckle, and out of the back of
   * the hand from those two.
   */
  follow(): void {
    const visual = this.world.input.xr.visualAdapters.hand.left?.visual as { joints?: (Object3D | undefined)[]; model?: Object3D } | undefined;
    const joints = visual?.joints;
    const wrist = joints?.[0];
    const middle = joints?.[11];
    const index = joints?.[6];
    const little = joints?.[21];
    const shown = !!wrist && !!middle && !!index && !!little && !!visual?.model?.visible;
    this.group.visible = shown;
    if (!shown || !wrist || !middle || !index || !little) return;
    wrist.getWorldPosition(this.wristAt);
    this.forward.copy(middle.getWorldPosition(this.forward)).sub(this.wristAt).normalize();
    this.side.copy(index.getWorldPosition(this.side)).sub(little.getWorldPosition(this.across)).normalize();
    // Out of the back of the left hand (seen from the back with the fingers up, its thumb is on the left).
    this.back.crossVectors(this.side, this.forward).normalize();
    this.across.crossVectors(this.forward, this.back).normalize();
    this.group.position.copy(this.wristAt).addScaledVector(this.forward, 0.04).addScaledVector(this.back, 0.022);
    // The panel faces out of the back of the hand, its top toward the fingers.
    this.matrix.makeBasis(this.across, this.forward, this.back);
    this.group.quaternion.setFromRotationMatrix(this.matrix);
  }
}
