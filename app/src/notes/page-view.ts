/**
 * The page's view of its infinite canvas: where it looks, and how close.
 *
 * Every note's page is a window onto an endless canvas, like Excalidraw.
 * Canvas coordinates are the old page coordinates carried on forever: the
 * first page's area is x 0..1 (one page width), y 0..1 (one page height),
 * so notes from before the canvas show their ink exactly where it was.
 *
 * A view is the canvas point at the page's centre and a zoom (2 = twice as
 * close). Page coordinates (where on the page, 0..1) and canvas coordinates
 * convert through it:
 *
 *   page = (canvas - centre) * zoom + 0.5
 *
 * Pure data, no IWSDK except the transform helper.
 */

import type { Object3D } from '@iwsdk/core';

export interface PageView {
  /** The canvas point at the page's centre. */
  x: number;
  y: number;
  /** 1: the canvas at its own size; 2: twice as close. */
  zoom: number;
}

/** Where every page starts: the first page's area, at its own size. */
export const HOME_VIEW: Readonly<PageView> = { x: 0.5, y: 0.5, zoom: 1 };
/** How far out and in the view can zoom. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;

/** Page coordinates (u, v) to canvas coordinates, into `out`. */
export function pageToCanvas(view: PageView, u: number, v: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = view.x + (u - 0.5) / view.zoom;
  out.y = view.y + (v - 0.5) / view.zoom;
  return out;
}

/** Canvas coordinates to page coordinates (u, v), into `out`. */
export function canvasToPage(view: PageView, x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = (x - view.x) * view.zoom + 0.5;
  out.y = (y - view.y) * view.zoom + 0.5;
  return out;
}

/** The canvas area the page shows: its left, top, right and bottom edges. */
export function visibleArea(view: PageView): { left: number; top: number; right: number; bottom: number } {
  const half = 0.5 / view.zoom;
  return { left: view.x - half, top: view.y - half, right: view.x + half, bottom: view.y + half };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Pose a group holding canvas content (laid out at the canvas's own size,
 * in metres from the page's centre, as on a page at the home view) so it
 * shows through the page at `view`. `widthM` and `heightM`: the page's size.
 */
export function applyViewTransform(group: Object3D, view: PageView, widthM: number, heightM: number): void {
  group.scale.set(view.zoom, view.zoom, 1);
  group.position.x = view.zoom * (0.5 - view.x) * widthM;
  group.position.y = view.zoom * (view.y - 0.5) * heightM;
}

/** Validate a stored view; anything off goes back to the home view. */
export function parseView(value: unknown): PageView | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (!finite(raw.x) || !finite(raw.y) || !finite(raw.zoom) || raw.zoom <= 0) return undefined;
  return { x: raw.x, y: raw.y, zoom: clampZoom(raw.zoom) };
}

export function sameView(a: PageView, b: PageView): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}
