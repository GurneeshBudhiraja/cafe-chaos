# `guest-kid` (grey-box)

A child guest: the `guest` model at 0.75 scale (4.16 cm standing).

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `guest-kid.glb`: 2,728 triangles, 91 KB.
- Size: 2.4 cm wide (x) × 5.1 cm tall (y) × 2.1 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GuestBody`, `GuestHead`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `Standing / Seated, Grip, BubbleAnchor, MoodAnchor` | The same as `guest`. |

## How to use it

Copy `guest-kid.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'guest-kid': { url: publicAssetUrl('models/guest-kid.glb'), type: AssetType.GLTF, priority: 'critical', name: 'guest-kid' },
```

Each `AssetManager.getGLTF('guest-kid').scene` is a fresh copy; the model's root node is named `guest-kid`.

## Notes

Its `Grip` is lower and closer to the others, so a 3 cm pick radius still works.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
