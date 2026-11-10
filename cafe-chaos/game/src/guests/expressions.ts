/**
 * How a guest acts while it is held: a little performance made from the
 * models' own face parts (five pairs of eyes, five mouths, pupils that
 * can look about) over the kicking-legs Lifted clip.
 *
 * - The moment it is picked up it is startled: wide eyes darting, an "o"
 *   mouth, legs going fast.
 * - Held out at arm's length it wonders what is happening: wide eyes
 *   sweeping slowly round, blinking now and then.
 * - Brought up to the player's face it goes through its feelings in
 *   turn: it looks straight at the player, curious; tilts its head,
 *   confused; looks left, right and down for a way out; droops, sad;
 *   screws its eyes shut in a sulk; then warms to the player and beams.
 *   Then round again.
 *
 * Pure timing and data: the system reads `HeldAct.update()` each frame
 * and applies the face (GuestActor.setFace), the pace of the kicking and
 * the lean of the body.
 */

import type { Face } from './actor.js';

/** How far the wide eyes' pupils can look from centre (metres on the face). */
const LOOK_M = 0.001;

export type MoodName = 'startled' | 'wondering' | 'curious' | 'confused' | 'searching' | 'sad' | 'sulking' | 'happy';

/** What the guest is doing this frame. */
export interface Acting {
  mood: MoodName;
  face: Face;
  /** The Lifted clip's pace (1 is as authored): how hard it kicks. */
  kick: number;
  /** Lean of the whole body (radians): roll is a head tilt to the side, pitch a droop forward. */
  roll: number;
  pitch: number;
  /** A quick shake of the head (radians of yaw, added to its facing). */
  shake: number;
}

interface Mood {
  name: MoodName;
  seconds: number;
  /** Open-eyed moods blink. */
  blinks: boolean;
  act: (t: number, out: Acting) => void;
}

const wide = (out: Acting, x: number, y: number, mouth: Face['mouth']): void => {
  out.face.eyes = 'EyesWide';
  out.face.mouth = mouth;
  out.face.lookX = x * LOOK_M;
  out.face.lookY = y * LOOK_M;
};

const STARTLED: Mood = {
  name: 'startled',
  seconds: 1.3,
  blinks: false,
  act: (t, out) => {
    wide(out, 0.9 * Math.sin(t * 15), 0.6 * Math.sin(t * 11 + 1), 'MouthO');
    out.kick = 1.5;
  },
};

const WONDERING: Mood = {
  name: 'wondering',
  seconds: Infinity,
  blinks: true,
  act: (t, out) => {
    // A slow look round: side to side, with a glance down at the drop.
    wide(out, Math.sin(t * 1.7), -0.45 + 0.55 * Math.sin(t * 0.9 + 0.5), 'MouthO');
    out.kick = 0.85;
    out.roll = 0.06 * Math.sin(t * 1.1);
  },
};

