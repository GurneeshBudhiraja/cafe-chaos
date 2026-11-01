/**
 * PageTextView: draws a page's typed text on its writing surface, with the
 * caret and the selection.
 *
 * Each text frame is drawn into its own canvas, shown on a flat mesh lying
 * just over the ink, so a keystroke redraws only the frame being typed in
 * (a small texture upload, not the whole page). Canvases grow in steps as a
 * frame gets longer, so its texture is not reallocated on every line.
 *
 * The caret is its own thin mesh, so its blink costs no redraw: solid while
 * typing, then blinking about twice a second, as in a word processor.
 *
 * Text meshes never take rays, so taps fall through to the page (the
 * typing system places the caret from where the page was touched).
 *
 * Frames are laid out on the page's infinite canvas: they sit in a canvas
 * group that the page's view pans and zooms (`setView`), cut off at the
 * page's edges.
 */

import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Object3D,
  type Plane,
} from '@iwsdk/core';
import { applyViewTransform, HOME_VIEW, type PageView } from '../notes/page-view.js';
import { blockLength, type TextFrame } from '../notes/typed-text.js';
import { comparePositions, type TextPosition } from './text-editor.js';
import { PAGE_UNITS, PAGE_UNITS_HEIGHT, type FrameLayout, type TextLayout } from './text-layout.js';

/** Canvas pixels per layout unit: about 2,200 pixels across a whole page, sharp up close. */
const PX_PER_UNIT = 2.2;
/** Canvases grow in steps of this many units of height. */
const HEIGHT_STEP_UNITS = 80;
/** Room round the text for descenders and the caret (units). */
const PAD_UNITS = 6;
const SELECTION_COLOR = 'rgba(212, 112, 79, 0.24)';
const PLACEHOLDER_COLOR = 'rgba(111, 104, 95, 0.55)';
const CARET_COLOR = 0xc4532f;
const CARET_WIDTH_UNITS = 2.4;
/** The caret stays solid this long after the last keystroke, then blinks (ms). */
const CARET_SOLID_MS = 600;
const CARET_BLINK_MS = 530;
/** Text lies this far over the ink (metres), so it never flickers into it. */
const TEXT_LIFT_M = 0.0004;

/** The fonts typed text uses, registered once for canvas drawing. */
const FONTS: ReadonlyArray<{ family: string; file: string; weight: string }> = [
  { family: 'NoteBody', file: 'bricolage-text.ttf', weight: '400' },
  { family: 'NoteBody', file: 'bricolage-ui-strong.ttf', weight: '700' },
  { family: 'NoteHeading', file: 'bricolage-title.ttf', weight: '700' },
  { family: 'NoteSerif', file: 'fraunces-body.ttf', weight: '400' },
];
let fontsLoading: Promise<void> | null = null;

/** Load the typed-text fonts (once); resolves when they can be drawn with. */
export function loadTextFonts(): Promise<void> {
  fontsLoading ??= Promise.all(
    FONTS.map(async ({ family, file, weight }) => {
      const face = new FontFace(family, `url(${import.meta.env.BASE_URL}fonts/${file})`, { weight });
      document.fonts.add(await face.load());
    }),
  ).then(
    () => undefined,
    (error: unknown) => console.warn('[PageTextView] A typed-text font did not load; using a fallback.', error),
  );
  return fontsLoading;
}

/** A canvas 2D measurer for TextLayout. */
export function createCanvasMeasure(): (font: string, text: string) => number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('PageTextView: 2D canvas is not available.');
  setCrispText(ctx);
  return (font, text) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

/** What the view shows of the editor: the frame typed in, its caret and selection. */
export interface TextFocus {
  frameId: string | null;
  caret: TextPosition;
  anchor: TextPosition | null;
}

interface FrameView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  material: MeshBasicMaterial;
  mesh: Mesh;
  /** What was last drawn, so an unchanged frame is not redrawn. */
  drawn: string;
  heightUnits: number;
}

const unitPlane = new PlaneGeometry(1, 1);

