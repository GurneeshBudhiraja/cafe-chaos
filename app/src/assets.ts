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
import { stylusPrototype } from './scene-assets/stylus.scene-asset.js';
import { toolWheelPrototype } from './scene-assets/tool-wheel.scene-asset.js';
import {
  stickyBlushPrototype,
  stickyClassicPrototype,
  stickyFormalPrototype,
  stickyMintPrototype,
  stickySkyPrototype,
} from './scene-assets/sticky-notes.scene-asset.js';
import { pushPinPrototype, washiTapePrototype } from './scene-assets/pins-and-tape.scene-asset.js';
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
  stylus: stylusPrototype,
  'tool-wheel': toolWheelPrototype,
  'sticky-classic': stickyClassicPrototype,
  'sticky-formal': stickyFormalPrototype,
  'sticky-mint': stickyMintPrototype,
  'sticky-blush': stickyBlushPrototype,
  'sticky-sky': stickySkyPrototype,
  'push-pin': pushPinPrototype,
  'washi-tape': washiTapePrototype,
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
