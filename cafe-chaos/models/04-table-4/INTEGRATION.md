# `table-4` (final art)

A rectangular table for four with two sofa benches along its long sides (final
art). Each bench seats two, with visibly separate cushions and backrest humps
on the shared sofa, indigo fabric on a timber frame.

## The file

- `table-4.glb`: 2,784 triangles, 3 meshes, textured PBR.
- Size: 10.9 cm wide (x) × 4.2 cm tall (y) × 10.9 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Furniture`, `GB_Seat`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `Seat-1 … Seat-4` | Seats: 1-2 on the front sofa (nearest the player), 3-4 on the back sofa. |
| `Meal-1 … Meal-4` | Meals in front of each seat. |
| `TableTop` | For the `table-mess`. |

## How to use it

Copy `table-4.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'table-4': { url: publicAssetUrl('models/table-4.glb'), type: AssetType.GLTF, priority: 'critical', name: 'table-4' },
```

Each `AssetManager.getGLTF('table-4').scene` is a fresh copy; the model's root node is named `table-4`.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
