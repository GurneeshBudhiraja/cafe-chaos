/**
 * Drag a placed panel by its grab bar, like a window bar in visionOS.
 *
 * Pinch (or press) the grab element and move the ray: pointer capture keeps
 * the drag going after the ray leaves the bar, and the event point moves at
 * the grab distance, so the panel follows the hand. On release the panel
 * turns about its vertical axis to face the viewer.
 */

import { Quaternion, Vector3, type Object3D, type World } from '@iwsdk/core';
import { addStateColors, NEUTRAL_STATES, type PanelElement } from './panel-helpers.js';
import { THEME } from './theme.js';

/** The parts of a pmndrs pointer event the drag uses. */
interface DragPointerEvent {
  point?: Vector3;
  pointerId?: number;
  object?: { setPointerCapture?(id: number): void };
}

const BAR_REST = THEME.grabBar;
const BAR_ACTIVE = THEME.grabBarActive;
const UP = new Vector3(0, 1, 0);

export interface DragHooks {
  onStart?(): void;
  onEnd?(): void;
}

export function makeDraggable(
  grab: PanelElement,
  bar: PanelElement,
  target: Object3D,
  world: World,
  cleanupFuncs: Array<() => void>,
  hooks: DragHooks = {},
): void {
  const startPoint = new Vector3();
  const startPosition = new Vector3();
  const delta = new Vector3();
  let dragging = false;

  const down = (raw: unknown) => {
    const event = raw as DragPointerEvent;
    if (!event.point) return;
    dragging = true;
    startPoint.copy(event.point);
    startPosition.copy(target.position);
    if (event.pointerId != null) event.object?.setPointerCapture?.(event.pointerId);
    bar.setProperties({ backgroundColor: BAR_ACTIVE });
    hooks.onStart?.();
  };
  const move = (raw: unknown) => {
    const event = raw as DragPointerEvent;
    if (!dragging || !event.point) return;
    delta.copy(event.point).sub(startPoint);
    target.position.copy(startPosition).add(delta);
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    bar.setProperties({ backgroundColor: BAR_REST });
    faceViewer(target, world);
    hooks.onEnd?.();
  };
  grab.addEventListener('pointerdown', down);
  grab.addEventListener('pointermove', move);
  grab.addEventListener('pointerup', up);
  addStateColors(grab, NEUTRAL_STATES, cleanupFuncs);
  cleanupFuncs.push(() => {
    grab.removeEventListener('pointerdown', down);
    grab.removeEventListener('pointermove', move);
    grab.removeEventListener('pointerup', up);
  });
}

const viewer = new Vector3();
const facing = new Quaternion();

/** Turn `target` about its vertical axis to face the viewer's head. */
export function faceViewer(target: Object3D, world: World): void {
  world.camera.getWorldPosition(viewer);
  const yaw = Math.atan2(viewer.x - target.position.x, viewer.z - target.position.z);
  target.quaternion.copy(facing.setFromAxisAngle(UP, yaw));
}
