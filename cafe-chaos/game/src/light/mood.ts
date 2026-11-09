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
 * The moon: a faint cool light from high front left that shapes the roof,
 * the tree and the garden. No shadows, and none of it reaches the spill.
 */
export const MOON = { color: 0xaab4e6, intensity: 0.55, position: [-0.55, 1.1, 0.65] as const };

/**
 * The house light: a warm spot high over the counter, under the eave,
 * shining down and out toward the front. It is the one light that casts
 * shadows: the furniture throws them across the floor, and the door frame,
 * rail and fence throw them out onto the player's table, in the light
 * that pours out of the café's open side and front.
 */
export const HOUSE = {
  color: 0xffb77a,
  /** Candela. */
  intensity: 0.2,
  position: [0.02, 0.17, -0.11] as const,
  target: [0.06, 0, 0.16] as const,
  /** The cone's half angle (radians) and how soft its edge is. */
  angle: 1.2,
  penumbra: 0.75,
  /** Metres: the light's reach. */
  distance: 1.5,
  shadowMapSize: 1024,
  shadowRadius: 3,
};

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
  { position: [0, 0.15, -0.03], color: 0xffc080, intensity: 0.06, distance: 0.55, halo: 0, haloOpacity: 0 },
];

/** The glowing materials, set for the night: emissive strength, and a warmer paper colour where the day one reads white. */
export const GLOW: Record<string, { strength: number; color?: number }> = {
  CafeLanternPaper: { strength: 1.6 },
  CafeShoji: { strength: 1.1, color: 0xffb46a },
};

/** The light spill on the player's table: a disc under the café, this radius (metres, café space). */
export const SPILL_RADIUS = 0.85;
/**
 * The spill's tint and strength (the table's reflectance, in effect). Only
 * the lamps and the house light reach it, each falling off with distance,
 * so it has no edge of its own: the feather below is only a safety bound.
 */
export const SPILL = { color: 0xffdcb4, strength: 0.45 };
