/**
 * The game's components. System-free: the scene editor imports this module
 * to build its inspector, so nothing here touches the world. All of these
 * are runtime-only (nothing is authored in scenes).
 */

import { createComponent, Types } from '@iwsdk/core';

/**
 * A puppy. Its pose, coat and footprint live on the object's userData
 * (see src/puppies/puppy.ts).
 */
export const Puppy = createComponent('Puppy', {
  /** On the bed: the column and row of its footprint's corner, or -1 when it is loose. */
  column: { type: Types.Int16, default: -1 },
  row: { type: Types.Int16, default: -1 },
  /** How it is turned on the bed (quarter turns, 0..3). */
  turns: { type: Types.Int8, default: 0 },
});

/** A pad on the table (Easy, Medium, Hard, New litter), in pads.ts's order. */
export const Pad = createComponent('Pad', {
  kind: { type: Types.Int8, default: 0 },
});
