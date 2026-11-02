/**
 * GloveSystem: your tracked hands become solid gloves, and a glove holding
 * the knife closes round its handle like a real hand.
 *
 * - The look: IWSDK draws tracked hands as a white outline. Here its hand
 *   mesh (the same skinned model, driven by the same joints) gets a solid
 *   glove material instead, and the outline is hidden.
 * - The grip (a "hand grab pose", as in Meta's Interaction SDK): while a
 *   hand holds the knife, the glove stops following the tracked fingers and
 *   takes a hammer grip around the handle, authored in the knife's frame:
 *   the palm on the handle, fingers wrapped round it, the thumb closing
 *   over them. Let go and it follows the tracked hand again.
 *
 * It runs after IWSDK's input system (which sets the hand's bones from the
 * tracked joints each frame) and overrides those bones while holding.
 */

import {
  createSystem,
  Grabbed,
  GrabSystem,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SkinnedMesh,
  Vector3,
  type Object3D,
} from '@iwsdk/core';
import { Knife } from '../kitchen-components.js';

type Hand = 'left' | 'right';
const HANDS: Hand[] = ['left', 'right'];

/** WebXR joint order: the wrist, then the thumb (4 joints) and four fingers (5 joints each). */
const THUMB = [1, 2, 3, 4];
const FINGERS = [
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
];
/** Each joint's parent in the hand's chain (the wrist has none). */
const PARENT: number[] = [-1, 0, 1, 2, 3, 0, 5, 6, 7, 8, 0, 10, 11, 12, 13, 0, 15, 16, 17, 18, 0, 20, 21, 22, 23];

/**
 * The grip, in the knife's frame (metres, radians; the handle runs along
 * +X, its middle near x = -0.015; the spine is +Y, the edge -Y, the flat
 * sides ±Z). Right hand; the left hand mirrors it across the blade.
 */
export const GRIP = {
  /** The handle's middle, where the fist closes. */
  handleMiddle: new Vector3(-0.024, 0.0, 0.0),
  /** Closes the gap between the palm and the handle: the hole moves this far toward the palm (metres). */
  palmSnug: 0.008,
  /**
   * Which way the back of the hand faces, round the handle: 0 is up (the
   * spine side), positive turns it toward +Z (the user's right when the
   * blade points ahead). Radians.
   */
  backOfHand: 0.6,
  /** How far each finger curls at its knuckle, middle and end joints. */
  fingerCurl: [1.25, 1.45, 0.9],
  /** The finger knuckles spread a little less in a fist. */
  fingerSplay: 0.04,
  /** The thumb: how far its base swings across the palm, and how its two joints bend. */
  thumbSwing: 0.55,
  thumbCurl: [0.35, 0.55, 0.45],
};

const gloveMaterial = new MeshStandardMaterial({ color: 0x30343c, roughness: 0.58, metalness: 0.05 });

interface HandRig {
  /** The hand's bones, in WebXR joint order. */
  bones: (Object3D | undefined)[];
  /** Each joint's rest pose relative to its parent joint (open hand, from the model's bind pose). */
  rest: Matrix4[];
  /** The closed fist: each joint relative to the wrist. */
  fist: Matrix4[];
  /** Where the fist's hole is, and how the hand sits round it: the wrist relative to the handle's frame. */
  seat: Matrix4;
}

