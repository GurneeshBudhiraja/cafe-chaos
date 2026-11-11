# `quiet-corner` (grey-box)

Unlock: one armchair with a small side table, behind a plant screen. It counts as a "quiet place".

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `quiet-corner.glb`: 868 triangles, 48 KB.
- Size: 6.7 cm wide (x) × 7.0 cm tall (y) × 6.2 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Furniture`, `GB_Plant`, `GB_Seat`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `Seat-1` | The armchair. |
| `Meal-1` | On the side table. |

## How to use it

Copy `quiet-corner.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'quiet-corner': { url: publicAssetUrl('models/quiet-corner.glb'), type: AssetType.GLTF, priority: 'critical', name: 'quiet-corner' },
```

Each `AssetManager.getGLTF('quiet-corner').scene` is a fresh copy; the model's root node is named `quiet-corner`.

## Notes

Extra `seat_tags: "quiet"`. Best in a back corner, away from the door.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
