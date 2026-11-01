/**
 * The bin that appears while a sticky note is carried, low in the view (as
 * if on the floor in front of you), so throwing a note away is one easy
 * motion. Carry the note over it: the bin grows and its lid swings open; let
 * go there and the note drops in.
 *
 * It fades in and out like everything else, follows the head while shown
 * (always at the bottom of the view), and eases between closed and open.
 */

import { Quaternion, Vector3, type Object3D, type World } from '@iwsdk/core';
import { BIN_HEIGHT_M, BIN_LID_OPEN_RAD, binPrototype } from '../scene-assets/bin.scene-asset.js';
import { MeshFade } from '../ui/mesh-fade.js';
import { easeInCubic, easeOutCubic, type Tweens } from '../ui/tweens.js';

/** Where the bin sits: this far from the eyes (metres), this far below where they look (radians): low in the view. */
const DISTANCE_M = 0.45;
const BELOW_GAZE_RAD = (28 * Math.PI) / 180;
/** Its top this far below the point it is placed at (metres), so the opening sits at that point. */
const MOUTH_DROP_M = 0.11;
/** Grown size while a note is over it. */
const OPEN_SCALE = 1.3;
/** A note's centre this close to the bin's opening (metres, at rest size) is over it. */
const OVER_WITHIN_M = 0.11;
/** How quickly it grows and its lid opens (fraction of the way per second). */
const EASE_PER_S = 10;
const FADE_IN_MS = 200;
const FADE_OUT_MS = 180;

export class StickyBin {
  private readonly bin: Object3D;
  private readonly lidHinge: Object3D | undefined;
  private readonly fade: MeshFade;
  private shown = false;
  private openness = 0;
  private opening = false;
  private readonly forward = new Vector3();
  private readonly mouth = new Vector3();
  private readonly yaw = new Quaternion();
  private static readonly UP = new Vector3(0, 1, 0);

  constructor(
    world: World,
    private readonly tweens: Tweens,
  ) {
    this.bin = binPrototype.clone();
    this.bin.visible = false;
    world.createTransformEntity(this.bin);
    this.lidHinge = this.bin.getObjectByName('LidHinge');
    this.fade = new MeshFade(this.bin);
  }

  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.opening = false;
    this.openness = 0;
    this.apply();
    this.bin.visible = true;
    this.fade.set(0);
    this.tweens.play(FADE_IN_MS, (t) => this.fade.set(easeOutCubic(t)), { key: 'sticky-bin' });
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.tweens.play(FADE_OUT_MS, (t) => this.fade.set(1 - easeInCubic(t)), {
      key: 'sticky-bin',
      done: () => {
        this.bin.visible = false;
        this.fade.set(1);
      },
    });
  }

  /** Keep it low in the view from `head` (world position and rotation); ease toward open or closed. */
  follow(head: Vector3, headRotation: Quaternion, deltaSeconds: number): void {
    if (!this.shown) return;
    // Where the eyes look, turned down a little further: the lower part of the view.
    this.forward.set(0, 0, -1).applyQuaternion(headRotation);
    const yaw = Math.atan2(-this.forward.x, -this.forward.z);
    const pitch = Math.max(-Math.PI / 2 + 0.1, Math.asin(Math.max(-1, Math.min(1, this.forward.y))) - BELOW_GAZE_RAD);
    this.forward.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    this.bin.position.copy(head).addScaledVector(this.forward, DISTANCE_M);
    this.bin.position.y -= MOUTH_DROP_M * this.bin.scale.y;
    // Upright, its front (+Z) toward the viewer.
    this.yaw.setFromAxisAngle(StickyBin.UP, yaw);
    this.bin.quaternion.copy(this.yaw);
    const target = this.opening ? 1 : 0;
    this.openness += (target - this.openness) * Math.min(1, deltaSeconds * EASE_PER_S);
    this.apply();
  }

  /** Whether a world point (a carried note's centre) is over the bin's opening; opens the lid while it is. */
  over(point: Vector3): boolean {
    if (!this.shown) return false;
    this.mouth.copy(this.bin.position);
    this.mouth.y += BIN_HEIGHT_M * this.bin.scale.y;
    this.opening = this.mouth.distanceTo(point) <= OVER_WITHIN_M * this.bin.scale.y;
    return this.opening;
  }

  /** Where a note thrown in goes: into the opening (world). */
  mouthPosition(out: Vector3): Vector3 {
    return out.copy(this.bin.position).setY(this.bin.position.y + BIN_HEIGHT_M * 0.6 * this.bin.scale.y);
  }

  private apply(): void {
    this.bin.scale.setScalar(1 + (OPEN_SCALE - 1) * this.openness);
    if (this.lidHinge) this.lidHinge.rotation.x = -BIN_LID_OPEN_RAD * this.openness;
  }
}
