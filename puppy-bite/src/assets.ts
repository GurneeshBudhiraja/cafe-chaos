/**
 * Asset manifest shared by the app runtime and the scene editor. Evaluated
 * in two JS realms, so deterministic and side-effect free.
 */

import { defineAssets } from '@iwsdk/core';
import { tablePrototype } from './scene-assets/furniture.scene-asset.js';
import { livingRoomPrototype } from './scene-assets/room.scene-asset.js';

export default defineAssets({
  'living-room': livingRoomPrototype,
  table: tablePrototype,
});
