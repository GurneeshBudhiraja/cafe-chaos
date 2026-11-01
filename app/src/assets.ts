/**
 * Asset manifest shared by the app runtime and the scene editor.
 *
 * This module is evaluated twice, in two separate JS realms (runtime and
 * editor), so it must stay deterministic and side-effect free: no World, no
 * DOM, no timers.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import {
  studentChairPrototype,
  studentDeskPrototype,
  teacherDeskPrototype,
} from './scene-assets/classroom-furniture.scene-asset.js';
import { classroomRoomPrototype } from './scene-assets/classroom-room.scene-asset.js';
import { toolWheelPrototype } from './scene-assets/tool-wheel.scene-asset.js';
import {
  stickyBlushPrototype,
  stickyClassicPrototype,
  stickyFormalPrototype,
  stickyMintPrototype,
  stickySkyPrototype,
} from './scene-assets/sticky-notes.scene-asset.js';
import { pushPinPrototype, washiTapePrototype } from './scene-assets/pins-and-tape.scene-asset.js';
import { tabletHandlePrototype } from './scene-assets/tablet.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  // The iPad-style tablet (made in Blender). Same contract as the code-built
  // one in tablet.scene-asset.ts, whose size constants the systems still use.
  tablet: {
    url: publicAssetUrl('models/tablet.glb'),
    type: AssetType.GLTF,
    priority: 'critical',
    name: 'Tablet',
  },
  // Classroom backdrop (desktop view and recordings only; hidden in XR).
  'classroom-room': classroomRoomPrototype,
  'student-desk': studentDeskPrototype,
  'student-chair': studentChairPrototype,
  'teacher-desk': teacherDeskPrototype,
  'tablet-handle': tabletHandlePrototype,
  // The Apple Pencil-style pen (made in Blender). Same contract as the
  // code-built one in stylus.scene-asset.ts, whose size constants PenSystem uses.
  stylus: {
    url: publicAssetUrl('models/stylus.glb'),
    type: AssetType.GLTF,
    priority: 'critical',
    name: 'Stylus',
  },
  'tool-wheel': toolWheelPrototype,
  'sticky-classic': stickyClassicPrototype,
  'sticky-formal': stickyFormalPrototype,
  'sticky-mint': stickyMintPrototype,
  'sticky-blush': stickyBlushPrototype,
  'sticky-sky': stickySkyPrototype,
  'push-pin': pushPinPrototype,
  'washi-tape': washiTapePrototype,
  // Soft spot under the held pen's nib, and its body's streak (made in Blender).
  'nib-shadow': {
    url: publicAssetUrl('models/nib-shadow.glb'),
    type: AssetType.GLTF,
    priority: 'critical',
    name: 'Nib Shadow',
  },
  // The page's paper picture: warm off-white with fibres and a soft edge shadow (drawn under the template lines).
  'paper-image': {
    url: publicAssetUrl('textures/paper.jpg'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'Paper Image',
  },
  'home-window': {
    url: publicAssetUrl('ui/home-window.uikitml'),
    type: AssetType.UIKitML,
    name: 'Home Window',
  },
  'compact-dock': {
    url: publicAssetUrl('ui/compact-dock.uikitml'),
    type: AssetType.UIKitML,
    name: 'Compact Dock',
  },
  toast: {
    url: publicAssetUrl('ui/toast.uikitml'),
    type: AssetType.UIKitML,
    name: 'Toast',
  },
  'note-bar': {
    url: publicAssetUrl('ui/note-bar.uikitml'),
    type: AssetType.UIKitML,
    name: 'Note Bar',
  },
  'tools-panel': {
    url: publicAssetUrl('ui/tools-panel.uikitml'),
    type: AssetType.UIKitML,
    name: 'Tools Panel',
  },
});
