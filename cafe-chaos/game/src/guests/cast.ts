/**
 * The cast: who can walk up to the café. Three snack-spirit species
 * (models in `public/models/guest-*.glb`), each tinted its own pastel and
 * dressed from the shared accessories file, all picked at random, so no
 * two guests in the line look alike.
 *
 * Pure data and dice: the actor (actor.ts) builds the guest from a look.
 */

import { isCanada } from '../cafe/style.js';

export type Species = 'mochi' | 'onigiri' | 'tofu' | 'snowbit' | 'beavertail' | 'nanaimo';
export const SPECIES: readonly Species[] = ['mochi', 'onigiri', 'tofu'];
/** The Canadian café's guests (models/27-cafe-canada/INTEGRATION.md): a donut hole, a beaver tail and a nanaimo bar. */
export const CANADA_SPECIES: readonly Species[] = ['snowbit', 'beavertail', 'nanaimo'];

/** The model each species loads from. */
export const GUEST_MODEL: Record<Species, `guest-${Species}`> = {
  mochi: 'guest-mochi',
  onigiri: 'guest-onigiri',
  tofu: 'guest-tofu',
  snowbit: 'guest-snowbit',
  beavertail: 'guest-beavertail',
  nanaimo: 'guest-nanaimo',
};

/** The file a species' clothes come from: the Canadian guests wear the winter set. */
export function wardrobeOf(species: Species): 'accessories' | 'accessories-canada' {
  return CANADA_SPECIES.includes(species) ? 'accessories-canada' : 'accessories';
}

/**
 * Skin tints (the models ship near-white and are multiplied by one of
 * these). Kept this light on purpose: darker colours lose the skin's
 * texture and the face (see the model's notes).
 */
export const TINTS: readonly { name: string; hex: number }[] = [
  { name: 'plain', hex: 0xffffff },
  { name: 'sakura pink', hex: 0xfaa8c2 },
  { name: 'ramune blue', hex: 0x9eccfa },
  { name: 'matcha green', hex: 0xb3e09e },
  { name: 'yuzu yellow', hex: 0xf7e39a },
  { name: 'lavender', hex: 0xcfb8f0 },
  { name: 'peach', hex: 0xfbc8a6 },
];

/**
 * What can be worn, by where it hangs. `{s}` stands for the species:
 * headbands and clothes are fitted shells, one per body shape. `chance`
 * is how often a guest wears something in that place.
 */
const WARDROBE: readonly { attach: string; chance: number; items: readonly string[] }[] = [
  { attach: 'HeadTop', chance: 0.5, items: ['ChefHat', 'Beret', 'Hachimaki-{s}'] },
  { attach: 'Face', chance: 0.22, items: ['Glasses'] },
  { attach: 'Neck', chance: 0.25, items: ['Bow'] },
  { attach: 'Chest', chance: 0.3, items: ['Apron-{s}', 'Vest-{s}'] },
];
/** The Canadian guests' winter clothes (accessories-canada.glb; the suggested wardrobe in its notes). */
const CANADA_WARDROBE: readonly { attach: string; chance: number; items: readonly string[] }[] = [
  { attach: 'HeadTop', chance: 0.6, items: ['Toque-{s}', 'Earmuffs-{s}'] },
  { attach: 'Neck', chance: 0.35, items: ['Scarf-{s}'] },
  { attach: 'Chest', chance: 0.4, items: ['Parka-{s}'] },
];
/** Nobody wears more than this many things at once. */
const MAX_ITEMS = 2;

export interface Look {
  species: Species;
  tint: number;
  tintName: string;
  /** Node names in `accessories.glb`. */
  outfit: string[];
}

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length)];

/**
 * A random look. `avoid` is the look of the guest who came just before:
 * the newcomer gets a different species or tint, so neighbours in the
 * line differ.
 */
export function randomLook(random: () => number = Math.random, avoid?: Look): Look {
  // The Canadian guests ship in their own colours (the nanaimo's three layers cannot be a tint): no tint for them.
  const canada = isCanada();
  const species_ = canada ? CANADA_SPECIES : SPECIES;
  const tints = canada ? TINTS.slice(0, 1) : TINTS;
  let species = pick(species_, random);
  let tint = pick(tints, random);
  for (let tries = 0; avoid && tries < 6 && species === avoid.species && tint.hex === avoid.tint; tries++) {
    species = pick(species_, random);
    tint = pick(tints, random);
  }
  const outfit: string[] = [];
  for (const place of canada ? CANADA_WARDROBE : WARDROBE) {
    if (outfit.length >= MAX_ITEMS || random() >= place.chance) continue;
    outfit.push(pick(place.items, random).replace('{s}', species));
  }
  return { species, tint: tint.hex, tintName: tint.name, outfit };
}
