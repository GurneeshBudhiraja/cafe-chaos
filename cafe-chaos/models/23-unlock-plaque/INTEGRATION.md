# `unlock-plaque` — the unlock plaque, and `unlock-icons.png`

A **flat stone lying in the gravel** — the same kind of stone as the garden's stepping stones —
with a cream face set into its flat top for the game to draw on, and a brass padlock lying on it,
its shackle hooked through a little brass staple at the stone's back edge. It sits in the gravel in
front of the café (the shell has `PlaqueSpot-1 … 6` along the front strip, 10 cm apart) and is easy
to pinch.

- File: `unlock-plaque.glb`, ~830 triangles, 3 materials (`CafeStone`, `CafeBarPalette`,
  `PlaqueFace`), ~480 KB with textures packed (the game de-duplicates the shell's materials by name).
- Size: 6.2 cm wide × 4.8 cm deep × 1.1 cm tall (1.6 cm to the top of the padlock); origin at the
  stone's underside centre; **front faces +Z** (toward the player). Set it on a `PlaqueSpot` with
  no further transform.

## Nodes

| Node | What |
|---|---|
| `Plaque` | the stone and everything on it; the `Unlock` hop moves this |
| `PlaqueStone` | the flat stone |
| `FaceRim` | a thin dark border around the face |
| `PlaqueFace` | a cream quad lying on the stone's flat top, 3.1 × 2.3 cm, **UV 0..1 across it** (u left→right, v from the player's side to the back): draw the icon and price here (a 256 px canvas texture on a cloned `PlaqueFace` material). Keep the back fifth clear while locked: the padlock lies there |
| `Staple` | the brass staple at the back edge |
| `Padlock` → `PadlockBody`, `Shackle` | the padlock lying on the face's back edge; `Shackle` pivots |
| `Grip` | the pinch point, just above the stone's centre (0, 0.013, 0.003) |

## Clips

| Clip | Length | Use |
|---|---|---|
| `Locked` | 3 s loop | the stone is still; the padlock rocks a little on its staple |
| `Unlock` | 0.8 s, play once | the shackle pops open, the padlock flips off toward the player and shrinks away, the stone gives a little hop |
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
