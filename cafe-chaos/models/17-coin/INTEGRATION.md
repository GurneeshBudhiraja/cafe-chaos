# `coin` (grey-box)

A coin, for money popping up when a guest pays.

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `coin.glb`: 92 triangles, 5 KB.
- Size: 1.6 cm wide (x) × 0.2 cm tall (y) × 1.6 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Coin`.

## How to use it

Copy `coin.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'coin': { url: publicAssetUrl('models/coin.glb'), type: AssetType.GLTF, priority: 'critical', name: 'coin' },
```

Each `AssetManager.getGLTF('coin').scene` is a fresh copy; the model's root node is named `coin`.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
