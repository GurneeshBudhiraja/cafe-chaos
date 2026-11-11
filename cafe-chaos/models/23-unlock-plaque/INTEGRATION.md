# `unlock-plaque` — the unlock plaque, and `unlock-icons.png`

A small standing **stone tablet** — a rounded granite slab set in a low ring of gravel with a few
pebbles, like a garden marker — with a flat face the game draws on and a brass padlock hanging
from a ring at its top. It stands in the gravel in front of the café (the shell has
`PlaqueSpot-1 … 6` along the front strip, 10 cm apart) and is easy to pinch.

- File: `unlock-plaque.glb`, ~840 triangles, 4 materials (`CafeStone`, `CafeGravel`,
  `CafeBarPalette`, `PlaqueFace`), ~480 KB with textures packed (the game de-duplicates the
  shell's materials by name).
- Size: 5.2 cm wide × 4.65 cm tall × 4.1 cm deep (the gravel ring); the tablet itself 4.0 × 4.4 ×
  1.1 cm; origin at the base's underside centre; **front faces +Z** (toward the player).

## Nodes

| Node | What |
|---|---|
| `Base`, `Pebbles` | the gravel ring and pebbles |
| `Plaque` | pivot at the tablet's foot; the `Unlock` hop moves this |
| `PlaqueStone` | the granite slab |
| `FaceRim` | a thin dark border around the face |
| `PlaqueFace` | a light stone-cream quad on the front, 2.6 × 2.65 cm, **UV 0..1 across it** (u left→right, v bottom→top): draw the icon and price here (a 256 px canvas texture on a cloned `PlaqueFace` material) |
| `Ring` | the brass ring at the top |
| `Padlock` → `PadlockBody`, `Shackle` | the lock hanging from the ring; `Shackle` pivots |
| `Grip` | the pinch point on the tablet's front (0, 0.025, 0.006) |

## Clips

| Clip | Length | Use |
|---|---|---|
| `Locked` | 3 s loop | the stone is still; the padlock swings a little on its ring |
| `Unlock` | 0.8 s, play once | the shackle pops open, the padlock drops and shrinks away, the stone gives a little hop |
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
