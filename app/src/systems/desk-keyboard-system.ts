/**
 * DeskKeyboardSystem: typing on the desk keyboard with the fingertips.
 *
 * Each tracked hand's index fingertip is followed over the keyboard (the
 * keyboard's own space, so it works on a desk or floating). A key is struck
 * when the fingertip, coming down from above, reaches the keycap; it must
 * lift clear again before it can strike another key, so resting or sliding
 * a finger does not type. This follows Meta's direct-touch guidance: index
 * fingers only, selection only on real contact, and clear visual and audio
 * feedback on every press (the cap goes down and a soft click plays).
 *
 * The keys type through the same commands as a real keyboard
 * (key-commands.ts), with a phone keyboard's extras:
 * - shift applies to the next letter; tapped twice it locks (caps lock),
 *   and its key stays down while on;
 * - 123 locks the number row to its symbols (! @ # ...), its key held down;
 * - holding delete repeats it;
 * - hide puts the keyboard away (back to Write mode).
 */

import { createSystem, Matrix4, Vector3 } from '@iwsdk/core';
import { HANDS, readFingertip, type Hand, type HandFrame } from '../input/hand-pinch.js';
import { KEYBOARD_KEYS, type DeskKeyboard, type KeyboardKey } from '../ui/desk-keyboard.js';
import { getTweens, type Tweens } from '../ui/tweens.js';
import { getTyping, type TypingState } from '../ui/typing-state.js';
import { playUiSound } from '../ui/ui-sounds.js';

/**
 * The fingertip joint sits about this far above the skin under it (metres),
 * so a key is touched when the joint is this high over its cap.
 */
const FINGER_RADIUS_M = 0.007;
/** A strike lands this far past first touch (half the key's travel, metres). */
const STRIKE_DEPTH_M = 0.001;
/** The fingertip must rise this far over the cap before it can strike again (metres). */
const LIFT_CLEAR_M = 0.006;
/** Keys are found this much beyond their caps' edges (metres), so the gaps between them do not swallow a press. */
const KEY_SLACK_M = 0.0015;
/** Delete repeats after being held this long, then this often (ms). */
const REPEAT_DELAY_MS = 500;
const REPEAT_EVERY_MS = 80;
/** Two shift taps this close together lock it (ms). */
const CAPS_LOCK_MS = 400;

/** One fingertip's state over the keyboard. */
interface Finger {
  tip: Vector3;
  /** Where it is in the keyboard's space. */
  local: Vector3;
  tracked: boolean;
  /** The key it is holding down, or null. */
  down: KeyboardKey | null;
  /** It has lifted clear since its last strike (only then can it strike again). */
  armed: boolean;
  heldMs: number;
  nextRepeatMs: number;
}

export class DeskKeyboardSystem extends createSystem({}) {
  private typing!: TypingState;
  private tweens!: Tweens;
  /** Last frame's fingertips, readable by tests and recordings. */
  readonly fingers: Record<Hand, Finger> = { left: createFinger(), right: createFinger() };
  private shift: 'off' | 'once' | 'locked' = 'off';
  private lastShiftMs = -Infinity;
  private symbols = false;
  /** The gesture clock (ms), scaled like the UI animations so slowed recordings keep true timing. */
  private clockMs = 0;
  private readonly handFrame: HandFrame = { frame: null!, space: null!, origin: new Matrix4() };
  private readonly toKeyboard = new Matrix4();

  init(): void {
    this.typing = getTyping(this.world);
    this.tweens = getTweens(this.world);
    this.cleanupFuncs.push(
      this.typing.subscribe(() => {
        // A fresh keyboard: nothing held, no shift.
        for (const hand of HANDS) this.liftFinger(this.fingers[hand]);
        this.setShift('off');
        this.setSymbols(false);
      }),
    );
  }

  update(delta: number): void {
    this.clockMs += delta * 1000 * this.tweens.timeScale;
    const keyboard = this.typing.keyboard;
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    if (!keyboard || !keyboard.root.visible || !this.typing.typing || !frame || !space) return;
    this.handFrame.frame = frame;
    this.handFrame.space = space;
    this.handFrame.origin.copy(this.player.matrixWorld);
    keyboard.root.updateWorldMatrix(true, false);
    this.toKeyboard.copy(keyboard.root.matrixWorld).invert();
    for (const hand of HANDS) {
      const finger = this.fingers[hand];
      finger.tracked = readFingertip(this.world.input.xr.getPrimaryInputSource(hand), this.handFrame, finger.tip);
      if (!finger.tracked) {
        this.release(keyboard, finger);
        continue;
      }
      finger.local.copy(finger.tip).applyMatrix4(this.toKeyboard);
      this.updateFinger(keyboard, finger, delta * 1000 * this.tweens.timeScale);
    }
  }

