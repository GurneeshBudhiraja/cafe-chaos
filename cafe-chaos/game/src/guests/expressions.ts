/**
 * How a guest acts while it is held: one steady face at a time, made
 * from the models' own face parts (wide eyes whose pupils can look
 * about, five mouths) over the kicking-legs Lifted clip.
 *
 * A face only changes when something the player can see changes, so
 * nothing about it reads as random:
 *
 * - The moment it is picked up it is surprised: wide eyes, an "o"
 *   mouth, legs going fast. That lasts a second.
 * - Carried, it looks down at the seat it is being held over (straight
 *   down at the café when there is none), and its mouth follows its
 *   patience dial, band for band with the dial's colours: calm (a small
 *   smile) while the ring is mint, uneasy (an "o") on amber, worried (a
 *   frown, drooping, legs barely moving) on coral. Patience only runs
 *   down, so it goes through these once, in that order. A guest with no
 *   timer running (picked up from a seat) stays calm.
 * - Held right up to the player's face it is puzzled: it stops kicking,
 *   looks straight at the player with its head on one side, and stays
 *   like that until it is taken away again. This is only for a guest
 *   brought up close on purpose, nearer than carrying one about the
 *   café ever brings it.
 *
 * Pure timing and data: the system reads `HeldAct.update()` each frame
 * and applies the face (GuestActor.setFace), the pace of the kicking and
 * the lean of the body.
 */

import type { Face } from './actor.js';

/** How far the wide eyes' pupils can look from centre (metres on the face). */
const LOOK_M = 0.001;

export type MoodName = 'surprised' | 'calm' | 'uneasy' | 'worried' | 'puzzled';

/** What the guest is doing this frame. */
export interface Acting {
  mood: MoodName;
  face: Face;
  /** The Lifted clip's pace (1 is as authored): how hard it kicks. */
  kick: number;
  /** Lean of the whole body (radians): roll is a head tilt to the side, pitch a droop forward. */
  roll: number;
  pitch: number;
}

/** What the system tells a held guest each frame. */
export interface Held {
  /** How far it is from the player's head (metres). */
  distance: number;
  /** How much of its patience is left, 1 to 0 (1 for a guest with no timer running). */
  patience: number;
  /** Where the thing it should look at is, from its own eyes: -1 to 1 to its left, -1 to 1 upward. */
  lookX: number;
  lookY: number;
}

interface Mood {
  name: MoodName;
  mouth: Face['mouth'];
  kick: number;
  roll: number;
  pitch: number;
}

const SURPRISED: Mood = { name: 'surprised', mouth: 'MouthO', kick: 1.4, roll: 0, pitch: 0 };
const CALM: Mood = { name: 'calm', mouth: 'MouthSmile', kick: 0.55, roll: 0, pitch: 0 };
const UNEASY: Mood = { name: 'uneasy', mouth: 'MouthO', kick: 0.85, roll: 0, pitch: 0.05 };
const WORRIED: Mood = { name: 'worried', mouth: 'MouthFrown', kick: 0.3, roll: 0, pitch: 0.2 };
const PUZZLED: Mood = { name: 'puzzled', mouth: 'MouthO', kick: 0.12, roll: 0.26, pitch: 0.04 };

/** How long the surprise of being picked up lasts (seconds). */
export const SURPRISE_SECONDS = 1;
/** The patience left at which a carried guest turns uneasy, then worried: the dial's amber and coral bands. */
export const PATIENCE_BANDS = { uneasy: 0.5, worried: 0.25 };
/**
 * Held nearer the player's head than `near` a guest is puzzled by the
 * player; it stops once farther than `far` (metres). Carrying a guest
 * about the café keeps it 35 cm or more from the head, so this only
 * happens when it is brought up close on purpose.
 */
export const FACE_RANGE = { near: 0.25, far: 0.31 };
/** How fast the eyes turn to what they look at (per second). */
const LOOK_FOLLOW = 7;
/** Blinks: every so often (seconds, at random within the range), this long. */
const BLINK = { every: [2.6, 4.4] as const, seconds: 0.13 };

export class HeldAct {
  /** What the guest is doing now (updated in place). */
  readonly acting: Acting = { mood: 'surprised', face: { eyes: 'EyesWide', mouth: 'MouthO', lookX: 0, lookY: 0 }, kick: 1, roll: 0, pitch: 0 };
  /** Every mood shown so far, in order (for the checks). */
  readonly seen: MoodName[] = ['surprised'];
  private mood: Mood = SURPRISED;
  private t = 0;
  private near = false;
  private lookX = 0;
  private lookY = 0;
  private nextBlink: number;
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.nextBlink = this.blinkGap();
  }

  /** Advance by `delta` seconds. */
  update(delta: number, held: Held): Acting {
    this.t += delta;
    this.near = held.distance < (this.near ? FACE_RANGE.far : FACE_RANGE.near);
    const mood = this.t < SURPRISE_SECONDS ? SURPRISED : this.near ? PUZZLED : held.patience <= PATIENCE_BANDS.worried ? WORRIED : held.patience <= PATIENCE_BANDS.uneasy ? UNEASY : CALM;
    if (mood !== this.mood) {
      this.mood = mood;
      this.seen.push(mood.name);
    }
    // Surprised, it stares at the hand that took it (up); puzzled, straight at the player; otherwise at the seat below.
    const wantX = mood === SURPRISED || mood === PUZZLED ? 0 : held.lookX;
    const wantY = mood === SURPRISED ? 0.5 : mood === PUZZLED ? 0.1 : held.lookY;
    const k = 1 - Math.exp(-LOOK_FOLLOW * delta);
    this.lookX += (wantX - this.lookX) * k;
    this.lookY += (wantY - this.lookY) * k;
    const out = this.acting;
    out.mood = mood.name;
    out.kick = mood.kick;
    out.roll = mood.roll;
    out.pitch = mood.pitch;
    out.face.eyes = 'EyesWide';
    out.face.mouth = mood.mouth;
    out.face.lookX = this.lookX * LOOK_M;
    out.face.lookY = this.lookY * LOOK_M;
    // It blinks now and then, except in its first surprise.
    if (mood !== SURPRISED) {
      this.nextBlink -= delta;
      if (this.nextBlink <= 0) out.face.eyes = 'EyesClosed';
      if (this.nextBlink <= -BLINK.seconds) this.nextBlink = this.blinkGap();
    }
    return out;
  }

  private blinkGap(): number {
    return BLINK.every[0] + this.random() * (BLINK.every[1] - BLINK.every[0]);
  }
}

/**
 * The face a guest on its feet makes when a hand comes close: wide eyes
 * following the hand, an "o" mouth. `x` and `y` are where the hand is in
 * the guest's own frame (metres: to its left, and above its eyes).
 */
export function watchingFace(x: number, y: number, out: Face): Face {
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  out.eyes = 'EyesWide';
  out.mouth = 'MouthO';
  out.lookX = clamp(x / 0.05) * LOOK_M;
  out.lookY = clamp(y / 0.05) * LOOK_M * 0.8;
  return out;
}
