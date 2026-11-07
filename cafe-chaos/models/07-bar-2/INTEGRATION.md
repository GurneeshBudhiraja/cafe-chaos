# `bar-2` (grey-box)

Unlock: a short counter with two stools, for solo guests and pairs (fast seating).

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `bar-2.glb`: 484 triangles, 24 KB.
- Size: 9.0 cm wide (x) × 3.9 cm tall (y) × 5.0 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Furniture`, `GB_Seat`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `Seat-1, Seat-2` | On the stools (2.6 cm up), facing the counter. |
| `Meal-1, Meal-2` | On the counter. |
| `TableTop` | The counter top's centre, for the `table-mess`. |

## How to use it

Copy `bar-2.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'bar-2': { url: publicAssetUrl('models/bar-2.glb'), type: AssetType.GLTF, priority: 'critical', name: 'bar-2' },
```

Each `AssetManager.getGLTF('bar-2').scene` is a fresh copy; the model's root node is named `bar-2`.

## Notes

Extra `seat_tags: "solo,pair"`.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
