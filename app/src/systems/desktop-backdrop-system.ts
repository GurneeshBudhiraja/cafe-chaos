/**
 * DesktopBackdropSystem: hides desktop-only scenery during immersive XR.
 *
 * This is a mixed-reality app: in the headset the user should see their real
 * room through passthrough, with notes placed in it. The classroom backdrop
 * exists for the flat desktop view and demo recordings, so every entity with
 * `DesktopBackdrop { hideInXR: true }` is hidden while a session is active
 * and shown again when the user returns to the browser view.
 */

import {
  createSystem,
  Visibility,
  VisibilityState,
  type Entity,
} from '@iwsdk/core';
import { DesktopBackdrop } from '../note-components.js';

export class DesktopBackdropSystem extends createSystem({
  backdrops: { required: [DesktopBackdrop, Visibility] },
}) {
  private inXr = false;

  init(): void {
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        this.inXr = state !== VisibilityState.NonImmersive;
        for (const entity of this.queries.backdrops.entities) this.apply(entity);
      }),
      // Backdrop entities loaded later (for example after a level reload).
      this.queries.backdrops.subscribe('qualify', (entity) => this.apply(entity)),
    );
  }

  private apply(entity: Entity): void {
    const hide = this.inXr && (entity.getValue(DesktopBackdrop, 'hideInXR') as boolean);
    entity.setValue(Visibility, 'isVisible', !hide);
  }
}
