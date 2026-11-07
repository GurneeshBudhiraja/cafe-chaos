# `waiting-bench` (final art)

The bench by the gate where guests wait when the café is full, with four slots: a timber bench with a slatted back and one long indigo cushion (final art).

## The file

- `waiting-bench.glb`: 336 triangles, 2 meshes, textured PBR.
- Size: 13.6 cm wide (x) × 3.8 cm tall (y) × 2.7 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Seat`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `Slot-1 … Slot-4` | Where a waiting guest stands, 3.2 cm apart, at the seat's height (1.6 cm). A guest copies the slot's position and turn. |

## How to use it

Copy `waiting-bench.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'waiting-bench': { url: publicAssetUrl('models/waiting-bench.glb'), type: AssetType.GLTF, priority: 'critical', name: 'waiting-bench' },
```

Each `AssetManager.getGLTF('waiting-bench').scene` is a fresh copy; the model's root node is named `waiting-bench`.

## Notes

Put it at the shell's `BenchSpot`.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