export class PageTextView {
  readonly root = new Group();
  /** The frames and caret, posed by the page's view. */
  private readonly canvas = new Group();
  private readonly frames = new Map<string, FrameView>();
  private readonly caret: Mesh;
  private readonly metresPerUnit: number;
  private caretShownAt = 0;
  private focus: TextFocus = { frameId: null, caret: { block: 0, offset: 0 }, anchor: null };

  constructor(
    /** The page's writing surface: a plane `widthM` wide, centred, facing +Z. */
    surface: Object3D,
    private readonly widthM: number,
    private readonly heightM: number,
    private readonly layout: TextLayout,
    renderOrder: number,
    /** The page's edges to cut text at (page-clip.ts), or null. */
    private readonly clipPlanes: Plane[] | null = null,
  ) {
    this.metresPerUnit = widthM / PAGE_UNITS;
    this.root.name = 'TypedText';
    this.root.position.z = TEXT_LIFT_M;
    this.root.renderOrder = renderOrder;
    this.canvas.renderOrder = renderOrder;
    this.root.add(this.canvas);
    surface.add(this.root);
    this.caret = new Mesh(
      unitPlane,
      new MeshBasicMaterial({ color: CARET_COLOR, transparent: true, depthWrite: false, toneMapped: false, clippingPlanes: clipPlanes }),
    );
    this.caret.name = 'TextCaret';
    this.caret.visible = false;
    this.caret.raycast = () => {};
    this.caret.renderOrder = renderOrder + 1;
    this.caret.position.z = TEXT_LIFT_M;
    this.canvas.add(this.caret);
    this.setView(HOME_VIEW);
  }

  /** Pan and zoom the text with the page's view of its canvas. */
  setView(view: PageView): void {
    applyViewTransform(this.canvas, view, this.widthM, this.heightM);
  }

  /** Draw `frames` as they are now, with the editor's caret and selection. */
  render(frames: readonly TextFrame[], focus: TextFocus): void {
    this.focus = focus;
    const seen = new Set<string>();
    for (const frame of frames) {
      seen.add(frame.id);
      this.renderFrame(frame, focus.frameId === frame.id ? focus : null);
    }
    for (const [id, view] of this.frames) {
      if (seen.has(id)) continue;
      this.disposeFrame(view);
      this.frames.delete(id);
    }
    this.placeCaret(frames);
  }

  /** Redraw everything (after the fonts load, the measurements change). */
  invalidate(): void {
    for (const view of this.frames.values()) view.drawn = '';
  }

  /** Blink the caret. `nowMs`: the clock. */
  update(nowMs: number): void {
    if (!this.caret.userData.active) return;
    const since = nowMs - this.caretShownAt;
    const material = this.caret.material as MeshBasicMaterial;
    material.opacity = since < CARET_SOLID_MS || Math.floor((since - CARET_SOLID_MS) / CARET_BLINK_MS) % 2 === 1 ? 1 : 0;
  }

  /** Keep the caret solid for a moment (after a keystroke). */
  wake(nowMs: number): void {
    this.caretShownAt = nowMs;
  }

  /** Show or hide the caret (while typing, or not). */
  setCaretVisible(visible: boolean): void {
    this.caret.userData.active = visible;
    this.caret.visible = visible && this.caret.userData.placed === true;
  }

  dispose(): void {
    for (const view of this.frames.values()) this.disposeFrame(view);
    this.frames.clear();
    (this.caret.material as MeshBasicMaterial).dispose();
    this.root.removeFromParent();
  }

  // ---------------------------------------------------------------- private

