/**
 * The game's components. System-free: the scene editor imports this module
 * to build its inspector, so nothing here touches the world.
 */

import { createComponent, Types } from '@iwsdk/core';

/** A knife whose edge cuts cake pieces it slices through (see KNIFE_EDGE). */
export const Knife = createComponent('Knife', {}, 'A knife: its edge cuts cake it passes through.');

// Runtime-only state (not authored in scenes, so not in the manifest).

/**
 * A piece of cake (the whole cake is one piece until it is cut). Its
 * footprint polygon lives on the object's userData (see src/cake/piece.ts).
 */
export const CakePiece = createComponent('CakePiece', {
  /** The box cell this piece sits in, or -1 when it is loose. */
  cell: { type: Types.Int16, default: -1 },
  /** Seconds since it was cut off (for the little parting nudge). */
  age: { type: Types.Float32, default: 10 },
});

/** A pad on the counter (Easy, Medium, Hard, New cake), in pads.ts's order. */
export const Pad = createComponent('Pad', {
  kind: { type: Types.Int8, default: 0 },
});
