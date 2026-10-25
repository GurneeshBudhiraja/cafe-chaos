/**
 * XrScrollFixSystem: workaround so XR rays and hands can drag-scroll UIKit.
 *
 * UIKit marks a pointer event as "already scrolled" (a symbol-keyed field on
 * the native event) so nested scroll areas do not both scroll on the same
 * event. IWSDK 1.0.1's XR pointer reuses one native event object for every
 * frame, so that mark never clears: after the first few units of a drag,
 * every later drag delta is ignored and the recent-notes strip stops moving.
 *
 * Clearing the symbol-keyed fields once per frame restores per-event
 * behaviour. Remove this system once IWSDK sends a fresh native event per
 * pointer update (check: drag the recent-notes strip in XR with it removed).
 */

import { createSystem } from '@iwsdk/core';

type Handedness = 'left' | 'right';
const HANDS: readonly Handedness[] = ['left', 'right'];

export class XrScrollFixSystem extends createSystem({}) {
  /** Symbol keys UIKit has written; found once, then cleared each frame. */
  private marks: symbol[] = [];

  update(): void {
    for (const hand of HANDS) {
      // `nativeEvent` is private in IWSDK's typings; read it defensively.
      const pointer = this.world.input.xr.multiPointers[hand] as unknown as {
        nativeEvent?: Record<symbol, unknown>;
      };
      const event = pointer?.nativeEvent;
      if (!event) continue;
      // Scanning allocates, so only scan until the mark has been seen once.
      if (this.marks.length === 0) this.marks = Object.getOwnPropertySymbols(event);
      for (const mark of this.marks) delete event[mark];
    }
  }
}
