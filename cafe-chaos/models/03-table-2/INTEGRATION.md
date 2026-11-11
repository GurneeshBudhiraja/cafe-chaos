# `table-2` (final art)

A chunky little square table for two, with two short slat-back chairs and
sakura-pink zabuton cushions (final art, Japanese cafe style).

## The file

- `table-2.glb`: 2,792 triangles, 3 meshes, textured PBR.
- Size: 9.9 cm wide (x) × 4.2 cm tall (y) × 4.6 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Furniture`, `GB_Seat`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `Seat-1, Seat-2` | Where a guest sits: the chair's seat top (1.6 cm up), turned so a guest copying it faces the table. |
| `Meal-1, Meal-2` | Where each guest's `meal` goes, on the table top in front of them. |
| `TableTop` | The table top's centre (2.8 cm up), for the `table-mess`. |

## How to use it

Copy `table-2.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'table-2': { url: publicAssetUrl('models/table-2.glb'), type: AssetType.GLTF, priority: 'critical', name: 'table-2' },
```

Each `AssetManager.getGLTF('table-2').scene` is a fresh copy; the model's root node is named `table-2`.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
