# `table-big` (grey-box)

Unlock: a long table for six (three a side), for groups.

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `table-big.glb`: 1,740 triangles, 92 KB.
- Size: 12.6 cm wide (x) × 4.2 cm tall (y) × 10.5 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Furniture`, `GB_Seat`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `Seat-1 … Seat-6` | Three front, three back. |
| `Meal-1 … Meal-6` | Meals. |
| `TableTop` | For the `table-mess` (scale it up about 2× for this table). |

## How to use it

Copy `table-big.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'table-big': { url: publicAssetUrl('models/table-big.glb'), type: AssetType.GLTF, priority: 'critical', name: 'table-big' },
```

Each `AssetManager.getGLTF('table-big').scene` is a fresh copy; the model's root node is named `table-big`.

## Notes

Extra `seat_tags: "group"`.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
