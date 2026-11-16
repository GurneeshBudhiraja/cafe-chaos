# `cafe-annex` — the garden annex (left wing)

A wing that grows off the café's left side when it is unlocked: a small shoji room with its own
garden edge, pond and fence. Built in the shell's own space, so **place it at (0, 0, 0) in the
shell's frame** and it lines up: its plate butts the main plate at x = −0.46, its floor runs to
the main room's floor edge at x = −0.34 and meets it through `WallLeft-Open`.

- File: `cafe-annex.glb`, 1.8 MB (the shell's textures are packed again), ~8,200 triangles
  (3,200 of them the pressed mark), 17 meshes, 16 materials — **all the shell's own** (`CafeWalnut`, `CafeFloorPlanks`, `CafeTimber`,
  `CafeShoji`, `CafeRoofTile`, `CafeBamboo`, `CafeMoss`/`CafeMossBright`/`CafeMossDark`,
  `CafeWater`, `CafeKoi`, `CafeLily`, `CafeStone`, `CafeGravel`, `CafeAOSkirt`), so with material
  de-duplication by name it adds no new textures.
- Footprint: x −0.68 … −0.46 (the new plate), plus its floor over the left garden strip
  x −0.46 … −0.34; z −0.31 … 0.31 (the full plate depth). Plate thickness and garden height match
  the shell (ground y = 0.0225, floor y = 0.024). Roof to y ≈ 0.25.
- The room: interior x −0.64 … −0.34, z −0.25 … 0.19, open along the front (+Z) like the main
  room; the outer (−X) wall has **its own exit** at the front end (clear opening z 0.041 … 0.189,
  15 cm, framed, with an 出口 / EXIT blade sign outside and stepping stones to the plate's edge
  through a gap in the fence) and a shoji window further back; shoji wall at the back, eaves and
  tile roof over the back half continuing the main roof, an engawa lip along the front.
- Garden: gravel strips, moss beds on the outer edge, a grass bed in the wing's front strip with
  the Meta mark pressed into it (by the player), a pond with stones, koi and lilies on the front
  outer corner, and a bamboo fence along the outer edge and the front and back.

So with the annex in place the way out is longer: through `WallLeft-Open` (x −0.34), across the
annex floor, out through the annex exit (x −0.65, z 0.04 … 0.19) and off the plate at x −0.68.

## When the annex is placed

Hide the shell's **`GardenLeft`** group (the annex floor covers it) and show **`WallLeft-Open`**
instead of `WallLeft-Closed`. Guests reach the annex floor through the opening at
z −0.075 … 0.087 (16 cm wide) in the left wall.

## Anchors

| Name | Position (shell space, x, y, z) | For |
|---|---|---|
| `AnnexSpot-1` | (−0.565, 0.024, −0.045) | by the window in the outer wall; fits `window-booth` (12.2 × 8.4 cm, benches front-to-back) |
| `AnnexSpot-2` | (−0.425, 0.024, −0.155) | toward the back, near the opening; fits `table-big` (12.6 × 10.5 cm) |
| `AnnexSpot-3` | (−0.57, 0.024, −0.17) | back outer corner; fits `table-big` or the booth |

Spots 2 and 3 side by side both take a big table (their footprints clear each other by 1 cm).
Keep the strip z −0.075 … 0.087 beside the opening, and the lane from there to the annex exit (z 0.04 … 0.19 along the outer wall), clear for the walkway.

## Blender

`cafe-shell-art.blend`, scene `AnnexArt` (`PREVIEW-shell` there is an instance of the shell for
fitting); script `annex_build.py` (text block). Rebuild with `build_annex(ss, ml)` after running
`shell_split.py` and `meta_logo.py`.