export class GloveSystem extends createSystem({
  heldKnives: { required: [Knife, Grabbed] },
}) {
  private rigs: Partial<Record<Hand, HandRig>> = {};
  private grab: GrabSystem | undefined;
  // Scratch, allocated once.
  private readonly poses = Array.from({ length: 25 }, () => new Matrix4());
  private readonly turn = new Matrix4();
  private readonly mirror = new Matrix4().makeScale(1, 1, -1);
  private readonly parentInverse = new Matrix4();
  private readonly local = new Matrix4();
  private readonly axisX = new Vector3(1, 0, 0);
  private readonly axisY = new Vector3(0, 1, 0);
  private readonly axisZ = new Vector3(0, 0, 1);
  private readonly q = new Quaternion();

  init(): void {
    this.grab = this.world.getSystem(GrabSystem);
  }

  update(): void {
    for (const hand of HANDS) if (!this.rigs[hand]) this.rigs[hand] = this.dressHand(hand);
    for (const knife of this.queries.heldKnives.entities) {
      const hand = this.grab?.getHolderHand(knife);
      const rig = hand ? this.rigs[hand] : undefined;
      if (hand && rig && knife.object3D) this.holdPose(rig, knife.object3D, hand);
    }
  }

  /** Rebuild the grip from GRIP (after changing it, for tuning). */
  refit(): void {
    this.rigs = {};
  }

  // ------------------------------------------------------------- the look

  /** Give a hand's mesh the glove material, once its model has loaded. */
  private dressHand(hand: Hand): HandRig | undefined {
    const visual = this.input.xr.visualAdapters.hand[hand]?.visual as
      | { model?: Object3D; joints?: (Object3D | undefined)[] }
      | undefined;
    const model = visual?.model;
    if (!model || !visual.joints?.length) return undefined;
    let skeletonMesh: SkinnedMesh | undefined;
    model.traverse((object) => {
      if (!(object instanceof SkinnedMesh)) return;
      const uniforms = (object.material as { uniforms?: Record<string, unknown> }).uniforms;
      if (uniforms && 'outlineColor' in uniforms) {
        object.visible = false; // The outline.
      } else {
        object.material = gloveMaterial;
        object.castShadow = true;
        skeletonMesh = object;
      }
    });
    if (!skeletonMesh) return undefined;
    const bones = visual.joints;
    // The open hand: each bone's bind pose, relative to its parent joint.
    const skeleton = skeletonMesh.skeleton;
    const bind = bones.map((bone) => {
      const i = bone ? skeleton.bones.indexOf(bone as never) : -1;
      return i >= 0 ? skeleton.boneInverses[i].clone().invert() : new Matrix4();
    });
    const rest = bind.map((m, j) => (PARENT[j] < 0 ? new Matrix4() : bind[PARENT[j]].clone().invert().multiply(m)));
    const rig: HandRig = { bones, rest, fist: rest.map(() => new Matrix4()), seat: new Matrix4() };
    this.closeFist(rig);
    return rig;
  }

  // ------------------------------------------------------------- the grip

  /**
   * Close the open hand into a fist (wrist-relative joint poses), and work
   * out how to seat it on the handle: the fist's hole (the middle of the
   * curled fingers) on the handle's middle, the hole running along the
   * handle (from the little finger to the index, toward the blade), and the
   * back of the hand turned by GRIP.backOfHand.
   */
  closeFist(rig: HandRig): void {
    const pose = rig.fist;
    pose[0].identity();
    FINGERS.forEach((chain, f) => {
      const splay = (f - 1.5) * -GRIP.fingerSplay;
      chain.forEach((joint, k) => {
        pose[joint].copy(pose[PARENT[joint]]).multiply(rig.rest[joint]);
        if (k === 1) pose[joint].multiply(this.turn.makeRotationAxis(this.axisY, splay));
        const curl = GRIP.fingerCurl[k - 1];
        if (curl) pose[joint].multiply(this.turn.makeRotationAxis(this.axisX, -curl));
      });
    });
    THUMB.forEach((joint, k) => {
      pose[joint].copy(pose[PARENT[joint]]).multiply(rig.rest[joint]);
      if (k === 0) pose[joint].multiply(this.turn.makeRotationAxis(this.axisZ, GRIP.thumbSwing));
      const curl = GRIP.thumbCurl[k];
      if (curl) pose[joint].multiply(this.turn.makeRotationAxis(this.axisX, -curl));
    });
    const at = (j: number) => new Vector3().setFromMatrixPosition(pose[j]);
    // The hole: amid the curled middle and ring fingers' joints.
    const hole = new Vector3();
    for (const j of [11, 12, 13, 16, 17, 18]) hole.add(at(j));
    hole.multiplyScalar(1 / 6);
    // Its axis, from the little finger's knuckle to the index finger's.
    const along = at(6).sub(at(21)).normalize();
    // The back of the hand (the wrist's +Y), square to the axis.
    const back = new Vector3(0, 1, 0).addScaledVector(along, -along.y).normalize();
    const side = new Vector3().crossVectors(along, back);
    hole.addScaledVector(back, GRIP.palmSnug);
    // Fist frame (in wrist space): X along the hole, Y the back of the hand.
    const fistFrame = new Matrix4().makeBasis(along, back, side).setPosition(hole);
    // Handle frame: X along the handle, Y turned round it by backOfHand.
    const handleFrame = new Matrix4()
      .makeRotationAxis(this.axisX, GRIP.backOfHand)
      .setPosition(GRIP.handleMiddle);
    rig.seat.multiplyMatrices(handleFrame, fistFrame.invert());
  }

  /** Pose the glove's bones in the hammer grip around the knife's handle. */
  private holdPose(rig: HandRig, knife: Object3D, hand: Hand): void {
    knife.updateWorldMatrix(true, false);
    const wrist = this.poses[0].copy(knife.matrixWorld);
    if (hand === 'left') wrist.multiply(this.mirror);
    wrist.multiply(rig.seat);
    for (let j = 1; j < 25; j++) this.poses[j].multiplyMatrices(wrist, rig.fist[j]);

    // Into each bone's parent space (the hand model hangs off the tracked grip).
    rig.bones.forEach((bone, j) => {
      if (!bone?.parent) return;
      bone.parent.updateWorldMatrix(true, false);
      this.parentInverse.copy(bone.parent.matrixWorld).invert();
      this.local.multiplyMatrices(this.parentInverse, this.poses[j]);
      this.local.decompose(bone.position, this.q, bone.scale);
      bone.quaternion.copy(this.q);
      bone.matrix.copy(this.local);
      bone.updateMatrixWorld(true);
    });
  }
}
