# cafe-canada — the Canadian winter café (Hoser's · Coffee & Donuts)

**File:** `cafe-canada.glb` — about 19,600 triangles, 135 meshes, 29 materials, 6.5 MB (5 MB of
it textures: 18 tiling colour maps, 14 normal maps, one 2048 px occlusion atlas), one 2 s `Ambient`
clip (the chimney's smoke puffs rise, the bonfire's flames flicker). Built by `cafe_canada_build.py`
in a background Blender (nothing lives in a .blend); run it again to change anything, then
`node merge_anims.mjs cafe-canada.glb` (Blender exports a clip per animated object; the game plays
one named `Ambient`). The plan and the notes it answers: `../../game/docs/CANADA-PLAN.md`.

## Textures and baked occlusion (the realism pass)

Everything is still built from flat-colour parts; `textures.py` (exec'd by the shell and furniture
scripts after their palettes) turns the palette into textured materials and gives every part UVs:

- **Colour maps** are generated with numpy, tileable, 256–1024 px, one per material: log wood
  with grain and knots (`Pine`, `PineDark`), plank floor and weathered deck (`PlankFloor`, `Deck`),
  soft blue-shaded snow with sparkle (`Snow`, `SnowShade`), cracked lake ice (`Ice`, `IceDeep`),
  cobbles (`Stone`, `StoneDark`), bark, spruce needles with snow, worn red and cream paint (the
  cream has clapboard lines), chalkboard, plaid, cushion weave, brushed steel, the plate's edge.
- **Normal maps** from the same height fields for the woods, planks, stone, snow, ice, bark and
  the clapboard (none for flat paint, fabric, needles).
- **UVs** are a world-space box projection in metres over the material's tile size (`u` always a
  horizontal axis, so grain runs along the logs and planks), so no part needed unwrapping.
- **Occlusion:** `bake_ao.py` gives every mesh a second UV set (`Lightmap`, smart-projected and
  packed together), bakes Cycles ambient occlusion (ray distance 6 cm, 32 samples) into one
  2048 px atlas, and wires it as the glTF `occlusionTexture` on `texCoord 1`. three.js puts that on
  `aoMap`, which the game's Lambert swap keeps, so the log joins, the underside of the eave and
  the counter, the stones and the tree bases get contact shading with no run-time cost beyond one
  texture read. Each furniture file carries its own 512 px atlas the same way (`AO_RES` in
  `pieces_build.py`); their textures are capped at 256 px (`TEX_MAX`) because every file carries
  its own copies.
- What reaches the headset: colour + normal + occlusion on matte materials (the Lambert twin in
  `light/cheap-materials.ts` keeps `map`, `normalMap`, `aoMap`); roughness/metal maps would be
  dropped, so none are made. Transparent and emissive materials (`Glass`, `Smoke`, `Fire`,
  `FireCore`, `Bulb`) are left flat and get no occlusion.
- Review it the way the Quest shades it: `previews/` has Blender renders; the glbs were also
  checked in a plain three.js page with the same Lambert swap and one sun (`viewer.html`, serve the folder and open `?m=<file>.glb`; screenshots `previews/threejs-*.jpg`, the ones in the
  phase 3b message). Textures here are PNG; if download size matters later, KTX2/Basis them in
  the game's pipeline rather than here.

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

## The furniture (phase 2): `pieces_build.py`

Five pieces, each its own glb (the game places them by the layout, `game/src/cafe/canada-layout.ts`),
with the Japanese pieces' conventions: origin at the bottom centre, the front toward +Z, `Seat-N` at
the seat top (1.6 cm) with its +Z toward the table, `Meal-N` on the table top (2.8 cm), `TableTop`.
Materials from `kit.py`, textured by `textures.py` with a 512 px occlusion atlas each; 250–510 triangles, 0.4–0.8 MB each.

| File | What | Size (w × h × d, cm) | Seats | Where it stands |
|---|---|---|---|---|
| `table-ca-2.glb` | square maple table on a pedestal, two slat-back chairs with red cushions, a napkin holder | 9.3 × 3.9 × 4.2 | 1–2 (chairs at x ±3.3) | the cabin's window wall, `TableSpot-1/2` (under the sockets) |
| `table-ca-4.glb` | long maple table, a plaid-cushioned bench either side, a candle | 7.0 × 3.8 × 10.3 | 1–2 front bench, 3–4 back | the cabin's middle, `TableSpot-3`, turned 90° |
| `patio-table.glb` | red steel bistro table with snow on it, two red bistro chairs | 9.0 × 3.7 × 4.4 | 1–2 | the deck, `PatioSpot-1/2` |
| `dock-bench.glb` | pine bench for two facing +Z (the lake and the player), plaid cushion, snow on its back, a mug shelf on each arm (the meal spots) | 8.7 × 4.0 × 2.6 | 1–2 | the dock, `DockSpot` (y 0.030) |
| `fire-chair.glb` | red Muskoka chair with a log stump beside it (the meal spot), snow on both | 5.7 × 4.7 × 3.5 | 1 | round the fire, `FireSpot-1/2/3`, each turned to face it |

## The characters (phase 3): `staff_canada_build.py`, `guests_canada_build.py`

