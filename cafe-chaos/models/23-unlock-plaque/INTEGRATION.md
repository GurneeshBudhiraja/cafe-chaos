# `unlock-plaque` — the unlock plaque, and `unlock-icons.png`

A small ema-style wooden plaque hanging by a red cord from a little walnut stand, with a brass
padlock on its front. It stands on the player's real table in front of the café (the shell has
`PlaqueSpot-1 … 6` along the front gravel, 10 cm apart) and is easy to pinch.

- File: `unlock-plaque.glb`, ~900 triangles, 3 materials (`CafeWalnut`, `CafeBarPalette`,
  `PlaqueFace`), 580 KB with textures packed.
- Size: 4.6 cm wide × 4.6 cm tall × 2.0 cm deep; origin at the stand's base centre; front −Z… no:
  **front faces +Z** (toward the player), as every model here.

## Nodes

| Node | What |
|---|---|
| `Stand` | base plate, two uprights, crossbar |
| `Plaque` | pivot at the crossbar; the board swings from here |
| `PlaqueBoard` | the walnut ema board (3.6 × 3.0 cm, peaked top) |
| `PlaqueFace` | a cream quad inset on the front, **UV 0..1 across it** (u left→right, v bottom→top): draw the icon and price here (a 256 px canvas texture on a cloned `PlaqueFace` material) |
| `Cord` | the red hanging loop |
| `Padlock` → `PadlockBody`, `Shackle` | the lock on the board's bottom edge; `Shackle` pivots |
| `Grip` | the pinch point, the board's centre (0, 0.025, 0.006) |

## Clips

| Clip | Length | Use |
|---|---|---|
| `Locked` | 3 s loop | the plaque sways a little on its cord, the padlock swings |
| `Unlock` | 0.8 s, play once | the shackle pops open, the padlock drops and shrinks away, the plaque gives a happy bounce |
| `Owned` | still | padlock gone, plaque at rest — play this (or set `Padlock` scale 0) for bought items |

Play `Unlock` once with `clampWhenFinished`, then switch to `Owned`.

## `unlock-icons.png` — the icon atlas

1024 × 512 px, transparent, 4 × 2 tiles of 256 px: soft, slightly top-down renders of the real
models in the café's materials. Tile order (left→right, top row then bottom row):

| # | Tile | Model |
|---|---|---|
| 0 | barista | `barista-sora` |
| 1 | two-seat table | `table-2` |
| 2 | four-seat table | `table-4` |
| 3 | two-stool bar | `bar-2` |
| 4 | quiet-corner armchair | `quiet-corner` |
| 5 | paper lantern | one lantern from `queue-lanterns` |
| 6 | longer queue | a row of three guest footprints |
| 7 | the annex | `cafe-annex` |

UV of tile `i`: u from `(i % 4) / 4` to `(i % 4 + 1) / 4`, v from `1 − (i // 4 + 1) / 2` to
`1 − (i // 4) / 2` (v up).

## Blender

Scene `PlaqueArt`, script `plaque_build.py`; icons from `icon_render.py` (scene `IconRender`).
