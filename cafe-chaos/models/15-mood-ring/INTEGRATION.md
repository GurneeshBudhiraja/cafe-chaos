# `mood-ring` (grey-box)

A ring around a guest's feet that shows their mood.

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `mood-ring.glb`: 640 triangles, 12 KB.
- Size: 3.8 cm wide (x) × 0.4 cm tall (y) × 3.8 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `MoodRing`.

## How to use it

Copy `mood-ring.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'mood-ring': { url: publicAssetUrl('models/mood-ring.glb'), type: AssetType.GLTF, priority: 'critical', name: 'mood-ring' },
```

Each `AssetManager.getGLTF('mood-ring').scene` is a fresh copy; the model's root node is named `mood-ring`.

## Notes

Put it at `MoodAnchor`. Its material `MoodRing` glows; clone it per guest and shift its colour from green to red as the mood drains, or scale it down like a timer.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
