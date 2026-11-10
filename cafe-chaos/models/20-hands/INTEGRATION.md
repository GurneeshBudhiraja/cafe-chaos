# `cafe-hand-left`, `cafe-hand-right` — the player's hands

A minimal matte hand for Quest hand tracking: cream (the café's ceramic white), soft tapered
finger segments with ball joints so bends stay continuous, a plain rounded palm and a thin sage
cuff. No pads, patterns or logos. ~4,000 triangles, two flat materials (`HandCream`,
`HandSage`), 70 KB each. The right hand is the left's mirror.

## How it plugs into IWSDK (no skinning needed)

IWSDK's `AnimatedHand` poses **any node whose name is a WebXR joint name** with that joint's
matrix (relative to the grip space, written as the node's local transform). Each file is a root
(`cafe-hand-left` / `-right`, extras `hand: "left"|"right"`) with **25 sibling nodes** named
`wrist`, `thumb-metacarpal`, `thumb-phalanx-proximal`, `thumb-phalanx-distal`, `thumb-tip`,
`index-finger-metacarpal`, `index-finger-phalanx-proximal`, `…-intermediate`, `…-distal`,
`index-finger-tip`, and the same for `middle-`, `ring-` and `pinky-finger`, plus a `cuff` mesh
that rides with the wrist. Each mesh is modelled at its joint with the bone along −Z and the back
of the hand along +Y (the WebXR joint frame), so posing the nodes is the whole job.

```ts
import { AnimatedHand } from '@iwsdk/core';
class CafeHandL extends AnimatedHand {
  static assetKeyPrefix = 'cafe-hand'; static assetProfileId = 'cafe-hand-left';
  static assetPath = '/models/cafe-hand-left.glb';
  init() { this.model.traverse((o: any) => { if (o.isMesh) o.frustumCulled = false; }); }
}
class CafeHandR extends CafeHandL { static assetProfileId = 'cafe-hand-right'; static assetPath = '/models/cafe-hand-right.glb'; }
world.input.xr.visualAdapters.hand.left.updateVisualImplementation(CafeHandL);
world.input.xr.visualAdapters.hand.right.updateVisualImplementation(CafeHandR);
```

Give each class its own `assetProfileId` (the SDK caches visuals by it). The `cuff` node is not
a joint; parent it to `wrist` in code (`model.getObjectByName('wrist').add(cuff)`) or leave it
and it stays at the grip.

This replaces IWSDK's ghost outline. If the game wants the hand to still occlude virtual objects
in passthrough, keep the SDK's `stencilMaterial` on a copy of the meshes (see
`@iwsdk/xr-input/dist/visual/impl/animated-hand.js`).

## Blender

`cafe-shell-art.blend`, scene `HandArt`; script `hand_build.py` (text block): finger lengths,
radii and splay in `FINGERS`/`THUMB`, colours in `flat()` at the top.
