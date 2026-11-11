# `demand-bubble` (grey-box)

A speech bubble for a guest's demand, with a tail pointing down.

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `demand-bubble.glb`: 120 triangles, 4 KB.
- Size: 3.0 cm wide (x) × 2.9 cm tall (y) × 1.0 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Signal`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `IconSlot` | The front face's centre, for the demand's icon (the icons come with the art pass). |

## How to use it

Copy `demand-bubble.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'demand-bubble': { url: publicAssetUrl('models/demand-bubble.glb'), type: AssetType.GLTF, priority: 'critical', name: 'demand-bubble' },
```

Each `AssetManager.getGLTF('demand-bubble').scene` is a fresh copy; the model's root node is named `demand-bubble`.

## Notes

Hang it at a guest's `BubbleAnchor`. The game should turn it to face the viewer every frame: on a guest seated sideways it is otherwise seen edge-on. On Quest 3/3S show it when a hand comes close; on the VR Glasses, when the guest is looked at (IWSDK's `gaze` feature).

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
