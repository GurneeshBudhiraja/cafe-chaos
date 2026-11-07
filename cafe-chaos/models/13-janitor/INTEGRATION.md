# `janitor` (grey-box)

The janitor: a guest-style figure in green with a cap and a mop. The game walks it to a dirty table; it is never pinched.

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `janitor.glb`: 1,656 triangles, 67 KB.
- Size: 4.1 cm wide (x) × 6.5 cm tall (y) × 2.6 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GB_Plate`, `GB_Trim`, `GuestHead`, `JanitorBody`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `BubbleAnchor` | Above the head (for example, a "cleaning" icon). |

## How to use it

Copy `janitor.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'janitor': { url: publicAssetUrl('models/janitor.glb'), type: AssetType.GLTF, priority: 'critical', name: 'janitor' },
```

Each `AssetManager.getGLTF('janitor').scene` is a fresh copy; the model's root node is named `janitor`.

## Notes

Faces +Z.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
