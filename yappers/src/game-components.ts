/**
 * The game's components. System-free: the scene editor imports this module
 * to build its inspector, so nothing here touches the world. All of these
 * are runtime-only (nothing is authored in scenes).
 */

import { createComponent, Types } from '@iwsdk/core';

/**
 * A Yapper (a passenger). Its name, look, rules and animation parts live
 * on the object's userData (see src/yappers/yapper.ts).
 */
export const Yapper = createComponent('Yapper', {
  /** Its index in the level (rules name each other by it). */
  index: { type: Types.Int8, default: 0 },
  /** The seat it is in, or -1 while it stands. */
  seat: { type: Types.Int16, default: -1 },
});

/** A pad on the table (Easy, Medium, Hard, New crowd), in pads.ts's order. */
export const Pad = createComponent('Pad', {
  kind: { type: Types.Int8, default: 0 },
});
