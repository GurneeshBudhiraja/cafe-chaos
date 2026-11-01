/**
 * The current writing tool, shared by the tool wheel (which changes it) and
 * the ink system (which draws with it). Lives in `world.globals` like the
 * other shared state (see pen-state.ts).
 *
 * Each tool remembers its own colour and size, the way a real pencil case
 * does: switching from the pen to the highlighter and back keeps the pen's
 * blue.
 */

import type { World } from '@iwsdk/core';
import { TOOL_SPECS, type PageAction, type SizeId, type ToolId } from '../ink/tool-catalog.js';

/** A tool's chosen colour (index into its swatches) and size. */
export interface ToolStyle {
  swatch: number;
  size: SizeId;
}

/** What changed, for listeners that only care about some of it. */
export type ToolChange = 'tool' | 'style' | 'wheel';

export class ToolState {
  tool: ToolId = 'pen';
  /** True while the tool wheel is open: the pen aims at the wheel instead of writing. */
  wheelOpen = false;
  private readonly styles = new Map<ToolId, ToolStyle>();
  private readonly listeners = new Set<(change: ToolChange) => void>();
  private readonly actionListeners = new Set<(action: PageAction) => void>();

  /** The chosen colour and size of `tool` (the current tool by default). */
  style(tool: ToolId = this.tool): ToolStyle {
    let style = this.styles.get(tool);
    if (!style) {
      const spec = TOOL_SPECS[tool];
      style = { swatch: spec.defaultSwatch, size: spec.defaultSize };
      this.styles.set(tool, style);
    }
    return style;
  }

  /** The current tool's colour (CSS hex), or null for a tool with no colour. */
  colour(): string | null {
    return TOOL_SPECS[this.tool].swatches[this.style().swatch]?.hex ?? null;
  }

  /** The current tool's width (fraction of the page width), or null for a tool with no size. */
  width(): number | null {
    return TOOL_SPECS[this.tool].sizes?.[this.style().size] ?? null;
  }

  selectTool(tool: ToolId): void {
    if (tool === this.tool) return;
    this.tool = tool;
    this.emit('tool');
  }

  selectSwatch(index: number): void {
    const style = this.style();
    if (style.swatch === index || !TOOL_SPECS[this.tool].swatches[index]) return;
    style.swatch = index;
    this.emit('style');
  }

  selectSize(size: SizeId): void {
    const style = this.style();
    if (style.size === size || !TOOL_SPECS[this.tool].sizes) return;
    style.size = size;
    this.emit('style');
  }

  setWheelOpen(open: boolean): void {
    if (open === this.wheelOpen) return;
    this.wheelOpen = open;
    this.emit('wheel');
  }

  /** Ask for a one-shot action (undo, redo, delete the selection); whoever owns the note carries it out. */
  runAction(action: PageAction): void {
    for (const listener of this.actionListeners) listener(action);
  }

  onAction(listener: (action: PageAction) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  subscribe(listener: (change: ToolChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: ToolChange): void {
    for (const listener of this.listeners) listener(change);
  }
}

const KEY = 'metaNotes.tools';

/** The shared state, created on first use. */
export function getTools(world: World): ToolState {
  let state = world.globals[KEY];
  if (!(state instanceof ToolState)) {
    state = new ToolState();
    world.globals[KEY] = state;
  }
  return state as ToolState;
}
