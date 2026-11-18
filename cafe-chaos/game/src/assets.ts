/**
 * The café's models (made in Blender; each has an INTEGRATION.md under ../../models),
 * registered by their file names. The pieces the café is built from at
 * start load first ("critical"); the rest load in the background for the
 * game to come.
 *
 * Side-effect free: evaluated by both the runtime and the editor.
 */

import { AssetType, defineAssets } from '@iwsdk/core';

const url = (name: string): string => `${import.meta.env.BASE_URL}models/${name}.glb`;

/** What the café is built from the moment the game starts: the shell and its furniture. */
export const CAFE_PIECES = ['cafe-shell', 'table-2', 'table-4', 'bar-2', 'quiet-corner', 'meal'] as const;
/** The guests (three species) and what they wear: needed moments after the café is up. */
export const GUEST_PIECES = ['guest-mochi', 'guest-onigiri', 'guest-tofu', 'accessories'] as const;
/** The staff (the baristas' looks and the janitor, all on one rig), the trays they carry, and the petals that fall from the tree. */
export const STAFF_PIECES = ['barista-sora', 'barista-momo', 'barista-yuki', 'barista-janitor', 'tray-tea', 'tray-coffee', 'petals'] as const;
/** The annex wing and the plaque that opens it, its furniture, and the rest for the game to come (the janitor, the markers). */
export const LATER_PIECES = ['cafe-annex', 'unlock-plaque', 'window-booth', 'table-big', 'table-mess', 'demand-bubble', 'mood-ring', 'seat-glow', 'coin'] as const;

/**
 * The Canadian winter café (models/27-cafe-canada/INTEGRATION.md): its shell and furniture, its guests and their
 * winter clothes, its staff and the two musicians. All load in the background, after the Japanese café's: the start
 * card's Try free waits for them if they are not in yet.
 */
export const CANADA_PIECES = ['cafe-canada', 'table-ca-2', 'table-ca-4', 'patio-table', 'fire-chair'] as const;
export const CANADA_GUESTS = ['guest-snowbit', 'guest-beavertail', 'guest-nanaimo', 'accessories-canada'] as const;
export const CANADA_STAFF = ['barista-maple', 'barista-aspen', 'barista-rowan', 'barista-birch', 'barista-cedar', 'barista-fiddler', 'barista-pianist'] as const;

export type ModelName =
  | (typeof CAFE_PIECES)[number]
  | (typeof GUEST_PIECES)[number]
  | (typeof STAFF_PIECES)[number]
  | (typeof LATER_PIECES)[number]
  | (typeof CANADA_PIECES)[number]
  | (typeof CANADA_GUESTS)[number]
  | (typeof CANADA_STAFF)[number];

export default defineAssets({
  ...Object.fromEntries(CAFE_PIECES.map((name) => [name, { url: url(name), type: AssetType.GLTF, priority: 'critical' as const, name }])),
  ...Object.fromEntries(GUEST_PIECES.map((name) => [name, { url: url(name), type: AssetType.GLTF, priority: 'background' as const, name }])),
  ...Object.fromEntries(STAFF_PIECES.map((name) => [name, { url: url(name), type: AssetType.GLTF, priority: 'background' as const, name }])),
  ...Object.fromEntries(LATER_PIECES.map((name) => [name, { url: url(name), type: AssetType.GLTF, priority: 'background' as const, name }])),
  ...Object.fromEntries([...CANADA_PIECES, ...CANADA_GUESTS, ...CANADA_STAFF].map((name) => [name, { url: url(name), type: AssetType.GLTF, priority: 'background' as const, name }])),
});
