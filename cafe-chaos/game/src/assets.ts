/**
 * The café's models (made in Blender; each has an INTEGRATION.md under ../../models),
 * registered by their file names. The pieces the café is built from at
 * start load first ("critical"); the rest load in the background, ready
 * for the guests, the janitor and the unlocks.
 *
 * Side-effect free: evaluated by both the runtime and the editor.
 */

import { AssetType, defineAssets } from '@iwsdk/core';

const url = (name: string): string => `${import.meta.env.BASE_URL}models/${name}.glb`;

/** What the café is built from the moment the game starts. */
export const CAFE_PIECES = ['cafe-shell', 'waiting-bench', 'table-2', 'table-4'] as const;
/** Everything else: guests, the janitor, the unlocks and the markers. */
export const LATER_PIECES = [
  'window-booth',
  'quiet-corner',
  'bar-2',
  'table-big',
  'table-mess',
  'meal',
  'guest',
  'guest-kid',
  'janitor',
  'demand-bubble',
  'mood-ring',
  'seat-glow',
  'coin',
] as const;

export type ModelName = (typeof CAFE_PIECES)[number] | (typeof LATER_PIECES)[number];

export default defineAssets({
  ...Object.fromEntries(CAFE_PIECES.map((name) => [name, { url: url(name), type: AssetType.GLTF, priority: 'critical' as const, name }])),
  ...Object.fromEntries(LATER_PIECES.map((name) => [name, { url: url(name), type: AssetType.GLTF, priority: 'background' as const, name }])),
});
