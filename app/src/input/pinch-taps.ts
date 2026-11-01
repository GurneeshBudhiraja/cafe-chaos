/**
 * Taps on a held pen, read from the holding hand's pinch.
 *
 * Holding the pen keeps the thumb and index pinched together. A quick
 * open-and-close of those fingers (without letting go) is a tap, like
 * tapping a finger on a real pen; two in a row are a double-tap (as on an
 * Apple Pencil). Only fingers left open for a moment let go of the pen, so a
 * tap never drops it.
 *
 * Pure timing logic (no IWSDK), fed one pinch gap per frame.
 */

import { PINCH_CLOSED_M, PINCH_OPEN_M } from './hand-pinch.js';

/** Fingers open for less than this, then closed again, are a tap (ms). */
const TAP_MAX_MS = 500;
/** A second tap ending within this of the first one's end makes a double-tap (ms). */
const DOUBLE_TAP_MS = 800;
/** Fingers open for this long let go of the pen (ms). */
const RELEASE_AFTER_MS = 550;

export type PinchTapEvent = 'tap' | 'double-tap' | 'release';

export class PinchTapDetector {
  /** Firmly pinched (with hysteresis between the closed and open distances). */
  private closed = true;
  private openedAt = 0;
  private lastTapAt = -Infinity;
  private released = false;

  /** Start over for a fresh grip (the pen was just picked up). */
  reset(): void {
    this.closed = true;
    this.lastTapAt = -Infinity;
    this.released = false;
  }

  /** True while the fingers are not firmly pinched: mid-tap, or letting go. */
  get loosened(): boolean {
    return !this.closed;
  }

  /** Feed this frame's thumb-index gap (metres); returns what happened, if anything. */
  update(gap: number, nowMs: number): PinchTapEvent | null {
    if (this.closed) {
      if (gap > PINCH_OPEN_M) {
        this.closed = false;
        this.openedAt = nowMs;
      }
      return null;
    }
    if (gap < PINCH_CLOSED_M) {
      this.closed = true;
      if (this.released || nowMs - this.openedAt > TAP_MAX_MS) return null;
      const double = nowMs - this.lastTapAt <= DOUBLE_TAP_MS;
      this.lastTapAt = double ? -Infinity : nowMs;
      return double ? 'double-tap' : 'tap';
    }
    if (!this.released && nowMs - this.openedAt >= RELEASE_AFTER_MS) {
      this.released = true;
      return 'release';
    }
    return null;
  }
}
