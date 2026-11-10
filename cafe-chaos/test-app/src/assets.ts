/**
 * The models (made in Blender), registered by their file names.
 * Side-effect free: evaluated by both the runtime and the editor.
 */

import { AssetType, defineAssets } from '@iwsdk/core';

const url = (name: string): string => `${import.meta.env.BASE_URL}models/${name}.glb`;

/** Every model, by asset ID (the same as its file name). */
export const CAFE_MODELS = [
  'cafe-shell',
  'waiting-bench',
  'table-2',
  'table-4',
  'window-booth',
  'quiet-corner',
  'bar-2',
  'table-big',
  'table-mess',
  'meal',
  'guest-mochi',
  'guest-onigiri',
  'guest-tofu',
  'accessories',
  'guest-kid',
  'janitor',
  'demand-bubble',
  'mood-ring',
  'seat-glow',
  'coin',
  'barista-sora',
  'barista-momo',
  'petals',
] as const;

export default defineAssets(
  Object.fromEntries(CAFE_MODELS.map((name) => [name, { url: url(name), type: AssetType.GLTF, priority: 'critical' as const, name }])),
);
