/**
 * The tool wheel's options ring: the current tool's colours and sizes,
 * just outside the wheel's segments, so one visit to the wheel can set a
 * tool, its colour and its size.
 *
 * Colours sit on the arc above the wheel (left to right), sizes on the arc
 * below it (fine, medium, bold from left to right). The chosen colour and
 * size wear a thin warm-white ring; the aimed-at option grows. Tools with
 * no colour (eraser) or no size (lasso) show only what they have; the lasso
 * instead offers Delete (its selection), a clay disc with a white cross.
 *
 * Aiming is by angle, like the segments: ToolWheelSystem aims here when
 * the nib has slid past the segments (OPTIONS_AIM_FROM_M).
 */

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  type Object3D,
} from '@iwsdk/core';
import { SIZE_IDS, TOOL_SPECS, type SizeId, type ToolId } from '../ink/tool-catalog.js';
import { clayMaterial, paperWhiteMaterial, satinLightMaterial } from '../scene-assets/notes-materials.js';
import type { ToolStyle } from './tool-state.js';

/** An option on the ring: a colour (index into the tool's swatches), a size, or deleting the lasso's selection. */
export type ToolOption = { kind: 'swatch'; index: number } | { kind: 'size'; size: SizeId } | { kind: 'delete' };

/** The ring's radius around the wheel's centre (wheel asset metres; the segments end at 0.1). */
export const OPTIONS_RING_RADIUS_M = 0.118;
/** Aimed further out than this (wheel asset metres), the options ring is aimed at instead of the segments. */
export const OPTIONS_AIM_FROM_M = 0.104;
/** Degrees between neighbouring options along the ring. */
const SPACING_DEG = 22;
const SWATCH_RADIUS_M = 0.0085;
/** Size dots: one radius per size, so they show what they draw. */
const SIZE_DOT_RADIUS_M: Record<SizeId, number> = { fine: 0.0035, medium: 0.0055, bold: 0.008 };
const DELETE_RADIUS_M = 0.0095;
const DOT_DEPTH_M = 0.003;
const HOVER_SCALE = 1.35;
const DEG = Math.PI / 180;

/** A disc facing +Z (the wheel's face). */
function disc(radius: number): CylinderGeometry {
  const geometry = new CylinderGeometry(radius, radius, DOT_DEPTH_M, 32);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

interface PlacedOption {
  option: ToolOption;
  /** Its angle on the ring (radians, anticlockwise from +X). */
  angle: number;
  holder: Object3D;
  chosenRing: Mesh;
}

export class ToolOptionsRing {
  readonly group = new Group();
  private placed: PlacedOption[] = [];
  private hovered: PlacedOption | null = null;
  /** Geometry and materials made for the current tool's options, freed when it changes. */
  private owned: Array<{ dispose(): void }> = [];

  constructor(parent: Object3D) {
    this.group.name = 'OptionsRing';
    parent.add(this.group);
  }

  /** Lay out `tool`'s colours and sizes, marking the chosen ones. */
  show(tool: ToolId, style: ToolStyle): void {
    this.clear();
    const spec = TOOL_SPECS[tool];
    const swatches = spec.swatches;
    swatches.forEach((swatch, i) => {
      // Centred on the top (90°), first colour on the left.
      const angle = (90 + ((swatches.length - 1) / 2 - i) * SPACING_DEG) * DEG;
      const material = new MeshStandardMaterial({ color: swatch.hex, roughness: 0.3, metalness: 0.05 });
      const geometry = disc(SWATCH_RADIUS_M);
      this.owned.push(material, geometry);
      this.add({ kind: 'swatch', index: i }, angle, new Mesh(geometry, material), SWATCH_RADIUS_M, style.swatch === i);
    });
    if (spec.sizes) {
      SIZE_IDS.forEach((size, i) => {
        // Centred on the bottom (270°), fine on the left.
        const angle = (270 - (1 - i) * SPACING_DEG) * DEG;
        const geometry = disc(SIZE_DOT_RADIUS_M[size]);
        this.owned.push(geometry);
        this.add({ kind: 'size', size }, angle, new Mesh(geometry, satinLightMaterial), SIZE_DOT_RADIUS_M[size], style.size === size);
      });
    }
    if (tool === 'lasso') this.add({ kind: 'delete' }, 270 * DEG, this.deleteButton(), DELETE_RADIUS_M, false);
  }

  /** A clay disc with a white cross on it: delete. */
  private deleteButton(): Mesh {
    const geometry = disc(DELETE_RADIUS_M);
    const bar = new BoxGeometry(DELETE_RADIUS_M * 1.2, DELETE_RADIUS_M * 0.22, DOT_DEPTH_M);
    this.owned.push(geometry, bar);
    const button = new Mesh(geometry, clayMaterial);
    for (const turn of [1, -1]) {
      const stroke = new Mesh(bar, paperWhiteMaterial);
      stroke.rotation.z = (turn * Math.PI) / 4;
      stroke.position.z = DOT_DEPTH_M * 0.6;
      button.add(stroke);
    }
    return button;
  }

  /** The option nearest `angle` (radians), or null when none is within half a spacing of it. */
  optionAt(angle: number): ToolOption | null {
    let best: PlacedOption | null = null;
    let bestOff = (SPACING_DEG / 2) * DEG;
    for (const placed of this.placed) {
      const off = Math.abs(Math.atan2(Math.sin(angle - placed.angle), Math.cos(angle - placed.angle)));
      if (off <= bestOff) {
        best = placed;
        bestOff = off;
      }
    }
    return best?.option ?? null;
  }

  /** Grow the aimed-at option (or none). */
  setHovered(option: ToolOption | null): void {
    const placed = option ? this.placed.find((p) => sameOption(p.option, option)) ?? null : null;
    if (placed === this.hovered) return;
    this.hovered?.holder.scale.setScalar(1);
    placed?.holder.scale.setScalar(HOVER_SCALE);
    this.hovered = placed;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private add(option: ToolOption, angle: number, dot: Mesh, radius: number, chosen: boolean): void {
    const holder = new Group();
    holder.position.set(Math.cos(angle) * OPTIONS_RING_RADIUS_M, Math.sin(angle) * OPTIONS_RING_RADIUS_M, DOT_DEPTH_M);
    dot.name = option.kind === 'swatch' ? `Swatch-${option.index}` : option.kind === 'size' ? `Size-${option.size}` : 'Delete';
    holder.add(dot);
    // The chosen option's thin ring, just outside the dot.
    const ringGeometry = new TorusGeometry(radius + 0.0028, 0.0009, 8, 40);
    this.owned.push(ringGeometry);
    const chosenRing = new Mesh(ringGeometry, satinLightMaterial);
    chosenRing.name = 'ChosenRing';
    chosenRing.position.z = DOT_DEPTH_M / 2;
    chosenRing.visible = chosen;
    holder.add(chosenRing);
    this.group.add(holder);
    this.placed.push({ option, angle, holder, chosenRing });
  }

  private clear(): void {
    for (const placed of this.placed) placed.holder.removeFromParent();
    for (const resource of this.owned) resource.dispose();
    this.placed = [];
    this.owned = [];
    this.hovered = null;
  }
}

export function sameOption(a: ToolOption | null, b: ToolOption | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'swatch' && b.kind === 'swatch') return a.index === b.index;
  if (a.kind === 'size' && b.kind === 'size') return a.size === b.size;
  return a.kind === b.kind;
}