  private updateFinger(keyboard: DeskKeyboard, finger: Finger, deltaMs: number): void {
    const { local } = finger;
    if (finger.down) {
      // Held: lift clear (or slide off the cap) to let go; delete repeats while held.
      const key = finger.down;
      if (local.y > key.centre[1] + FINGER_RADIUS_M + LIFT_CLEAR_M * 0.5 || !this.over(key, local, KEY_SLACK_M * 4)) {
        this.release(keyboard, finger);
      } else if (key.code === 'Backspace') {
        finger.heldMs += deltaMs;
        if (finger.heldMs >= finger.nextRepeatMs) {
          finger.nextRepeatMs += REPEAT_EVERY_MS;
          this.type(key);
        }
      }
      return;
    }
    const key = this.keyUnder(local);
    const capTop = key ? key.centre[1] : KEYBOARD_KEYS[0].centre[1];
    if (local.y > capTop + FINGER_RADIUS_M + LIFT_CLEAR_M) finger.armed = true;
    if (!key || !finger.armed) return;
    if (local.y <= key.centre[1] + FINGER_RADIUS_M - STRIKE_DEPTH_M) {
      finger.down = key;
      finger.armed = false;
      finger.heldMs = 0;
      finger.nextRepeatMs = REPEAT_DELAY_MS;
      keyboard.press(key.code);
      playUiSound('key');
      this.strike(keyboard, key);
    }
  }

  private release(keyboard: DeskKeyboard, finger: Finger): void {
    const key = finger.down;
    if (!key) return;
    finger.down = null;
    // Shift and 123 stay down while they are on.
    if (key.code === 'ShiftLeft' && this.shift !== 'off') return;
    if (key.code === 'Symbols' && this.symbols) return;
    keyboard.release(key.code);
  }

  private liftFinger(finger: Finger): void {
    finger.down = null;
    finger.armed = false;
  }

  /** A key struck: type it, or switch shift, 123 or the keyboard. */
  private strike(keyboard: DeskKeyboard, key: KeyboardKey): void {
    switch (key.code) {
      case 'ShiftLeft': {
        const again = this.clockMs - this.lastShiftMs < CAPS_LOCK_MS;
        this.lastShiftMs = this.clockMs;
        this.setShift(this.shift === 'off' ? 'once' : again && this.shift === 'once' ? 'locked' : 'off', keyboard);
        return;
      }
      case 'Symbols':
        this.setSymbols(!this.symbols, keyboard);
        return;
      case 'Hide':
        this.typing.setMode('write');
        return;
    }
    this.type(key);
  }

  private type(key: KeyboardKey): void {
    const shifted = this.shift !== 'off' || (this.symbols && key.code.startsWith('Digit'));
    let stroke;
    switch (key.code) {
      case 'Space':
        stroke = { key: ' ' };
        break;
      case 'Enter':
        stroke = { key: 'Enter', shift: this.shift !== 'off' };
        break;
      case 'Backspace':
        stroke = { key: 'Backspace' };
        break;
      default:
        stroke = { key: shifted && key.shiftLabel ? key.shiftLabel : key.label, code: key.code };
    }
    this.typing.typeKey(stroke);
    // A one-time shift is used up by the next character.
    if (this.shift === 'once' && key.code !== 'Backspace') this.setShift('off');
  }

  private setShift(shift: 'off' | 'once' | 'locked', keyboard = this.typing.keyboard): void {
    const wasOn = this.shift !== 'off';
    this.shift = shift;
    if (wasOn && shift === 'off') keyboard?.release('ShiftLeft');
  }

  private setSymbols(on: boolean, keyboard = this.typing.keyboard): void {
    const was = this.symbols;
    this.symbols = on;
    if (was && !on) keyboard?.release('Symbols');
  }

  /** Tests and recordings: the world point `lift` metres over the centre of key `code`'s cap, or null. */
  keyPoint(code: string, lift: number): { x: number; y: number; z: number } | null {
    const keyboard = this.typing.keyboard;
    const key = KEYBOARD_KEYS.find((candidate) => candidate.code === code);
    if (!keyboard || !key) return null;
    keyboard.root.updateWorldMatrix(true, false);
    const { x, y, z } = keyboard.root.localToWorld(new Vector3(key.centre[0], key.centre[1] + lift, key.centre[2]));
    return { x, y, z };
  }

  /** The key whose cap a point (keyboard space) is over, if any. */
  private keyUnder(local: Vector3): KeyboardKey | null {
    for (const key of KEYBOARD_KEYS) if (this.over(key, local, KEY_SLACK_M)) return key;
    return null;
  }

  private over(key: KeyboardKey, local: Vector3, slack: number): boolean {
    return (
      Math.abs(local.x - key.centre[0]) <= key.size[0] / 2 + slack &&
      Math.abs(local.z - key.centre[2]) <= key.size[1] / 2 + slack
    );
  }
}

function createFinger(): Finger {
  return { tip: new Vector3(), local: new Vector3(), tracked: false, down: null, armed: false, heldMs: 0, nextRepeatMs: 0 };
}
