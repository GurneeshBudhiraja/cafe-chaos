/**
 * Pointer motion for tappable things: they lift a little toward you when
 * pointed at and sink when pinched, then spring back on release. Paired
 * with the state colours (panel-helpers), this is the "it heard me" signal
 * that makes a spatial UI feel responsive before anything is selected.
 *
 * Quick ease-out on the way in (feels immediate), a small overshoot on
 * release (feels physical), and nothing on a timer, so it never distracts.
 */

import type { PanelElement } from './panel-helpers.js';
import { easeOutBack, easeOutCubic, type Tweens } from './tweens.js';

export interface PressMotionOptions {
  /** Scale while pointed at (default 1.04). */
  hover?: number;
  /** Scale while pinched (default 0.97). */
  pressed?: number;
}

let nextId = 0;

export function addPressMotion(
  element: PanelElement,
  tweens: Tweens,
  cleanupFuncs: Array<() => void>,
  { hover = 1.04, pressed = 0.97 }: PressMotionOptions = {},
): void {
  const key = `press-${nextId++}`;
  let scale = 1;
  const apply = (value: number) => {
    scale = value;
    element.setProperties({ transformScaleX: value, transformScaleY: value } as Record<string, unknown>);
  };
  const to = (target: number, ms: number, ease: (t: number) => number) => () => {
    const from = scale;
    tweens.play(ms, (t) => apply(from + (target - from) * ease(t)), { key });
  };
  const handlers = [
    ['pointerenter', to(hover, 180, easeOutCubic)],
    ['pointerleave', to(1, 220, easeOutCubic)],
    ['pointerdown', to(pressed, 90, easeOutCubic)],
    ['pointerup', to(hover, 320, easeOutBack)],
  ] as const;
  for (const [type, handler] of handlers) element.addEventListener(type, handler);
  cleanupFuncs.push(() => {
    for (const [type, handler] of handlers) element.removeEventListener(type, handler);
  });
}