Both scripts exec the Japanese characters' build scripts from `base/` (copies of the ones that made
`barista-*.glb`, `guest-*.glb` and `accessories.glb`) and add looks, species and clothes on top, so
**every node name, attach point, anchor and clip the game already uses is the same**. Several
characters are built in one scene, so run `python3 fix_names.py <glbs>` after an export: it strips
Blender's `.001` name suffixes (the scripts' outputs here were run through it). Renders in `previews/`
(`staff-lineup`, `staff-janitor-wipe`, `staff-fiddler-play`, `guests-lineup`, `guests-seated`,
`guests-dressed`, `guests-dressed-2`, `guests-walk`).

### Staff (`barista-<name>.glb`, the barista rig: Rig, Body, Head, Blink, Arm-L/R, Leg-L/R, Tray, Guitar, Hand-L/R)

All six have the Japanese staff's eight clips (Idle, Work, Wave, Bow, Walk, Carry, Serve, Strum).
One 64 px skin each, 108–216 triangles, 46–61 KB.

| File | Who | Look | Extra nodes / clips |
|---|---|---|---|
| `barista-maple.glb` | barista 1 | brown hair, red cap with a cream brim, cream shirt, red apron, denim | |
| `barista-aspen.glb` | barista 2 | blonde bun with a red tie, cream shirt, red apron, white shoes | |
| `barista-rowan.glb` | barista 3 | dark skin, black hair, cream toque with a red pompom, red apron | `Toque` (on the head) |
| `barista-birch.glb` | janitor (open from the start) | red lumberjack plaid, dark overalls with a brass button, spruce toque | `Toque`, `Shovel` (on the back), `Cloth` (right hand), `Bucket` (beside, as the Japanese janitor: show it while cleaning); clip `Wipe` (2 s) |
| `barista-cedar.glb` | janitor (to unlock) | green plaid, dark overalls, red toque band as earmuffs | `Earmuffs`, `Shovel`, `Cloth`, `Bucket`; clip `Wipe` |
| `barista-fiddler.glb` | the violinist (purchasable) | cream quilted parka with a red zip, denim, red-and-cream toque | `Violin` (under the chin, on the body), `Bow` (in the right hand, so it saws); clip `Play` (2 s loop: bow arm sawing at chin height, a sway, a lean onto the chin rest) |

The game plays the fiddler's `Play` where it plays the Japanese musician's `Strum`; the `Strum`
clip is still there (the guitar hand pose) if ever needed. The root extra `barista` holds the name.

### Guests (`guest-<species>.glb`, the guest rig, 10 clips, St-/Se- poses, attach points HeadTop/Face/Neck/Chest/Guitar)

| File | Species (`guest_type`) | Shape | Signature accent node | Size (w × h × d) | Tris / pose |
|---|---|---|---|---|---|
| `guest-snowbit.glb` | `snowbit` | round donut hole, golden with a pale seam and sugar | `Snowcap` (powdered sugar on the crown) | 3.9 × 5.8 × 3.5 cm | 4,136 |
| `guest-beavertail.glb` | `beavertail` | tall flat oval of fried dough, cinnamon-sugar | `MapleLeaf` (red leaf with a stem, lying over the crown) | 4.3 × 7.0 × 2.4 cm | 4,016 |
| `guest-nanaimo.glb` | `nanaimo` | square bar: chocolate top, custard, coconut crumb | `Curl` (two chocolate curls) | 4.0 × 5.6 × 3.4 cm | 3,884 |

**Colours:** unlike the Japanese guests these ship in their real colours (the three layers of the
nanaimo cannot be a tint). Give them a white tint, or at most a very light pastel (≥ 0.9 per
channel), or skip tinting for Canadian species. Everything else is as `../11-guest/INTEGRATION.md`
(materials `GuestSkin-<species>` plus the flat face materials; new flat materials `GuestSugar`,
`GuestMapleLeaf`, `GuestChoc`).

### Wardrobe (`accessories-canada.glb`, 12 items, 273 KB, one 258 px atlas `GuestAccessoryAtlasCanada`)

Each item's origin is its attach point and its `attach` extra names it, exactly as `accessories.glb`,
so `actor.ts`'s `dress()` works on it unchanged once it loads this file for Canadian guests.

| Item | Attach | What |
|---|---|---|
| `Toque-<species>` | `HeadTop` | red knit cap fitted to the head, cream folded band and pompom |
| `Earmuffs-<species>` | `HeadTop` | red muffs at the ears on a dark band over the head |
| `Scarf-<species>` | `Neck` | red knit scarf wound round the neck, a tail with a cream fringe down the front |
| `Parka-<species>` | `Chest` | cream quilted parka to just under the mouth, fur collar, red zip, two red pockets |

Suggested wardrobe (cast.ts): HeadTop `Toque-{s}` / `Earmuffs-{s}` (chance 0.6), Neck `Scarf-{s}`
(0.35), Chest `Parka-{s}` (0.4), still at most two items each. Toque + Scarf and Earmuffs + Parka
are the combinations in the previews. The Japanese items (ChefHat, Beret, Glasses, Bow) fit these
bodies too if ever wanted; the per-species ones (Hachimaki, Apron, Vest) do not exist for them.

## Still to come (see the plan)

Phase 4 (game): the café picker, registering these files in `assets.ts`, the Canadian layout
(`canada-layout.ts`), the new wishes (`socket`, `outside`, `takeaway`, `lake`, `patio`, `bonfire`),
the musician purchase (the fiddler at `MusicianSpot`), the second janitor as a Shop row, no
passthrough dimming here.
