/**
 * The janitor on stage: the `janitor` model (a figure in green with a cap
 * and a mop) driven the way a barista is (BaristaSystem), so the one
 * dispatcher moves both. The model has no clips of its own yet, so its
 * motion is made here: a bob as it walks, a side-to-side sway as it wipes
 * a table, still when idle. (The Blender pass, later, gives it a walk and
 * a wipe; this class then plays them.)
 */

import { AssetManager, Group, type Object3D } from '@iwsdk/core';
import { copyModel } from '../systems/cafe-system.js';
import type { BaristaClip } from './barista.js';

/** How the made motion looks: the walk's bob (metres, times a second) and the wipe's sway (radians, times a second). */
const MOTION = { bob: 0.0025, bobHz: 3.2, squash: 0.06, lean: 0.12, sway: 0.16, swayHz: 2.4, ease: 8 };

/** True once the janitor's model has loaded. */
export function janitorLoaded(): boolean {
  return !!AssetManager.getGLTF('janitor', { shared: true });
}

export class Janitor {
  readonly name = 'janitor';
  readonly root: Object3D;
  /** A janitor carries no tray (the dispatcher asks). */
  tray: Object3D | null = null;
  clip: BaristaClip = 'Idle';
  private time = 0;
  private readonly body: Object3D;

  constructor() {
    this.root = copyModel('janitor');
    this.root.name = 'Janitor';
    this.root.userData.dynamic = true;
    this.root.traverse((node) => {
      const mesh = node as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean };
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    // All of it moves together: its parts go under one group the motion is made on.
    this.body = new Group();
    this.body.name = 'JanitorBody';
    for (const child of [...this.root.children]) this.body.add(child);
    this.root.add(this.body);
  }
  /** The sway and lean as shown (eased toward what the motion asks). */
  private sway = 0;
  private lean = 0;

  /** What it is doing: 'Walk' bobs, 'Work' (wiping) sways, the rest stand still. */
  play(clip: BaristaClip, _once = false): void {
    if (this.clip === clip) return;
    this.clip = clip;
    this.time = 0;
    this.body.position.y = 0;
    this.body.rotation.z = 0;
  }

  /** How long a clip lasts (the made motions loop: a nominal second). */
  seconds(_clip: BaristaClip): number {
    return 1;
  }

  /** Nothing to hold: the dispatcher never gives the janitor a tray. */
  hold(_what: Object3D | null): void {
    this.tray = null;
  }

  update(delta: number): void {
    this.time += delta;
    const walking = this.clip === 'Walk' || this.clip === 'Carry';
    const wiping = this.clip === 'Work' || this.clip === 'Serve';
    // Walking: a bob with a little squash as each foot lands, leaning into the walk.
    const step = Math.abs(Math.sin(this.time * MOTION.bobHz * Math.PI * 2));
    this.body.position.y = walking ? step * MOTION.bob : 0;
    const squash = walking ? (1 - step) * MOTION.squash : 0;
    this.body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
    // Wiping: an eased side-to-side sway.
    const k = 1 - Math.exp(-MOTION.ease * delta);
    this.sway += ((wiping ? Math.sin(this.time * MOTION.swayHz * Math.PI * 2) * MOTION.sway : 0) - this.sway) * k;
    this.lean += ((walking ? MOTION.lean : 0) - this.lean) * k;
    this.body.rotation.set(this.lean, 0, this.sway);
  }
}
