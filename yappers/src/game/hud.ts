/**
 * What the player sees of the score: a small departures board standing
 * behind the bus, and the same on a little panel riding on the back of
 * the left wrist (like a watch), so a glance at the hand says how the
 * boarding is going. Both are canvases painted by `paintStatus`: one
 * portrait per Yapper (faded while it queues, beaming once it is seated
 * and content, scowling while a rule of its is broken), the grumbles, and
 * the stars at the end.
 */

import { CanvasTexture, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D, type World } from '@iwsdk/core';
import type { LevelScore } from '../systems/seat-system.js';
import { drawPortrait } from '../yappers/cards.js';
import type { Level } from '../yappers/rules.js';

export type FaceState = 'standing' | 'happy' | 'grumpy' | 'waiting';
export interface Status {
  level: Level | null;
  score: LevelScore;
  /** One per Yapper, in level order. */
  faces: FaceState[];
}

/** Paint the status: the difficulty, the crowd (a portrait per Yapper), the grumbles, and the stars. */
export function paintStatus(canvas: HTMLCanvasElement, status: Status): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fbf6ea';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.06);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60, 90, 150, 0.6)';
  ctx.lineWidth = w * 0.012;
  ctx.stroke();
  const { level, score } = status;
  const pad = w * 0.07;
  ctx.fillStyle = '#2b4a7a';
  ctx.font = `bold ${Math.round(h * 0.17)}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(level ? level.difficulty[0].toUpperCase() + level.difficulty.slice(1) : 'Yappers', pad, pad);
  if (!level) return;
  ctx.font = `${Math.round(h * 0.11)}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillStyle = score.grumbles ? '#c0504f' : '#6a6a6a';
  ctx.fillText(score.grumbles === 1 ? '1 grumble' : `${score.grumbles} grumbles`, w - pad, pad + h * 0.04);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8d88a6';
  ctx.fillText('Route 7', w / 2, pad + h * 0.04);
  // The crowd: a portrait per Yapper.
  const n = level.yappers.length;
  const r = Math.min(h * 0.16, (w - 2 * pad) / (n * 2.5));
  const top = pad + h * 0.3 + r;
  level.yappers.forEach((yapper, i) => {
    const x = pad + r + i * r * 2.5;
    const state = status.faces[i] ?? 'standing';
    ctx.globalAlpha = state === 'standing' ? 0.4 : 1;
    drawPortrait(ctx, x, top, r, yapper.color, yapper.hat, state === 'happy' ? 'happy' : state === 'grumpy' ? 'grumpy' : 'calm');
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = 'center';
  if (score.complete) {
    ctx.fillStyle = '#e0a526';
    ctx.font = `bold ${Math.round(h * 0.15)}px sans-serif`;
    ctx.fillText('★'.repeat(score.stars) + '☆'.repeat(3 - score.stars), w / 2, h - pad - h * 0.15);
  } else {
    ctx.fillStyle = '#8a8a8a';
    ctx.font = `${Math.round(h * 0.1)}px sans-serif`;
    const standing = score.total - score.seated;
    const unhappy = score.seated - score.happy;
    const text = score.seated === 0 ? 'seat everyone so their rules hold' : standing > 0 ? `${standing} still waiting${unhappy ? `, ${unhappy} grumbling` : ''}` : `${unhappy} grumbling`;
    ctx.fillText(text, w / 2, h - pad - h * 0.11);
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

/** The departures board: a card leaning on a small stand, placed by the caller. */
export class Scoreboard {
  readonly group = new Group();
  private readonly panel = makePanel(0.2, 0.12, 640);

  constructor() {
    this.group.name = 'Scoreboard';
    const stand = new Mesh(new PlaneGeometry(0.2, 0.12), new MeshStandardMaterial({ color: 0x2b4a7a, roughness: 0.6, side: DoubleSide }));
    stand.position.set(0, 0.06, -0.002);
    this.panel.mesh.position.set(0, 0.06, 0);
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
    this.matrix.makeBasis(this.across, this.forward, this.back);
    this.group.quaternion.setFromRotationMatrix(this.matrix);
  }
}
