/**
 * ECS component declarations for Meta Notes.
 *
 * ECS (entity-component system) is IWSDK's architecture: entities are scene
 * objects, components are plain data attached to them, and systems hold the
 * behaviour. See https://iwsdk.dev/concepts/ecs/ for the concept guide.
 *
 * This module must stay free of systems, DOM, and renderer imports. The scene
 * editor imports it (through `src/components.ts`) to build its inspector.
 */

import { createComponent, Types } from '@iwsdk/core';

/**
 * Marks a tablet entity whose `WritingSurface` mesh accepts ink.
 * The pen settings are per tablet so later tools can change them.
 */
export const WritingSurface = createComponent(
  'WritingSurface',
  {
    inkColor: {
      type: Types.String,
      default: '#1f2937',
      label: 'Ink colour',
      help: 'CSS hex colour for new strokes.',
    },
    inkWidth: {
      type: Types.Float32,
      default: 0.006,
      min: 0.001,
      max: 0.05,
      step: 0.001,
      label: 'Ink width',
      help: 'Stroke width as a fraction of the page width.',
    },
  },
  'A tablet surface that records pen strokes in page coordinates.',
);

/**
 * Marks the grab handle that moves and tilts a tablet. The tablet follows the
 * handle only while the handle is grabbed, so writing never moves the tablet.
 */
export const TabletHandle = createComponent(
  'TabletHandle',
  {
    tabletNodeId: {
      type: Types.String,
      default: 'tablet',
      label: 'Tablet node id',
      help: 'Scene node id of the tablet this handle moves.',
    },
  },
  'Grab handle that moves its linked tablet.',
);
