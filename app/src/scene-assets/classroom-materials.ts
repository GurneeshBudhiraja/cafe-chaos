/**
 * Shared materials for the classroom backdrop assets.
 *
 * One instance per material family, reused by every classroom prototype, so
 * the backdrop costs few draw-state changes. Never mutate these after
 * registration: every placed clone shares them.
 *
 * Lambert (diffuse-only) shading is used instead of PBR: the backdrop is
 * large, flat, painted scenery, and full-screen PBR walls cut the frame rate
 * roughly sixfold under software rendering (2.9 vs 16.4 fps measured).
 */

import { MeshLambertMaterial } from '@iwsdk/core';

export const classroomMaterials = {
  floor: new MeshLambertMaterial({ color: 0xb98b5e }),
  wall: new MeshLambertMaterial({ color: 0xece4d4 }),
  wallTrim: new MeshLambertMaterial({ color: 0x8a6f52 }),
  ceiling: new MeshLambertMaterial({ color: 0xf6f4ef }),
  ceilingLight: new MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0xfffbf0,
    emissiveIntensity: 0.9,
  }),
  chalkboard: new MeshLambertMaterial({ color: 0x2f4a3a }),
  chalk: new MeshLambertMaterial({ color: 0xf2f2ec }),
  boardFrame: new MeshLambertMaterial({ color: 0x9a7350 }),
  windowFrame: new MeshLambertMaterial({ color: 0xf8f8f6 }),
  // Bright, slightly emissive panes read as daylight without real lights.
  glass: new MeshLambertMaterial({
    color: 0xbfe0f5,
    emissive: 0x9fcbe8,
    emissiveIntensity: 0.55,
  }),
  deskTop: new MeshLambertMaterial({ color: 0xd8b98f }),
  metal: new MeshLambertMaterial({ color: 0x5b6470 }),
  seat: new MeshLambertMaterial({ color: 0x3e6fb0 }),
  teacherWood: new MeshLambertMaterial({ color: 0x7a5236 }),
  corkboard: new MeshLambertMaterial({ color: 0xc49a6c }),
  paper: new MeshLambertMaterial({ color: 0xfaf7ef }),
} as const;
