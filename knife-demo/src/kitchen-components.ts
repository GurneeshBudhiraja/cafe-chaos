/**
 * The demo's components. System-free: the scene editor imports this module
 * to build its inspector.
 */

import { createComponent, Types } from '@iwsdk/core';

/** A knife whose edge cuts what it slices through (see KNIFE_EDGE). */
export const Knife = createComponent('Knife', {}, 'A knife: its edge cuts Sliceable things it passes through.');

/** Something a knife can cut in two (an apple, here). */
export const Sliceable = createComponent(
  'Sliceable',
  {
    /** How round it is, for the cut test (metres). */
    radius: { type: Types.Float32, default: 0.042 },
  },
  'Cut in two when a knife edge slices down through it.',
);

// Runtime-only state (not authored in scenes, so not in the manifest).

/** One half of a cut apple, tipping over onto the board. */
export const AppleHalf = createComponent('AppleHalf', {
  /** +1: the half on the cut's +X side; -1: the other. */
  side: { type: Types.Int8, default: 1 },
  /** Seconds since the cut. */
  age: { type: Types.Float32, default: 0 },
});

/** A little spray of juice from a cut. */
export const JuiceSpray = createComponent('JuiceSpray', {
  age: { type: Types.Float32, default: 0 },
  /** Where the drops land (world height, metres). */
  floorY: { type: Types.Float32, default: 0 },
});