  private renderFrame(frame: TextFrame, focus: TextFocus | null): void {
    const layout = this.layout.layoutFrame(frame);
    const heightUnits = Math.ceil((Math.max(layout.height, 30) + PAD_UNITS * 2) / HEIGHT_STEP_UNITS) * HEIGHT_STEP_UNITS;
    const selection = focus?.anchor && comparePositions(focus.anchor, focus.caret) !== 0 ? focus : null;
    const placeholder = focus !== null && isEmpty(frame);
    const key = `${layoutKey(layout)}|${selection ? JSON.stringify([selection.anchor, selection.caret]) : ''}|${placeholder}|${frame.x},${frame.y}`;
    let view = this.frames.get(frame.id);
    if (view && view.drawn === key) return;
    if (!view || view.heightUnits !== heightUnits || view.canvas.width !== Math.ceil((layout.width + PAD_UNITS * 2) * PX_PER_UNIT)) {
      if (view) this.disposeFrame(view);
      view = this.createFrameView(layout.width, heightUnits);
      this.frames.set(frame.id, view);
    }
    view.drawn = key;
    this.draw(view, layout, selection, placeholder);
    // Top-left of the canvas at the frame's corner, less the padding.
    const widthUnits = view.canvas.width / PX_PER_UNIT;
    const left = frame.x * PAGE_UNITS - PAD_UNITS;
    const top = frame.y * PAGE_UNITS_HEIGHT - PAD_UNITS;
    view.mesh.scale.set(widthUnits * this.metresPerUnit, heightUnits * this.metresPerUnit, 1);
    view.mesh.position.set(
      (left + widthUnits / 2) * this.metresPerUnit - this.widthM / 2,
      this.heightM / 2 - (top + heightUnits / 2) * this.metresPerUnit,
      0,
    );
  }

