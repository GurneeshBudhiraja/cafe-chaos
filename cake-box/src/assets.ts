/**
 * Asset manifest shared by the app runtime and the scene editor. Evaluated
 * in two JS realms, so deterministic and side-effect free.
 */

import { defineAssets } from '@iwsdk/core';
import { counterPrototype, knifePrototype } from './scene-assets/kitchen.scene-asset.js';
import { kitchenRoomPrototype } from './scene-assets/room.scene-asset.js';

export default defineAssets({
  'kitchen-room': kitchenRoomPrototype,
  knife: knifePrototype,
  counter: counterPrototype,
});
