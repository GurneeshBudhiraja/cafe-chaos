# Themed hands (work in progress — two candidates)

Quest hand tracking gives the game 25 joints per hand every frame. IWSDK draws a generic
"ghost" hand from them: an invisible occluder mesh plus a thin white outline, loaded from the
WebXR input-profiles CDN (`generic-hand/left.glb`), skinned and driven by joint matrices
(`@iwsdk/xr-input`, `AnimatedHand`). There is no config switch for it, but the visual class can
be swapped at runtime, which is what these files are for.

## How a custom hand plugs in

`AnimatedHand.update()` poses **any node whose name is a WebXR joint name** with that joint's
matrix (relative to the grip space, applied as the node's local transform). So a rigid hand
needs no skinning: a glb with sibling nodes named `wrist`, `thumb-metacarpal`,
`thumb-phalanx-proximal`, … `pinky-finger-tip` (25 names), each mesh modelled with its origin at
the joint, the bone running along −Z and the back of the hand along +Y. Missing joints are
skipped, so a file with only two nodes is fine.

```ts
import { AnimatedHand } from '@iwsdk/core';
class CafeHandL extends AnimatedHand {
  static assetKeyPrefix = 'cafe-hand'; static assetProfileId = 'cafe-hand';
  static assetPath = '/models/cafe-hand.glb';                 // or cafe-tips.glb
  init() { this.model.traverse((o: any) => { if (o.isMesh) o.frustumCulled = false; }); }
}
class CafeHandR extends CafeHandL { static assetPath = '/models/cafe-hand-right.glb'; }
world.input.xr.visualAdapters.hand.left.updateVisualImplementation(CafeHandL);
world.input.xr.visualAdapters.hand.right.updateVisualImplementation(CafeHandR);
```

(The left file is built; the right one is its mirror, exported once the design is chosen.)

## The two candidates

| File | Idea | What the player sees |
|---|---|---|
| `cafe-hand.glb` | **Mochi mitten**: a full soft white hand with pink paw pads, a sakura on the back and a pink cuff; 25 rigid segments, 3.5 k tris | Their hand replaced by a plush café glove. Fully themed, but it covers the real hand in passthrough and any tracking jitter shows on the whole hand. |
| `cafe-tips.glb` | **Pinch caps**: only the thumb and index tips get a pink cap with a gold rim and a white "bean"; 2 nodes, 14 KB | Their own real hand stays visible; the two fingers that matter for the game's pinch are marked. Cheapest, least jitter, and it quietly teaches the pinch gesture. |

Both keep the occlusion behaviour only if the game also keeps IWSDK's `stencilMaterial` on an
occluder copy (see `@iwsdk/xr-input/dist/visual/impl/animated-hand.js`).

See `previews/` for the current look; the design is not final.
