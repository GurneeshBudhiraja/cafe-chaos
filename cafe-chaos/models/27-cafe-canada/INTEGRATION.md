# cafe-canada — the Canadian winter café (Hoser's · Coffee & Donuts)

**File:** `cafe-canada.glb` — about 19,600 triangles, 135 meshes, 28 flat materials (no textures),
one 2 s `Ambient` clip (the chimney's smoke puffs rise, the bonfire's flames flicker), 0.7 MB.
Built by `cafe_canada_build.py` in a background Blender (nothing lives in a .blend); run it again to
change anything, then `node merge_anims.mjs cafe-canada.glb` (Blender exports a clip per animated
object; the game plays one named `Ambient`). The plan and the notes it answers:
`../../game/docs/CANADA-PLAN.md`.

## What it is

A bright winter day. A log cabin on the left half of the plate with its counter along the back
wall; a snow-dusted deck (the patio) on the right half between the cabin door and the gate; a frozen
lake with a dock and a red canoe front right; a stone bonfire ring front left; snowy spruces at the
corners; string lights over the deck; the gate arch with the hanging sign where the queue forms.
Flat pastel materials with the game's one sun: nothing glows but the string lights, the heater and
the fire, and only a little (it is daytime). No walls glow, no dimming is meant for this café.

- **Base:** the same 92 × 62 cm plate as `cafe-shell`, origin at the centre of its underside; snow
  on top at y 0.024 (the same height as the cabin floor and the deck: all walked).
- **Cabin:** logs (stacked cylinders) x −0.42 … 0.04, z −0.27 … 0.16; the back and left walls full
  height (0.155), the front and right walls knee high (4 logs) so every table shows from the seat;
  the door gap in the right wall at z −0.02 … 0.08. A 2 × 2 window in the left wall with green
  shutters; two wall sockets inside under it (`Socket-1/2`). A snow-capped eave over the counter
  only (the tables are open to the hand), icicles under it, a chimney with smoke; the cream gable
  above with the red oval sign.
- **Counter** (the baristas' zone, as in the Japanese café): red front with cream panels, cream top
  at y 0.085, from x −0.41 to 0.03, front face z −0.16; the duckboard behind at y 0.036
  (`BaristaSpot-1/2/3` at x −0.235, −0.115, 0.005, z −0.204, matching `routes.ts`); the back bar
  with two coffee urns, stacked cups with red lids, syrup bottles, a red tin, mugs; the chalk menu
  board (2x2 COFFEE 2, SNOWBITS 3, BEAVER TAIL 4, MAPLE LATTE 3); the donut case and the till at
  the right end, a PICK UP tag for takeaway.
- **Deck:** x 0.06 … 0.40, z −0.12 … 0.17, planks with snow at the edges; a back rail; three light
  poles with two sagging strings of bulbs; a patio heater at (0.235, 0.0); the musician's round
  stage at the back (0.30, −0.21) under a red scalloped awning with snow.
- **Lake:** ice x 0.12 … 0.46, z 0.20 … 0.31 at y 0.022 with a deeper skating patch and cracks; the
  dock out from the deck (x 0.22 … 0.30, z 0.18 … 0.29, top y 0.030) on four posts; the red canoe
  beside it (0.385, 0.245) with snow and two paddles; a tiny hockey net, stick and puck.
- **Bonfire:** a ring of eleven stones at (−0.27, 0.245), logs, three flame cones and a core; a
  woodpile against the cabin's front; dark stepping slabs from the door round to the fire.
- **Gate:** the arch at x 0.42, z −0.02 … 0.13, snow on its beam, the sign hanging in it (readable
  from both sides); the red mailbox by it; snowbanks along the plate's back edge.

## Numbers the game needs

| Thing | Value |
|---|---|
| Root node | `cafe-canada` |
| glTF extras on the root | `cafe_model: true`, `cafe_style: "canada"`, `front_edge_z_m: 0.16`, `back_edge_z_m: -0.27`, `floor_top_y_m: 0.024`, `window_side: "-x"`, `entrance_side: "+x"` |
| Plate footprint | 0.92 × 0.62 m; the trees stay inside it |
| Floor / snow / deck top | y = 0.024; dock 0.030; stage 0.035; duckboard 0.036 (all under the walk grid's 1.35 cm step) |
| Tallest point | the gable's snow, y ≈ 0.283 (under the Japanese cherry tree's 0.405) |
| Transparent materials | `Glass` (window, donut case), `Smoke` |
| Emissive | `Fire`, `FireCore`, `Bulb` (the heater's glow shares `Bulb`) |

**Axes:** +Y up, the player toward +Z, the entrance on +X, as `cafe-shell`.

## Anchors (empties under the root; game space)

| Anchor | Where | For |
|---|---|---|
| `Entrance` | (0.39, 0.024, 0.055), facing −X | the gate opening; the queue forms outside the right edge as now |
| `FloorTop` | (0, 0.024, 0) | the walk grid's floor sample |
| `BaristaSpot-1/2/3` | (−0.235 / −0.115 / 0.005, 0.036, −0.204) | the three stations behind the counter |
| `TakeawaySpot` | (0.0, 0.024, −0.125), facing −Z | where a takeaway guest stands at the counter's right end |
| `TableSpot-1/2/3` | (−0.33, −0.10), (−0.33, 0.06), (−0.17, −0.03) | the cabin's tables: two by the window sockets, one in the middle |
| `Socket-1/2` | the left wall at z −0.10 and 0.06, y 0.052 | the `socket` wish: met at TableSpot-1 and 2 |
| `PatioSpot-1/2` | (0.16, 0.08), (0.31, 0.06) | the deck's tables: `patio` and `outside` |
| `DockSpot` | (0.26, 0.030, 0.25) | the dock bench: `lake`, `outside` |
| `FireSpot-1/2/3` | round the ring at radius 8.5 cm | the Muskoka chairs: `bonfire`, `outside` |
| `MusicianSpot` | (0.30, 0.035, −0.21), facing −Z | the violinist once bought; seats within earshot meet `music` |
| `BenchSpot` | (0.235, 0.024, 0.165) | kept for compatibility (unused: the queue stands outside) |

## Walkways

From the gate (x 0.39) across the deck to the cabin door (x 0.04, z 0.03); from the door round the
cabin's front corner to the bonfire (the stepping slabs); from the deck onto the dock. The lake's ice
is at walking height: a guest who crosses it is no harm (cute, even), but a path over it is 2 mm
below the snow, so the grid's nearest-walkable logic treats it as floor.

## Still to come (see the plan)

Phase 2: the furniture pieces (`table-ca-2`, `table-ca-4`, `patio-table`, `dock-bench`,
`fire-chair`) and the musician's stand. Phase 3: the Canadian guests, baristas, janitors and the
violinist. Phase 4 (game): the café picker, the new wishes (`socket`, `outside`, `takeaway`, `lake`,
`patio`, `bonfire`), the musician purchase, no passthrough dimming here.
