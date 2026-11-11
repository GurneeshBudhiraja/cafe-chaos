/**
 * The look, in numbers: a lo-fi evening at the café, kept bright enough
 * to play by. The room around the player dims to dusk, the café's own lamps take over, warm against a cool
 * fill, and their light spills out over the real table and fades.
 * Everything that tunes the mood lives here, so the look can be adjusted
 * from one file.
 */

/** How much the passthrough dims once the café is up (0 none, 1 black). */
export const DIM_LEVEL = 0.42;
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
export const EXPOSURE = 1.3;
/** The HDR environment's share (the scene JSON holds the same number). */
export const ENVIRONMENT_INTENSITY = 0.55;

/** The cool fill from above and the warm bounce from below, dim: the night around the café. */
export const FILL = { sky: 0x6a74a8, ground: 0x4a301c, intensity: 0.85 };

/**
 * The moon: a faint cool light from high front left that shapes the roof,
 * the tree and the garden. No shadows, and none of it reaches the spill.
 */
export const MOON = { color: 0xb8c0ea, intensity: 0.85, position: [-0.55, 1.1, 0.65] as const };

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
  intensity: 0.26,
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

/**
 * A light in the café (café space): a point light, cut off beyond
 * `distance`. Every light here is worked out for every lit pixel of the
 * café, so there are as few as carry the look: five.
 */
export interface Lamp {
  position: readonly [number, number, number];
  color: number;
  /** Candela: the light's strength (it falls off with the square of the distance). */
  intensity: number;
  /** Metres: beyond this the light is cut off (keeps the fragment cost bounded on the headset). */
  distance: number;
  /** Lanterns breathe (see BREATH); the others hold steady. */
  breathes: boolean;
}

export const LAMPS: Lamp[] = [
  // The two post lamps at the entrance, either side of the door frame: their pools reach out onto the table.
  { position: [0.34, 0.078, -0.036], color: 0xffa858, intensity: 0.08, distance: 0.5, breathes: false },
  { position: [0.34, 0.078, 0.146], color: 0xffa858, intensity: 0.08, distance: 0.5, breathes: false },
  // The paper lanterns under the eave over the counter: the outer two carry the light for all three.
  { position: [-0.2, 0.124, -0.158], color: 0xffbe74, intensity: 0.14, distance: 0.5, breathes: true },
  { position: [0.2, 0.124, -0.158], color: 0xffbe74, intensity: 0.14, distance: 0.5, breathes: true },
  // The room's own warmth: an unseen light high in the middle of the café, so the tables sit in a cosy wash.
  { position: [0, 0.15, -0.05], color: 0xffc080, intensity: 0.13, distance: 0.6, breathes: false },
];

/**
 * A halo: the soft glow drawn around a lamp's paper (a sprite, nearly
 * free to draw). One per visible lamp of the shell (`GateLamps` and
 * `LanternPapers` in the model), whether or not it has a light of its own.
 */
export interface Halo {
  position: readonly [number, number, number];
  color: number;
  /** Diameter in metres, and opacity. */
  size: number;
  opacity: number;
  breathes: boolean;
}

export const HALOS: Halo[] = [
  { position: [0.34, 0.078, -0.036], color: 0xffa858, size: 0.08, opacity: 0.5, breathes: false },
  { position: [0.34, 0.078, 0.146], color: 0xffa858, size: 0.08, opacity: 0.5, breathes: false },
  { position: [-0.22, 0.124, -0.158], color: 0xffbe74, size: 0.11, opacity: 0.45, breathes: true },
  { position: [0, 0.124, -0.158], color: 0xffbe74, size: 0.11, opacity: 0.45, breathes: true },
  { position: [0.22, 0.124, -0.158], color: 0xffbe74, size: 0.11, opacity: 0.45, breathes: true },
];

/** The glowing materials, set for the night: emissive strength, and a warmer paper colour where the day one reads white. */
export const GLOW: Record<string, { strength: number; color?: number }> = {
  CafeLanternPaper: { strength: 1.6 },
  CafeShoji: { strength: 1.1, color: 0xffb46a },
};

/**
 * When the café grows (the annex), the light grows with it. The annex is
 * a room of its own under its own eave, so it gets what the main room
 * has: paper lanterns hanging under the eave (copies of the main room's
 * middle lantern, `LANTERN_BOX`), each with a warm breathing light and a
 * halo, and the room's own unseen warm light moves over to the middle of
 * the wider room and reaches further. The house light stays over the
 * counter, so the main room keeps its look. The new lights come up with
 * the lamps and with the annex as it rises.
 */
export const ANNEX_LIGHT = {
  /** The room light (LAMPS[ROOM_LAMP]): where it goes, how far it reaches, and how much stronger it gets. */
  room: { position: [-0.17, 0.15, -0.05] as const, distance: 0.9, strength: 1.4 },
};
/** The main room's middle paper lantern (café space): copied to hang in the annex. */
export const LANTERN_BOX = { min: [-0.04, 0.085, -0.2] as const, max: [0.04, 0.175, -0.115] as const };
/** The annex's lanterns: how far left of the main room's middle lantern each hangs (metres, café space). */
export const ANNEX_LANTERNS_X = [-0.43, -0.59];
/** Each annex lantern's light (a point light where the lantern hangs) and halo: as the main room's lanterns, a touch stronger to carry the room alone. */
export const ANNEX_LAMP = { y: 0.124, z: -0.158, color: 0xffbe74, intensity: 0.17, distance: 0.55, halo: { size: 0.11, opacity: 0.45 } };
/** Which lamp is the room's own unseen light. */
export const ROOM_LAMP = 4;

/** The light spill on the player's table: a disc under the café, this radius (metres, café space). */
export const SPILL_RADIUS = 0.85;
/**
 * The spill's tint and strength (the table's reflectance, in effect). Only
 * the lamps and the house light reach it, each falling off with distance,
 * so it has no edge of its own: the feather below is only a safety bound.
 */
export const SPILL = { color: 0xffdcb4, strength: 0.62 };
