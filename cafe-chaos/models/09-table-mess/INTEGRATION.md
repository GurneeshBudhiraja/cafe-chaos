# `table-mess` (grey-box)

The dirty-table state: a used plate, a tipped cup, a spill and crumbs. Show it on a table's `TableTop` after its guests leave; hide it when the janitor has cleaned.

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `table-mess.glb`: 764 triangles, 46 KB.
- Size: 3.4 cm wide (x) × 1.2 cm tall (y) × 3.0 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Mess`, `GB_Plate`.

## How to use it

Copy `table-mess.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'table-mess': { url: publicAssetUrl('models/table-mess.glb'), type: AssetType.GLTF, priority: 'critical', name: 'table-mess' },
```

Each `AssetManager.getGLTF('table-mess').scene` is a fresh copy; the model's root node is named `table-mess`.

## Notes

Sized for the small tables (about 3.4 cm across). Scale it to fit bigger tables.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
