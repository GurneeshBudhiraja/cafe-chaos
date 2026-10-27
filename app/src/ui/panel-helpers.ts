/**
 * Small helpers for UIKitML panels placed in the scene.
 *
 * Systems resolve panels by scene node id and elements by their UIKitML `id`
 * attribute. These helpers keep that lookup, event cleanup, and common style
 * updates consistent across systems.
 */

import type { Matrix4, Object3D, UIKit, UIKitMLAsset, Vector3 } from '@iwsdk/core';
import { THEME } from './theme.js';

/** Any UIKit element returned by `getElementById`. */
export type PanelElement = NonNullable<
  ReturnType<UIKitMLAsset['getElementById']>
>;

export class PanelBinding {
  constructor(
    readonly panel: UIKitMLAsset,
    private readonly cleanupFuncs: Array<() => void>,
  ) {}

  /** Find an element by id, failing loudly if the UIKitML file changed. */
  element(id: string): PanelElement {
    const element = this.panel.getElementById(id);
    if (!element) throw new Error(`UI element "#${id}" not found.`);
    // Runtime names make elements addressable from IWSDK debugging tools.
    element.name = id;
    return element;
  }

  text(id: string): UIKit.Text {
    return this.element(id) as unknown as UIKit.Text;
  }

  /** Register a click handler and its cleanup in one call. */
  onClick(id: string, handler: () => void): PanelElement {
    const element = this.element(id);
    element.addEventListener('click', handler);
    this.cleanupFuncs.push(() => element.removeEventListener('click', handler));
    return element;
  }
}

export function setText(element: UIKit.Text, text: string): void {
  element.setProperties({ text });
}

export function setVisible(element: PanelElement, visible: boolean): void {
  element.setProperties({ display: visible ? 'flex' : 'none' });
}

/**
 * Background per pointer state, from the theme: a target tints when pointed
 * at, so a ray or hand shows what a pinch will hit (Meta guidance), and
 * darkens a little more while pinched.
 */
export interface StateColors {
  rest: string;
  hover: string;
  pressed: string;
}

/**
 * Icon buttons and cards on glass: clear at rest, and a soft light comes up
 * under them when pointed at (like visionOS hover), brighter while pinched.
 */
export const NEUTRAL_STATES: StateColors = {
  rest: 'rgba(255, 250, 242, 0)',
  hover: THEME.fill,
  pressed: THEME.fillHover,
};

/** Buttons with their own light fill (Sort, the round prev/next). */
export const SECONDARY_STATES: StateColors = {
  rest: THEME.fill,
  hover: THEME.fillHover,
  pressed: THEME.fillPressed,
};

/** The primary action (clay). */
export const PRIMARY_STATES: StateColors = {
  rest: THEME.clay,
  hover: THEME.clayHover,
  pressed: THEME.clayPressed,
};

export function addStateColors(
  element: PanelElement,
  colors: StateColors,
  cleanupFuncs: Array<() => void>,
): void {
  const set = (backgroundColor: string) => () => element.setProperties({ backgroundColor });
  const handlers = [
    ['pointerenter', set(colors.hover)],
    ['pointerleave', set(colors.rest)],
    ['pointerdown', set(colors.pressed)],
    ['pointerup', set(colors.hover)],
  ] as const;
  for (const [type, handler] of handlers) element.addEventListener(type, handler);
  cleanupFuncs.push(() => {
    for (const [type, handler] of handlers) element.removeEventListener(type, handler);
  });
}

/** A toggle that is on (the pin while stick mode is on): a warm-white fill. */
const SELECTED_STATES: StateColors = {
  rest: THEME.ink,
  hover: '#ffffff',
  pressed: '#e9e2d8',
};
const ICON_ON = THEME.inkOnLight;
const ICON_OFF = THEME.ink;

/**
 * State colours for an on/off icon button: clear glass when off, a filled
 * warm-white circle with a dark icon when on. Returns `refresh`, to call after
 * the on state changes.
 */
export function addToggleStateColors(
  element: PanelElement,
  isOn: () => boolean,
  cleanupFuncs: Array<() => void>,
): () => void {
  let state: keyof StateColors = 'rest';
  const paint = () => {
    const colors = isOn() ? SELECTED_STATES : NEUTRAL_STATES;
    element.setProperties({ backgroundColor: colors[state], color: isOn() ? ICON_ON : ICON_OFF });
  };
  const to = (next: keyof StateColors) => () => {
    state = next;
    paint();
  };
  const handlers = [
    ['pointerenter', to('hover')],
    ['pointerleave', to('rest')],
    ['pointerdown', to('pressed')],
    ['pointerup', to('hover')],
  ] as const;
  for (const [type, handler] of handlers) element.addEventListener(type, handler);
  cleanupFuncs.push(() => {
    for (const [type, handler] of handlers) element.removeEventListener(type, handler);
  });
  paint();
  return paint;
}

/**
 * World position of an element's centre (or of any Object3D). Nested UIKit
 * elements keep their placement in `globalPanelMatrix`, relative to the
 * panel document; their own matrixWorld is identity, so getWorldPosition
 * alone would report the panel's origin.
 */
export function elementWorldPosition(object: Object3D, out: Vector3): Vector3 {
  const local = (object as { globalPanelMatrix?: { peek(): Matrix4 | undefined } }).globalPanelMatrix?.peek();
  let host: Object3D | null = object;
  while (host && !('getElementById' in host)) host = host.parent;
  if (local && host) return out.set(0, 0, 0).applyMatrix4(local).applyMatrix4(host.matrixWorld);
  return object.getWorldPosition(out);
}
