# `guest` (grey-box)

An adult guest, 5.55 cm tall standing, with two poses in one model.

**Grey-box:** a placeholder at the final size. Simple shapes and flat colours, so the game can be built and played before the art pass. The final model must keep the same size, origin, facing and anchor names.

## The file

- `guest.glb`: 2,728 triangles, 91 KB.
- Size: 3.2 cm wide (x) × 6.8 cm tall (y) × 2.7 cm deep (z).
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the bottom centre, where it stands.
- Materials: `GuestBody`, `GuestHead`.

## Anchors (empty nodes the game reads)

| Name | What it is |
|---|---|
| `Standing / Seated` | Two groups: show one and hide the other. **Both are visible in the file**, so the game must hide one when it loads. |
| `Grip` | The point the player pinches (mid-body, 3.4 cm up). Pick up when a pinch closes within about 3 cm of it. |
| `BubbleAnchor` | Above the head, for the `demand-bubble`. |
| `MoodAnchor` | At the feet, for the `mood-ring`. |

## How to use it

Copy `guest.glb` to `app/public/models/` and register it in `src/assets.ts`:

```ts
  'guest': { url: publicAssetUrl('models/guest.glb'), type: AssetType.GLTF, priority: 'critical', name: 'guest' },
```

Each `AssetManager.getGLTF('guest').scene` is a fresh copy; the model's root node is named `guest`.

## Notes

Origin at the feet (standing) or the hips (seated), so copying a `Seat-N` or `Slot-N` anchor puts the guest right. Faces +Z (the small nose marks the front). The body material `GuestBody` is neutral, so tint a copy of it per guest type (alone, friends, loud group). The `Seated` legs reach 1.3 cm below the origin, down the front of the chair.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
