/**
 * Asset manifest shared by the app runtime and the scene editor.
 *
 * This module is evaluated twice, in two separate JS realms (runtime and
 * editor), so it must stay deterministic and side-effect free: no World, no
 * DOM, no timers.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import {
  tabletHandlePrototype,
  tabletPrototype,
} from './scene-assets/tablet.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  tablet: tabletPrototype,
  'tablet-handle': tabletHandlePrototype,
  'notes-panel': {
    url: publicAssetUrl('ui/notes-panel.uikitml'),
    type: AssetType.UIKitML,
    name: 'Notes Panel',
  },
  'tools-panel': {
    url: publicAssetUrl('ui/tools-panel.uikitml'),
    type: AssetType.UIKitML,
    name: 'Tools Panel',
  },
});
