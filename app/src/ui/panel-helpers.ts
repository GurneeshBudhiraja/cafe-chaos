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
