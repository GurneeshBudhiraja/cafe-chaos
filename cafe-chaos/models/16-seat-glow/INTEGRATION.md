# `seat-glow` (grey-box)

A glowing ring and disc that marks a seat while a guest is carried.

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `seat-glow.glb`: 604 triangles, 12 KB.
- Size: 3.3 cm wide (x) × 0.3 cm tall (y) × 3.3 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `SeatGlow`.

## How to use it

Copy `seat-glow.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'seat-glow': { url: publicAssetUrl('models/seat-glow.glb'), type: AssetType.GLTF, priority: 'critical', name: 'seat-glow' },
```

Each `AssetManager.getGLTF('seat-glow').scene` is a fresh copy; the model's root node is named `seat-glow`.

## Notes

Material `SeatGlow` (emissive). Show it at the nearest free seat; use a brighter or second colour for the best match.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
