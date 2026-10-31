/**
 * Development-only hooks for automated checks (scripts/*.mjs and the IWSDK
 * CLI). Exposes app objects on `window.__metaNotes` so scripts can locate UI
 * elements in 3D and inspect or fail note storage on purpose, plus a demo
 * helper for recordings. Nothing is exposed in production builds.
 */

import {
  BackSide,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type World,
} from '@iwsdk/core';
import type { NoteSession } from '../notes/note-session.js';
import type { SimulatedFailureStore } from '../notes/note-store.js';
import { getHomeMode } from '../ui/home-mode.js';
import { elementWorldPosition } from '../ui/panel-helpers.js';
import { getTweens } from '../ui/tweens.js';

export interface DevHooks {
  world: World;
  session: NoteSession;
  store: SimulatedFailureStore;
}

interface DemoHooks {
  /**
   * Recording only: wrap the viewer in a 360-degree photo (equirectangular
   * image URL, data URLs work) so videos can show the app outdoors. IWER only
   * emulates indoor rooms; on a headset, real passthrough is the backdrop.
   */
  showPanorama(url: string, yawDeg?: number): Promise<void>;
  /**
   * Recording only: surround the viewer with the 3D classroom (rows of
   * student desks facing the chalkboard), its origin at the seated
   * student's chair, turned by `yawDeg`. The student's own desk is
   * stretched to `deskHeightM`, so it can sit exactly on an emulated table
   * (the desk Quest would detect) and the tablet visibly lands on it.
   */
  showClassroom(origin: { x: number; z: number }, yawDeg: number, deskHeightM: number): Promise<void>;
  /** Recording only: scale UI animation time (see Tweens.timeScale). */
  setAnimationSpeed(scale: number): void;
  /** Recording only: bring the home back in front of the head (a recenter). */
  recenterHome(): void;
  /** Tests and recordings: world centre of a named object or UI element. */
  objectCenter(name: string): { x: number; y: number; z: number } | null;
}

export function installDevHooks(hooks: DevHooks): void {
  if (!import.meta.env.DEV) return;
  const demo: DemoHooks = {
    async showPanorama(url, yawDeg = 0) {
      const texture = await new TextureLoader().loadAsync(url);
      texture.colorSpace = SRGBColorSpace;
      const sphere = new Mesh(
        new SphereGeometry(40, 64, 32),
        new MeshBasicMaterial({ map: texture, side: BackSide, depthWrite: false }),
      );
      sphere.name = 'DemoPanorama';
      sphere.renderOrder = -10;
      sphere.rotation.y = (yawDeg * Math.PI) / 180;
      hooks.world.scene.add(sphere);
    },
    async showClassroom(origin, yawDeg, deskHeightM) {
      // Loaded on demand: the backdrop is not part of the app's scene.
      const [{ classroomRoomPrototype }, furniture] = await Promise.all([
        import('../scene-assets/classroom-room.scene-asset.js'),
        import('../scene-assets/classroom-furniture.scene-asset.js'),
      ]);
      const room = new Group();
      room.name = 'DemoClassroom';
      const add = (prototype: Group, x: number, z: number) => {
        const copy = prototype.clone();
        copy.position.set(x, 0, z);
        room.add(copy);
        return copy;
      };
      add(classroomRoomPrototype, 0, 0);
      add(furniture.teacherDeskPrototype, 0, -3.7);
      // Four rows of five desks, each with its chair behind it; the seated
      // student is in the third row, middle (the room's origin).
      for (const z of [-2.85, -1.6, -0.35, 0.9]) {
        for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) {
          const desk = add(furniture.studentDeskPrototype, x, z);
          if (x === 0 && z === -0.35) desk.scale.y = deskHeightM / furniture.STUDENT_DESK_HEIGHT_M;
          add(furniture.studentChairPrototype, x, z + 0.5);
        }
      }
      const fill = new HemisphereLight(0xfffaf0, 0x9e856b, 1.8);
      const sun = new DirectionalLight(0xfff5e0, 1.4);
      sun.position.set(-3, 2.6, 0);
      room.add(fill, sun);
      room.position.set(origin.x, 0, origin.z);
      room.rotation.y = (yawDeg * Math.PI) / 180;
      hooks.world.scene.add(room);
    },
    setAnimationSpeed(scale) {
      getTweens(hooks.world).timeScale = scale;
      // Stick mode reads the clock when it (re)anchors: re-anchor now.
      getHomeMode(hooks.world).notifyMoved();
    },
    recenterHome() {
      getHomeMode(hooks.world).requestRecenter();
    },
    objectCenter(name) {
      const object = hooks.world.scene.getObjectByName(name);
      if (!object) return null;
      const { x, y, z } = elementWorldPosition(object, new Vector3());
      return { x, y, z };
    },
  };
  (window as unknown as { __metaNotes: DevHooks & { demo: DemoHooks } }).__metaNotes = {
    ...hooks,
    demo,
  };
}
