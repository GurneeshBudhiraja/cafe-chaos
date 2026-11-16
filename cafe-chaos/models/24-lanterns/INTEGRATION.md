# `queue-lanterns` — the lantern string for the queue

Six small paper lanterns on a sagging string between two bamboo poles, 32 cm long, to stand
along the queue outside the door (on the deck/table to the café's right, about x 0.43 … 0.75 at
z 0). Emissive paper like the gate lamps; no lights in the file.

- File: `queue-lanterns.glb`, 1,640 triangles, 2 materials (`CafeBarPalette`, `CafeLanternPaper`), 370 KB.
- Size: 32 cm long (x) × 9.5 cm tall × 2.2 cm deep. **Origin at the left pole's foot**; the string
  runs along +X, so place it at the queue's start and it reaches along the line.

## Nodes

`queue-lanterns` → `Poles`, `String`, `Lantern-1 … 6` (each a node at its hanging point with
`-Paper` and `-Caps` meshes under it; the lanterns hang 0.6–3.7 cm below the string).

## Clip

`Ambient`, 2.5 s loop: each lantern swings a little about the string, out of step with its
neighbours. Play it and leave it running.

## Blender

Scene `LanternArt`, script `lanterns_build.py`.
