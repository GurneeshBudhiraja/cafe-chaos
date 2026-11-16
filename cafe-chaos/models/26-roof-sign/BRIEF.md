# `roof-sign`: the café's scoreboard, a signboard standing on the roof

See `sketch.png` (left: where it goes, seen from the player's seat; right:
the board up close).

## Short prompt (for a text-to-3D tool)

> A small Japanese shop signboard (kanban) for a cozy low-poly miniature
> café, standing on two short wooden posts. Dark walnut timber frame with
> a thin lighter inner border, a tiny gabled roof cap of dark grey clay
> tiles on top. The board face is a flat, plain dark-brown panel (left
> blank, text is added later). Along the bottom of the face, a horizontal
> glass capsule tube with brass end caps, divided into ten equal glass
> segments, with a round brass medallion at its left end. Soft, rounded,
> hand-made look, matte materials, no text, no logos. Front view and
> three-quarter view, plain background.

## Full brief (for Blender, matching the other models in this folder)

**What it is.** The café's scoreboard, made part of the model: a kanban
standing on the ridge of the back roof, facing the player, tilted back
about 10° so it reads from a seat in front and a little above. The game
draws the clock, the coins and the staff on its face, and lights the
happiness tube segment by segment. It is read, never pressed: Hire and
Pause stay on the side board within reach.

**Size and place** (metres, the café's own space; the same units as
`cafe-shell.glb`):
- Board face: 24 cm wide × 11 cm tall. Frame 1 cm deep, 1 cm border.
- Roof cap: 28 cm wide, 3 cm tall at the ridge, overhanging the frame by
  2 cm each side.
- Two posts, 1.2 cm square, from the roof tiles to the board's underside:
  about 3 cm showing.
- Origin at the centre between the post feet. The game places it at
  x 0, y 0.255 (the top of `RoofTiles`), z −0.22, so the board stands over
  the back roof and clears the counter's lanterns. **Front faces +Z.**
- Whole thing about 18 cm tall: its top stays below the cherry tree's
  canopy (y 0.405).

**Nodes** (names matter: the game finds them):

| Node | What |
|---|---|
| `RoofSign` | the root; the game sets its place and tilt |
| `SignPosts` | the two posts |
| `SignFrame` | the walnut frame and its thin lighter inner border |
| `SignCap` | the little tiled roof on top |
| `SignFace` | a flat panel inside the frame, **UV 0..1 across it** (u left→right, v bottom→top). Plain dark brown (#2e2420), low contrast: the game draws on a canvas over it. Keep the bottom 30 % clear: the tube sits there |
| `HappyTube` | the glass capsule along the bottom of the face, 19 cm long, 1.6 cm thick, set 0.4 cm proud of the face |
| `HappyTube/TubeSeg-01` … `TubeSeg-10` | ten separate equal segments inside the glass, left to right, **each its own mesh** with the same material `TubeLight` (white, the game tints and lights each one) |
| `HappyTube/TubeGlass` | the clear glass shell over the segments, with thin dividers between them |
| `HappyTube/TubeCaps` | brass end caps |
| `HappyFace` | a round brass medallion, 2.2 cm across, at the tube's left end, with a cream disc (`HappyFaceDisc`, UV 0..1) the game draws the face on |

**Materials.** Reuse the shell's by name so the game shares them:
`CafeBarPalette` for the timber and brass, `CafeStone` for the roof cap.
New: `SignFace` (dark brown, matte), `TubeLight` (white, unlit-friendly,
the game sets its colour and glow), `TubeGlass` (clear, slightly warm,
low roughness, about 25 % opaque).

**Budget.** About 1,500 triangles, 4 materials beyond the shared ones,
under 300 KB.

**Clips** (optional): `Idle`, a 4 s loop in which the board sways a
millimetre on its posts; `Bump`, 0.4 s, a little hop the game plays when
a new record is set.

**Deliver** `roof-sign.glb` in this folder, with an `INTEGRATION.md` like
the others, and front and three-quarter previews in `previews/`.
