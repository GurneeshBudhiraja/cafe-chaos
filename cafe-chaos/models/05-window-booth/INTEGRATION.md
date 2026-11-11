# `window-booth` (grey-box)

Unlock: a booth for four against the window wall: two padded benches facing across a long table. Every seat counts as "by the window".

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `window-booth.glb`: 552 triangles, 32 KB.
- Size: 12.2 cm wide (x) × 5.0 cm tall (y) × 8.4 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Furniture`, `GB_Seat`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `Seat-1 … Seat-4` | Two seats on each bench. |
| `Meal-1 … Meal-4` | Meals. |
| `TableTop` | For the `table-mess`. |

## How to use it

Copy `window-booth.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'window-booth': { url: publicAssetUrl('models/window-booth.glb'), type: AssetType.GLTF, priority: 'critical', name: 'window-booth' },
```

Each `AssetManager.getGLTF('window-booth').scene` is a fresh copy; the model's root node is named `window-booth`.

## Notes

Extra `seat_tags: "window"`. Place it against the window wall (`+x`), with its benches running front to back.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
