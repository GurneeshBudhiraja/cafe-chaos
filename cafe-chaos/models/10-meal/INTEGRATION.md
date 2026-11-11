# `meal` (grey-box)

The food that arrives when a guest sits: a plate with food and a cup.

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `meal.glb`: 280 triangles, 17 KB.
- Size: 2.6 cm wide (x) × 1.0 cm tall (y) × 1.9 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Food`, `GB_Plate`.

## How to use it

Copy `meal.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'meal': { url: publicAssetUrl('models/meal.glb'), type: AssetType.GLTF, priority: 'critical', name: 'meal' },
```

Each `AssetManager.getGLTF('meal').scene` is a fresh copy; the model's root node is named `meal`.

## Notes

Put one on each occupied seat's `Meal-N` anchor. It already faces the right way.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
