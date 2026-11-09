/**
 * The look, in numbers: a lo-fi night at the café. The room around the
 * player dims to dusk, the café's own lamps take over, warm against a cool
 * fill, and their light spills out over the real table and fades.
 * Everything that tunes the mood lives here, so the look can be adjusted
 * from one file.
 */

/** How much the passthrough dims once the café is up (0 none, 1 black). */
export const DIM_LEVEL = 0.58;
/** The dimming's tint: a touch of night blue rather than plain black. */
export const DIM_COLOR = 0x06040c;
/** The dimming fades in over this many seconds once the café has arrived. */
export const DIM_FADE_SECONDS = 3.2;

/** The lamps come up over this long as the room dims (seconds); they start a moment after the dimming. */
export const LAMPS_UP_SECONDS = 2.6;
export const LAMPS_UP_DELAY = 0.6;
/** The lanterns breathe: a slow, slight flicker of the paper lights (fraction of their strength, and the pace in cycles per second). */
export const BREATH = { depth: 0.07, rate: 0.35 };

/** Tone mapping exposure (ACES filmic). */
export const EXPOSURE = 1.1;
/** The HDR environment's share (the scene JSON holds the same number). */
export const ENVIRONMENT_INTENSITY = 0.32;

/** The cool fill from above and the warm bounce from below, dim: the night around the café. */
export const FILL = { sky: 0x4c5a92, ground: 0x3a2416, intensity: 0.5 };

/**
 * The key light: a low, warm light from the front left, as if from a
 * street lamp beyond the garden. It is the one light that casts shadows:
 * the roof, the tree and the furniture throw them across the floor, and
 * the whole café throws one out over the player's table.
 */
export const KEY = { color: 0xffb57c, intensity: 1.7, position: [-0.55, 0.95, 0.65] as const, shadowMapSize: 1024, shadowRadius: 3 };

/** A lamp in the café (café space): a point light just below its paper, and a soft halo around it (halo 0: none). */
export interface Lamp {
  position: readonly [number, number, number];
  color: number;
  /** Candela: the light's strength (it falls off with the square of the distance). */
  intensity: number;
  /** Metres: beyond this the light is cut off (keeps the fragment cost bounded on the headset). */
  distance: number;
  /** The halo sprite's diameter in metres, and its opacity. */
  halo: number;
  haloOpacity: number;
}

/** Where the shell's lamps are (from the model: `GateLamps` and `LanternPapers`). */
export const LAMPS: Lamp[] = [
  // The two post lamps at the entrance, either side of the door frame: their pools reach out onto the table.
  { position: [0.34, 0.078, -0.036], color: 0xffa858, intensity: 0.07, distance: 0.5, halo: 0.08, haloOpacity: 0.5 },
  { position: [0.34, 0.078, 0.146], color: 0xffa858, intensity: 0.07, distance: 0.5, halo: 0.08, haloOpacity: 0.5 },
  // The three paper lanterns under the eave over the counter.
  { position: [-0.22, 0.124, -0.158], color: 0xffbe74, intensity: 0.09, distance: 0.5, halo: 0.11, haloOpacity: 0.45 },
  { position: [0, 0.124, -0.158], color: 0xffbe74, intensity: 0.09, distance: 0.5, halo: 0.11, haloOpacity: 0.45 },
  { position: [0.22, 0.124, -0.158], color: 0xffbe74, intensity: 0.09, distance: 0.5, halo: 0.11, haloOpacity: 0.45 },
  // The room's own warmth: an unseen light high in the middle of the café, so the tables sit in a cosy wash.
  { position: [0, 0.15, -0.03], color: 0xffc080, intensity: 0.1, distance: 0.55, halo: 0, haloOpacity: 0 },
];

/** The glowing materials, set for the night: emissive strength, and a warmer paper colour where the day one reads white. */
export const GLOW: Record<string, { strength: number; color?: number }> = {
  CafeLanternPaper: { strength: 1.6 },
  CafeShoji: { strength: 1.1, color: 0xffb46a },
};

/** The light spill on the player's table: a disc under the café, this radius (metres, café space). */
export const SPILL_RADIUS = 0.85;
/**
 * The spill's tint and strength, and the key light's share of it: the
 * lamps' pools make the spill, the key only lends a faint warmth, and
 * the café's shadow lies in it.
 */
export const SPILL = { color: 0xffdcb4, strength: 0.42, keyShare: 0.4 };