/** The feelings it goes through when held up to the player's face, in order. */
const NEAR: Mood[] = [
  {
    name: 'curious',
    seconds: 2.4,
    blinks: true,
    // Straight at the player, mouth a little open, leaning in.
    act: (t, out) => {
      wide(out, 0.12 * Math.sin(t * 2.2), 0.1, t % 1.2 < 0.6 ? 'MouthO' : 'MouthOpen');
      out.kick = 0.45;
      out.pitch = 0.1;
    },
  },
  {
    name: 'confused',
    seconds: 2.6,
    blinks: true,
    // Head on one side, then the other, eyes up in thought, a small frown.
    act: (t, out) => {
      const side = Math.sin(t * 2.1);
      wide(out, 0.6 * side, 0.75, 'MouthFrown');
      out.kick = 0.3;
      out.roll = 0.3 * side;
    },
  },
  {
    name: 'searching',
    seconds: 3,
    blinks: false,
    // Left... right... down: is there a way out?
    act: (t, out) => {
      const step = Math.floor(t / 0.75) % 4;
      const [x, y] = [[-1, 0.1], [1, 0.1], [0, -1], [0, 0.2]][step];
      wide(out, x, y, 'MouthO');
      out.kick = 0.7;
      out.shake = step < 2 ? (step === 0 ? -0.25 : 0.25) : 0;
    },
  },
  {
    name: 'sad',
    seconds: 2.6,
    blinks: false,
    // Plain eyes, a frown, drooping forward, legs barely moving.
    act: (t, out) => {
      out.face.eyes = t % 1.6 > 1.35 ? 'EyesClosed' : 'EyesOpen';
      out.face.mouth = 'MouthFrown';
      out.kick = 0.18;
      out.pitch = 0.26 + 0.03 * Math.sin(t * 2.4);
    },
  },
  {
    name: 'sulking',
    seconds: 1.8,
    blinks: false,
    // Eyes screwed shut, shaking its head.
    act: (t, out) => {
      out.face.eyes = 'EyesCross';
      out.face.mouth = 'MouthFrown';
      out.kick = 1.1;
      out.shake = 0.3 * Math.sin(t * 13);
    },
  },
  {
    name: 'happy',
    seconds: 3,
    blinks: false,
    // It has decided the player is all right: smiling eyes, a smile, a happy wriggle.
    act: (t, out) => {
      out.face.eyes = 'EyesHappy';
      out.face.mouth = t % 0.9 < 0.45 ? 'MouthSmile' : 'MouthOpen';
      out.kick = 0.9;
      out.roll = 0.14 * Math.sin(t * 6);
    },
  },
];

/** Held nearer the player's head than this, a guest plays to the player; it stops once farther than `far` (metres). */
export const FACE_RANGE = { near: 0.4, far: 0.48 };
/** Blinks: every so often (seconds, at random within the range), this long. */
const BLINK = { every: [2.2, 4] as const, seconds: 0.13 };

export class HeldAct {
  /** What the guest is doing now (updated in place). */
  readonly acting: Acting = { mood: 'startled', face: { eyes: 'EyesWide', mouth: 'MouthO', lookX: 0, lookY: 0 }, kick: 1, roll: 0, pitch: 0, shake: 0 };
  /** Every mood shown so far, in order (for the checks). */
  readonly seen: MoodName[] = ['startled'];
  private mood: Mood = STARTLED;
  private t = 0;
  private nearIndex = 0;
  private near = false;
  private nextBlink: number;
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.nextBlink = this.blinkGap();
  }

  /** Advance by `delta` seconds; `distance` is how far the guest is from the player's head (metres). */
  update(delta: number, distance: number): Acting {
    this.t += delta;
    this.near = distance < (this.near ? FACE_RANGE.far : FACE_RANGE.near);
    if (this.mood === STARTLED) {
      if (this.t >= STARTLED.seconds) this.enter(this.near ? NEAR[this.nearIndex] : WONDERING);
    } else if (!this.near) {
      if (this.mood !== WONDERING) this.enter(WONDERING);
    } else if (this.mood === WONDERING) {
      this.enter(NEAR[this.nearIndex]);
    } else if (this.t >= this.mood.seconds) {
      this.nearIndex = (this.nearIndex + 1) % NEAR.length;
      this.enter(NEAR[this.nearIndex]);
    }
    const out = this.acting;
    out.mood = this.mood.name;
    out.kick = 1;
    out.roll = 0;
    out.pitch = 0;
    out.shake = 0;
    out.face.lookX = 0;
    out.face.lookY = 0;
    this.mood.act(this.t, out);
    if (this.mood.blinks) {
      this.nextBlink -= delta;
      if (this.nextBlink <= 0) out.face.eyes = 'EyesClosed';
      if (this.nextBlink <= -BLINK.seconds) this.nextBlink = this.blinkGap();
    }
    return out;
  }

  private enter(mood: Mood): void {
    this.mood = mood;
    this.t = 0;
    this.seen.push(mood.name);
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
