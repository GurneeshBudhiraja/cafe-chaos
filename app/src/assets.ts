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
import {
  tabletHandlePrototype,
  tabletPrototype,
} from './scene-assets/tablet.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  tablet: tabletPrototype,
  // Classroom backdrop (desktop view and recordings only; hidden in XR).
  'classroom-room': classroomRoomPrototype,
  'student-desk': studentDeskPrototype,
  'student-chair': studentChairPrototype,
  'teacher-desk': teacherDeskPrototype,
  'tablet-handle': tabletHandlePrototype,
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
  'tools-panel': {
    url: publicAssetUrl('ui/tools-panel.uikitml'),
    type: AssetType.UIKitML,
    name: 'Tools Panel',
  },
});