  private createFrameView(widthUnits: number, heightUnits: number): FrameView {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((widthUnits + PAD_UNITS * 2) * PX_PER_UNIT);
    canvas.height = Math.ceil(heightUnits * PX_PER_UNIT);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PageTextView: 2D canvas is not available.');
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    // Premultiplied, so the letters' soft edges do not draw a dark fringe over the paper.
    texture.premultiplyAlpha = true;
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      toneMapped: false,
      clippingPlanes: this.clipPlanes,
    });
    const mesh = new Mesh(unitPlane, material);
    mesh.name = 'TextFrame';
    mesh.raycast = () => {};
    mesh.renderOrder = this.root.renderOrder;
    this.canvas.add(mesh);
    return { canvas, ctx, texture, material, mesh, drawn: '', heightUnits };
  }

  private disposeFrame(view: FrameView): void {
    view.mesh.removeFromParent();
    view.material.dispose();
    view.texture.dispose();
  }

  private draw(view: FrameView, layout: FrameLayout, selection: TextFocus | null, placeholder: boolean): void {
    const { ctx, canvas } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(PX_PER_UNIT, 0, 0, PX_PER_UNIT, PAD_UNITS * PX_PER_UNIT, PAD_UNITS * PX_PER_UNIT);
    setCrispText(ctx);
    ctx.textBaseline = 'alphabetic';
    if (selection?.anchor) this.drawSelection(ctx, layout, selection.anchor, selection.caret);
    if (placeholder) {
      const first = layout.blocks[0];
      ctx.font = `italic 400 ${first.style.size}px NoteBody, sans-serif`;
      ctx.fillStyle = PLACEHOLDER_COLOR;
      ctx.fillText('Start typing…', first.left + 1, first.lines[0].baseline);
    }
    for (const block of layout.blocks) {
      const { style } = block;
      if (block.quoteBar) {
        ctx.fillStyle = '#d4704f';
        ctx.fillRect(block.left - 18, block.top + 2, 3.5, block.bottom - block.top - 4);
      }
      const marker = block.marker;
      if (marker?.box) {
        const { x, y, size } = marker.box;
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = marker.checked ? '#c4532f' : '#8a8178';
        ctx.fillStyle = marker.checked ? '#c4532f' : 'rgba(255,255,255,0.6)';
        roundRect(ctx, x, y, size, size, size * 0.22);
        ctx.fill();
        ctx.stroke();
        if (marker.checked) {
          ctx.strokeStyle = '#fffdf9';
          ctx.lineWidth = 2.6;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(x + size * 0.24, y + size * 0.52);
          ctx.lineTo(x + size * 0.43, y + size * 0.72);
          ctx.lineTo(x + size * 0.78, y + size * 0.3);
          ctx.stroke();
        }
      } else if (marker) {
        ctx.font = marker.font;
        ctx.fillStyle = style.color;
        ctx.fillText(marker.text, marker.x, marker.baseline);
      }
      for (const line of block.lines) {
        for (const piece of line.pieces) {
          ctx.font = piece.font;
          ctx.fillStyle = style.color;
          ctx.fillText(piece.text, piece.x, line.baseline);
          const struck = piece.marks.strike || (block.block.kind === 'checklist' && block.block.checked);
          if (piece.marks.underline) ctx.fillRect(piece.x, line.baseline + style.size * 0.12, piece.width, Math.max(1.4, style.size * 0.065));
          if (struck) ctx.fillRect(piece.x, line.baseline - style.size * 0.3, piece.width, Math.max(1.4, style.size * 0.06));
        }
      }
    }
    view.texture.needsUpdate = true;
  }

  private drawSelection(ctx: CanvasRenderingContext2D, layout: FrameLayout, a: TextPosition, b: TextPosition): void {
    const [start, end] = comparePositions(a, b) <= 0 ? [a, b] : [b, a];
    ctx.fillStyle = SELECTION_COLOR;
    for (let i = start.block; i <= end.block; i++) {
      const block = layout.blocks[i];
      if (!block) continue;
      const from = i === start.block ? start.offset : 0;
      const to = i === end.block ? end.offset : blockLength(block.block);
      for (const line of block.lines) {
        const s = Math.max(from, line.start);
        const e = Math.min(to, line.end);
        // A selection running on past this line shows to its end, as in Docs.
        if (e < s || (e === s && !(to > line.end && s === line.end))) continue;
        const x0 = line.carets[s - line.start];
        const x1 = to > line.end || (i < end.block && line === block.lines[block.lines.length - 1])
          ? line.carets[line.carets.length - 1] + block.style.size * 0.3
          : line.carets[e - line.start];
        ctx.fillRect(x0, line.top, Math.max(1, x1 - x0), line.height);
      }
    }
  }

  private placeCaret(frames: readonly TextFrame[]): void {
    const focus = this.focus;
    const frame = focus.frameId ? frames.find((candidate) => candidate.id === focus.frameId) : undefined;
    const at = frame ? this.layout.caretAt(frame, focus.caret) : null;
    this.caret.userData.placed = at !== null;
    if (!frame || !at) {
      this.caret.visible = false;
      return;
    }
    const size = at.block.style.size;
    const height = size * 1.2;
    const top = at.line.baseline - size * 0.98;
    const u = frame.x * PAGE_UNITS + at.x;
    const v = frame.y * PAGE_UNITS_HEIGHT + top + height / 2;
    this.caret.scale.set(CARET_WIDTH_UNITS * this.metresPerUnit, height * this.metresPerUnit, 1);
    this.caret.position.set(u * this.metresPerUnit - this.widthM / 2, this.heightM / 2 - v * this.metresPerUnit, TEXT_LIFT_M);
    this.caret.visible = this.caret.userData.active === true;
  }
}

function isEmpty(frame: TextFrame): boolean {
  return frame.blocks.length === 1 && blockLength(frame.blocks[0]) === 0;
}

function layoutKey(layout: FrameLayout): string {
  let key = `${layout.width}x${layout.height}`;
  for (const block of layout.blocks) {
    key += `|${block.block.kind}${block.block.checked ? 1 : 0}${block.marker?.text ?? ''}`;
    for (const line of block.lines) for (const piece of line.pieces) key += `${piece.font}${piece.x.toFixed(1)}${piece.text}${piece.marks.underline ? 'u' : ''}${piece.marks.strike ? 's' : ''}`;
  }
  return key;
}

/** Kerning and ligatures off, so drawn text matches the caret's per-character measurements. */
function setCrispText(ctx: CanvasRenderingContext2D): void {
  const settings = ctx as CanvasRenderingContext2D & { fontKerning?: string; textRendering?: string };
  settings.fontKerning = 'none';
  settings.textRendering = 'optimizeSpeed';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

