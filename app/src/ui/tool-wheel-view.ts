/**
 * The tool wheel as the user sees it: which segment is aimed at, which tool
 * is current, the word on the hub, and fading in and out.
 *
 * It drives one copy of the `tool-wheel` asset (tool-wheel.scene-asset.ts)
 * and knows its named parts; ToolWheelSystem decides when it opens and what
 * is aimed at. Visual states:
 * - aimed at (hovered): the segment rises off the wheel and grows;
 * - the aim dot: a small warm-white dot on the wheel's face where the nib
 *   points, so aiming always shows where it is;
 * - current tool: its glowing clay rim shows;
 * - the hub's plaque names the aimed-at item, or the current tool.
 */

import {
  CanvasTexture,
  CircleGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type MeshStandardMaterial,
  type Object3D,
} from '@iwsdk/core';
import { WHEEL_ITEMS, WHEEL_LABELS, type ToolId } from '../ink/tool-catalog.js';
import { MeshFade } from './mesh-fade.js';
import { THEME } from './theme.js';

/** How far an aimed-at segment rises off the wheel (asset metres) and how much it grows. */
const HOVER_LIFT_M = 0.008;
const HOVER_SCALE = 1.12;
/** The aim dot: its radius, and the furthest it goes from the centre (asset metres). */
const AIM_DOT_RADIUS_M = 0.0045;
const AIM_DOT_MAX_M = 0.1;
/** Just in front of the segments' faces, and of a raised segment (asset metres). */
const AIM_DOT_Z_M = 0.02;
/** The hub label's size (asset metres, inside the 60 x 20 mm plaque) and canvas resolution. */
const LABEL_W_M = 0.056;
const LABEL_H_M = 0.017;
const LABEL_PX_PER_M = 8000;
const LABEL_FONT = 'tool-wheel-label';
const LABEL_FONT_URL = `${import.meta.env.BASE_URL}fonts/bricolage-ui.ttf`;

interface SegmentParts {
  group: Object3D;
  activeRim: Object3D | undefined;
}

export class ToolWheelView {
  readonly fade: MeshFade;
  private readonly segments: SegmentParts[];
  private readonly currentInk: Mesh | undefined;
  private readonly label: HubLabel;
  private readonly aimDot: Mesh;
  private hovered: number | null = null;
  private current: ToolId | null = null;
  /** The text on the hub when nothing is aimed at. */
  private restingLabel = '';

  constructor(readonly root: Object3D) {
    this.fade = new MeshFade(root);
    this.segments = WHEEL_ITEMS.map((item) => {
      const group = root.getObjectByName(`Segment-${item}`);
      if (!group) throw new Error(`[ToolWheelView] The wheel has no segment for ${item}.`);
      return { group, activeRim: group.getObjectByName('ActiveRim') };
    });
    // The current ink dot gets its own material, so its colour can change.
    const ink = root.getObjectByName('CurrentInk');
    if (ink instanceof Mesh) {
      ink.material = (ink.material as MeshStandardMaterial).clone();
      this.currentInk = ink;
    }
    this.label = new HubLabel();
    const anchor = root.getObjectByName('LabelAnchor');
    (anchor ?? root).add(this.label.mesh);
    this.aimDot = new Mesh(
      new CircleGeometry(AIM_DOT_RADIUS_M, 24),
      new MeshBasicMaterial({ color: THEME.ink, transparent: true, depthWrite: false }),
    );
    this.aimDot.name = 'AimDot';
    this.aimDot.renderOrder = 2;
    root.add(this.aimDot);
  }

  /** Put the aim dot where the nib points (asset metres from the centre), kept on the wheel. */
  setAim(x: number, y: number): void {
    const distance = Math.hypot(x, y);
    const keep = distance > AIM_DOT_MAX_M ? AIM_DOT_MAX_M / distance : 1;
    this.aimDot.position.set(x * keep, y * keep, AIM_DOT_Z_M);
  }

  /** Raise the aimed-at segment (an index into WHEEL_ITEMS), or none. */
  setHovered(index: number | null): void {
    if (index === this.hovered) return;
    if (this.hovered !== null) this.raise(this.hovered, false);
    if (index !== null) this.raise(index, true);
    this.hovered = index;
    this.label.draw(index === null ? this.restingLabel : WHEEL_LABELS[WHEEL_ITEMS[index]]);
  }

  /** Show the current tool's glowing rim, its name at rest, and its ink colour (null hides the dot). */
  setCurrent(tool: ToolId, inkColour: string | null): void {
    if (tool !== this.current) {
      for (let i = 0; i < WHEEL_ITEMS.length; i++) {
        const rim = this.segments[i].activeRim;
        if (rim) rim.visible = WHEEL_ITEMS[i] === tool;
      }
      this.current = tool;
      this.restingLabel = WHEEL_LABELS[tool];
      if (this.hovered === null) this.label.draw(this.restingLabel);
    }
    if (this.currentInk) {
      this.currentInk.visible = inkColour !== null;
      if (inkColour) (this.currentInk.material as MeshStandardMaterial).color.set(inkColour);
    }
  }

  dispose(): void {
    this.fade.restore();
    this.label.dispose();
    this.aimDot.geometry.dispose();
    (this.aimDot.material as MeshBasicMaterial).dispose();
    if (this.currentInk) (this.currentInk.material as MeshStandardMaterial).dispose();
  }

  private raise(index: number, up: boolean): void {
    const group = this.segments[index].group;
    group.position.z = up ? HOVER_LIFT_M : 0;
    group.scale.setScalar(up ? HOVER_SCALE : 1);
  }
}


/**
 * The word on the hub's plaque: crisp text drawn into a small canvas, on a
 * plane just in front of the plaque (flat text reads best at an angle).
 */
class HubLabel {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private text = '';
  private fontReady = false;

  constructor() {
    this.canvas.width = Math.round(LABEL_W_M * LABEL_PX_PER_M);
    this.canvas.height = Math.round(LABEL_H_M * LABEL_PX_PER_M);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(LABEL_W_M, LABEL_H_M), this.material);
    this.mesh.name = 'HubLabel';
    // The app's interface font, loaded once for the canvas; drawn again when it arrives.
    const font = new FontFace(LABEL_FONT, `url(${LABEL_FONT_URL})`);
    void font.load().then((loaded) => {
      document.fonts.add(loaded);
      this.fontReady = true;
      this.render();
    }, () => undefined);
  }

  draw(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.render();
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }

  private render(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = THEME.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const family = this.fontReady ? LABEL_FONT : 'sans-serif';
    ctx.font = `500 ${Math.round(height * 0.62)}px ${family}`;
    ctx.fillText(this.text, width / 2, height / 2 + 1, width * 0.94);
    this.texture.needsUpdate = true;
  }
}
