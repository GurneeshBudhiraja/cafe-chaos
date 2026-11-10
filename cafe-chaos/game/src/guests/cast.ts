/**
 * The cast: who can walk up to the café. Three snack-spirit species
 * (models in `public/models/guest-*.glb`), each tinted its own pastel and
 * dressed from the shared accessories file, all picked at random, so no
 * two guests in the line look alike.
 *
 * Pure data and dice: the actor (actor.ts) builds the guest from a look.
 */

export type Species = 'mochi' | 'onigiri' | 'tofu';
export const SPECIES: readonly Species[] = ['mochi', 'onigiri', 'tofu'];

/** The model each species loads from. */
export const GUEST_MODEL: Record<Species, 'guest-mochi' | 'guest-onigiri' | 'guest-tofu'> = {
  mochi: 'guest-mochi',
  onigiri: 'guest-onigiri',
  tofu: 'guest-tofu',
};

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
  let species = pick(SPECIES, random);
  let tint = pick(TINTS, random);
  for (let tries = 0; avoid && tries < 6 && species === avoid.species && tint.hex === avoid.tint; tries++) {
    species = pick(SPECIES, random);
    tint = pick(TINTS, random);
  }
  const outfit: string[] = [];
  for (const place of WARDROBE) {
    if (outfit.length >= MAX_ITEMS || random() >= place.chance) continue;
    outfit.push(pick(place.items, random).replace('{s}', species));
  }
  return { species, tint: tint.hex, tintName: tint.name, outfit };
}
