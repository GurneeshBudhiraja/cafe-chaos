/**
 * Small helpers for UIKitML panels placed in the scene.
 *
 * Systems resolve panels by scene node id and elements by their UIKitML `id`
 * attribute. These helpers keep that lookup, event cleanup, and common style
 * updates consistent across systems.
 */

import type { UIKit, UIKitMLAsset } from '@iwsdk/core';

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

/** Icon buttons and cards on glass. */
export const NEUTRAL_STATES: StateColors = {
  rest: 'rgba(255, 253, 249, 0)',
  hover: 'rgba(31, 28, 25, 0.08)',
  pressed: 'rgba(31, 28, 25, 0.14)',
};

/** Secondary pills such as Sort. */
export const SECONDARY_STATES: StateColors = {
  rest: 'rgba(255, 253, 249, 0.75)',
  hover: '#fffdf9',
  pressed: '#efe9e1',
};

/** The primary action (clay). */
export const PRIMARY_STATES: StateColors = {
  rest: '#b5553a',
  hover: '#a24a31',
  pressed: '#8f402a',
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
