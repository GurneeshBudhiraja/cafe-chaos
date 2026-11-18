# cafe-canada — the Canadian winter café (Hoser's · Coffee & Donuts)

**File:** `cafe-canada.glb` — about 33,800 triangles (8,000 of them the two mountain ranges, 3,000 the
flames), 213 meshes, 38 materials, 4.1 MB (JPEG textures: 19 colour maps, 15 normal maps, one 2048 px
occlusion atlas), one 2 s `Ambient`
clip (the chimney's smoke rises as one soft wisp of five overlapping puffs that swell and shrink away, the bonfire's and the hearth's flames flicker, white water runs
down the waterfall and foams at its foot). Built by `cafe_canada_build.py`
in a background Blender (nothing lives in a .blend); run it again to change anything, then
`node merge_anims.mjs cafe-canada.glb` (Blender exports a clip per animated object; the game plays
one named `Ambient`). The plan and the notes it answers: `../../game/docs/CANADA-PLAN.md`.

## Textures and baked occlusion (the realism pass)

Everything is still built from flat-colour parts; `textures.py` (exec'd by the shell and furniture
scripts after their palettes) turns the palette into textured materials and gives every part UVs:

- **Colour maps** are generated with numpy, tileable, 256–1024 px, one per material: log wood
  with grain and knots (`Pine`, `PineDark`), plank floor and weathered deck (`PlankFloor`, `Deck`),
  soft blue-shaded snow with sparkle (`Snow`, `SnowShade`), cracked lake ice (`Ice`, `IceDeep`),
  fieldstone (`Stone`, `StoneDark`: varied warm and cool stones, domed, in recessed sandy mortar), bark, spruce needles with snow, worn red and cream paint (the
  cream has clapboard lines), chalkboard, plaid, cushion weave, brushed steel, the plate's edge.
- **Normal maps** from the same height fields for the woods, planks, stone, snow, ice, bark and
  the clapboard (none for flat paint, fabric, needles).
- **UVs** are a world-space box projection in metres over the material's tile size (`u` always a
  horizontal axis, so grain runs along the logs and planks), so no part needed unwrapping.
- **Occlusion:** `bake_ao.py` gives every mesh a second UV set (`Lightmap`, smart-projected and
  packed together), bakes Cycles ambient occlusion (ray distance 6 cm, 32 samples) into one
  2048 px atlas, and wires it as the glTF `occlusionTexture` on `texCoord 1`. three.js puts that on
  `aoMap`, which the game's Lambert swap keeps, so the log joins, the underside of the upper deck and
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
  phase 3b message). The shell exports its textures as JPEG (quality 90): a third of the PNGs'
  download with no visible loss at this size; KTX2/Basis in the game's pipeline would cut GPU memory
  further.

## What it is

A bright winter day under the Rockies. A log cabin on the left half of the plate with its counter
along the back wall and a fireplace inside; over the counter, an open upper deck (the rooftop patio)
with four tables and a piano, reached by stairs outside the cabin's right wall; a snow-dusted deck
(the patio) on the right half between the cabin door and the gate; a frozen lake with a dock and a
red canoe front right; a stone bonfire ring front left; snowy spruces at the corners; string lights
over both decks; the gate arch with the hanging sign where the queue forms; a mountain range with a
waterfall along the back.
Flat pastel materials with the game's one sun: nothing glows but the string lights, the heater and
the fire, and only a little (it is daytime). No walls glow, no dimming is meant for this café.

- **Base:** the same 92 × 62 cm plate as `cafe-shell`, origin at the centre of its underside; snow
  on top at y 0.024 (the same height as the cabin floor and the deck: all walked).
- **Cabin:** logs (stacked cylinders) x −0.42 … 0.04, z −0.27 … 0.16; the back and left walls nine
  logs high (0.125, top y 0.149: just over the baristas' heads, so the upper deck sits on them), the
  front and right walls knee high (4 logs) so every table shows from the seat; the door gap in the
  right wall at z −0.02 … 0.08 (an open gap in the knee-high wall: no frame, no lintel, its posts as high as the wall). A 2 × 2 window in the left wall with green shutters; two wall
  sockets inside (`Socket-1` under the window at z −0.05, `Socket-2` at z 0.09). No roof over the
  tables: the room is open to the hand from above. The tables stand in a grid: three columns 14 cm
  apart (x −0.31 window, −0.17 middle, −0.03 door side) and two rows at z −0.05 and 0.09, either side of the room's middle (0.02, between the
  counter's front and the front wall), which is also the fireplace's; the window and door
  columns are tables for two, the middle the long table for four turned 90° on the room's axis, with
  a 4.2 cm aisle either side of it.
- **Fireplace** (inside, the left wall at z 0.02 (the room's middle, framed by the window tables), between the window and the second window table,
  where the front half wall does not hide it from the player): a river-stone surround (the fieldstone
  texture: varied warm and cool stones, domed, in recessed sandy mortar) with a dark lintel and
  keystone over the opening; a raised flagstone hearth; a sooty firebox with cast-iron andirons, two
  logs with glowing ends on a bed of embers, and a fire of shaped flame tongues (an orange flame round
  a yellow core, swelling at the foot, licking to a curled tip; they flicker in the `Ambient` clip);
  a heavy pine beam mantel on two corbels with a spruce garland and red berries, two mugs and two
  hung stockings; the chimney breast narrowing at a shoulder into the stack, which stands 5.8 cm over
  the wall top with a cap, a clay pot, snow and smoke (five small puffs born inside the pot, a fifth of a
  loop apart, overlapping into one column that leans downwind; each swells as it rises 4.2 cm and
  shrinks to nothing at the top, since a glTF clip cannot fade alpha); a fire-tool stand; a plaid rug.
  `FireplaceSpot`. The tables either side are the warm seats.
- **Counter** (the baristas' zone, as in the Japanese café): red front with cream panels, cream top
  at y 0.085, from x −0.355 to 0.03, front face z −0.115 (4.5 cm further forward than at first, for a deeper barista zone), leaving a **4.8 cm way out at its left end**
  (x −0.413 … −0.365) for the baristas (it used to run wall to wall, which would have shut them in);
  the duckboard behind at y 0.036 (`BaristaSpot-1/2/3` at x −0.235, −0.115, 0.005, z −0.159,
  matching `routes.ts`); the back bar with two coffee urns, stacked cups with red lids, syrup
  bottles, a red tin, mugs (all under 0.137, below the upper deck); the donut case and the till at
  the right end, a PICK UP tag for takeaway. The chalk menu board (2x2 COFFEE 2, SNOWBITS 3, BEAVER
  TAIL 4, MAPLE LATTE 3) hangs from the upper deck's front edge between the first two stations (the
  back wall under the deck is out of the player's sight).
- **Upper deck** (the rooftop patio): a pine deck over the counter and the back bar, x −0.425 …
  0.04, z −0.275 … −0.090 (18.5 cm deep), top **y 0.1548** (2.6 cm over the tallest barista's toque), on the back
  and side walls and two slim posts at its front edge (x −0.175, between the first two stations, and
  x 0.034). Open to the sky, so its seats are reached from above like the rest; the lower floor's
  seats stay in front of it, open too (nothing roofs a seat). A 2.2 cm rail round it (low: seated
  guests show over it and a hand reaches over it), snow on the rail, icicles under its front edge
  (kept clear of the three stations), string lights on two poles well above the seated guests' heads.
  The rooftop sign (the cream board, the red oval, Hoser's / COFFEE & DONUTS) stands at its back on
  two legs, 7 cm up so neither the seated guests nor the pianist hide it. Four bistro tables stand on it in
  two columns either side of the piano (`UpperSpot-1/2` at the back, `3/4` in front, from the layout),
  the middle left open so the player sees the pianist and the logo; the aisle between the rows is in
  line with the landing.
- **Rooftop piano:** a low console piano (4.4 cm) centred under the rooftop logo (x −0.17), its back to
  the player at z −0.205 and its keys toward the sign; a red runner and a mug on top; the bench behind
  it on the sign side (`PianoSpot`), so the pianist plays facing the player, face over the piano and
  the logo over the pianist's head (the seated pianist's bun reaches y 0.235, under the words).
- **Stairs:** outside the cabin's right wall, from the patio by the door up to a landing level with
  the upper deck: 15 open treads of 9 mm, 8.7 mm up each (under the walk grid's 1.35 cm step, about
  a guest stride each), x 0.050 … 0.112 (6.2 cm wide: a guest with room either side), climbing away
  from the player from z −0.012 to −0.147; stringers both sides, a handrail on the patio side. The
  landing (x 0.04 … 0.112, z −0.24 … −0.147) joins the deck; its posts stand on the snow behind.
- **Deck:** x 0.06 … 0.40, z −0.12 … 0.17, planks with snow at the edges; a back rail; three light
  poles with two sagging strings of bulbs; a patio heater at (0.235, 0.0).
- **The bear:** behind the deck where the musician's stage stood, at (0.31, −0.205): a low-poly black
  bear (about 8 cm tall) sitting in the snow, legs out in front, holding a red takeaway cup with a white
  lid in both paws under its chin, a little snow on its head, turned 15° toward the player (`Bear`,
  `BearMuzzle`, `BearFace`, `BearBlush`, `BearCup`, `BearCupLid`, `BearHeadSnow`; flat-shaded, about 1,900
  triangles; new flat materials `BearFur`, `BearMuzzle`, `CupLid`). The violinist, once bought, stands on
  the snow at its left (`MusicianSpot`).
- **Lake:** ice x 0.12 … 0.46, z 0.20 … 0.31 at y 0.022 with a deeper skating patch and cracks; the
  dock out from the deck (x 0.22 … 0.30, z 0.18 … 0.29, top y 0.030) on four posts; the red canoe
  beside it (0.385, 0.245) with snow and two paddles; a tiny hockey net, stick and puck.
- **Bonfire:** a ring of eleven river stones at (−0.27, 0.245), logs, a bed of glowing embers and
  five shaped flame tongues (as the fireplace's, larger); a woodpile against the cabin's front; dark
  stepping slabs from the door round to the fire.
- **Exit walkway:** a flagstone path (`ExitWalk`, the fieldstone texture, two or three irregular flat
  stones a row, tops 1.5 mm over the snow) from the deck's front edge by the cabin door (x 0.06, z 0.18)
  straight to the plate's front edge (z 0.30), between the bonfire's snow and the lake. Guests leave the
  café along it; `Exit` marks its foot.
- **Gate:** the arch at x 0.42, z −0.02 … 0.13, snow on its beam, the sign hanging in it (readable
  from both sides); the red mailbox by it; snowbanks along the plate's back edge.
- **The Rockies:** two ranges of real relief along the plate's back edge (a deep bas-relief, z
  −0.309 … −0.280): each is a grid mesh whose ridgeline has uneven shoulders, sub-summits and broken
  crests, whose face comes 1–2 cm toward the player with spurs down from each summit and gullies
  between, so the sun shades it as mountains. One painted 1024 px texture (`Mountains`, both ranges,
  with a normal map for the rock's grain) carries grey rock with faint broken strata, a ragged
  snowline, snow lying in the couloirs below it, rock ribs running downhill through the snow,
  wind-scoured summits, a spruce forest with snow on it at the near range's foot, blue haze on the
  far range, and sun-side shading baked from the relief's own slopes (so the shallow backdrop reads
  deep under the game's one sun at no cost). The tallest peak is about 0.37 up (under the Japanese
  cherry tree's 0.405). A **waterfall** springs from a cleft in the near range (x 0.15), runs down it
  as a ribbon following the rock, wider at its foot (white streaks slide down it and foam churns at
  its foot in the `Ambient` clip), into a pool ringed with stones beside the bear. The ranges skip
  the occlusion bake (they carry their own shading).

## Numbers the game needs

| Thing | Value |
|---|---|
| Root node | `cafe-canada` |
| glTF extras on the root | `cafe_model: true`, `cafe_style: "canada"`, `front_edge_z_m: 0.16`, `back_edge_z_m: -0.27`, `floor_top_y_m: 0.024`, `window_side: "-x"`, `entrance_side: "+x"`, `upper_floor_top_y_m: 0.1548`, `stair_steps: 15`, `stair_rise_m: 0.00872`, `stair_run_m: 0.009` |
| Plate footprint | 0.92 × 0.62 m; the trees stay inside it |
| Floor / snow / deck top | y = 0.024; dock 0.030; duckboard 0.036 (all under the walk grid's 1.35 cm step); **upper deck 0.1548** |
| Tallest point | the far range's highest peak, y ≈ 0.37; the rooftop sign's snow 0.297 (all under the Japanese cherry tree's 0.405) |
| Transparent materials | `Glass` (window, donut case), `Smoke` |
| Emissive | `Fire`, `FireCore`, `Ember`, `Bulb` (the heater's glow shares `Bulb`), `Water` (faintly, so the waterfall reads). The flames are cel-shaded: a 64 px three-tone band map (`toon-Fire`, `toon-FireCore`, nearest-neighbour) as the emissive map at strength 1 and, at a third, as the base colour, on UVs where u is how much a point faces the light and v its height: a dark tone on the shadow side and round the foot, the flame's own tone, a light streak up the lit side (deep red-orange / orange / amber outside, amber / yellow / pale yellow in the core) |

**Axes:** +Y up, the player toward +Z, the entrance on +X, as `cafe-shell`. An anchor's facing is
its +Z; "facing −X" means its +Z points to −X (three.js `rotation.y` of −90°).

## Anchors (empties under the root; game space)

| Anchor | Where | For |
|---|---|---|
| `Entrance` | (0.39, 0.024, 0.055), facing −X | the gate opening; the queue forms outside the right edge as now |
| `FloorTop` | (0, 0.024, 0) | the walk grid's floor sample |
| `BaristaSpot-1/2/3` | (−0.235 / −0.115 / 0.005, 0.036, −0.159) | the three stations behind the counter |
| `TakeawaySpot` | (0.0, 0.024, −0.085), facing −Z | where a takeaway guest stands at the counter's right end (3 cm off its front, clear of `TableSpot-4`) |
| `TableSpot-1/2/3/4/5` | (−0.31, −0.05), (−0.31, 0.09), (−0.17, 0.02), (−0.03, −0.05), (−0.03, 0.09) | the cabin's tables: two by the window-wall sockets (either side of the fireplace), the long one in the middle, two on the door side mirroring the window pair |
| `Socket-1/2` | the left wall at z −0.05 and 0.09, y 0.052 | the `socket` wish: met at TableSpot-1 and 2 |
| `FireplaceSpot` | (−0.383, 0.024, 0.02), facing +X | the hearth: the `warm` wish (TableSpot-1 and 2 are beside it) |
| `UpperFloorTop` | (−0.19, 0.1548, −0.17) | the upper floor's sample (for its own walk grid) |
| `UpperSpot-1/2/3/4` | (−0.32, 0.1548, −0.2225), (−0.03, 0.1548, −0.2225), (−0.32, 0.1548, −0.1375), (−0.03, 0.1548, −0.1375) | the upper deck's four bistro tables, either side of the piano, back row then front: `upstairs`, `outside` |
| `PianoSpot` | (−0.17, 0.1548, −0.261), facing +Z (the keys and the player) | where the pianist sits (barista-pianist.glb, clip `PlayPiano`); seats in earshot meet `music` |
| `StairBottom` | (0.081, 0.024, −0.002), facing −Z | the foot of the stairs, on the patio by the door |
| `StairTop` | (0.081, 0.1548, −0.153), facing −Z | the top: the first spot on the landing |
| `UpperLanding` | (0.076, 0.1548, −0.19), facing −X | on the landing, turned toward the deck |
| `PatioSpot-1/2` | (0.16, 0.08), (0.31, 0.06) | the deck's tables: `patio` and `outside` |
| `DockSpot` | (0.26, 0.030, 0.25) | the dock bench: `lake`, `outside` |
| `FireSpot-1/2/3` | round the ring at radius 8.5 cm, each facing the fire | the Muskoka chairs: `bonfire`, `outside` |
| `MusicianSpot` | (0.205, 0.024, −0.19), facing −Z | the violinist once bought; seats within earshot meet `music` |
| `Exit` | (0.06, 0.024, 0.295), facing +Z | the foot of the exit walkway at the plate's front edge: where guests leave the café (new; the game's `guests/paths.ts` CANADA_EXIT_LANES) |
| `BenchSpot` | (0.235, 0.024, 0.165) | kept for compatibility (unused: the queue stands outside) |

## Walkways

From the gate (x 0.39) across the deck to the cabin door (x 0.04, z 0.03); from the door round the
cabin's front corner to the bonfire (the stepping slabs); from the deck onto the dock; out: from the door
along the doorstep to the deck's front edge and down the exit walkway to `Exit`. The lake's ice
is at walking height: a guest who crosses it is no harm (cute, even), but a path over it is 2 mm
below the snow, so the grid's nearest-walkable logic treats it as floor.

**The counter's way out:** the baristas leave the duckboard at the counter's left end (x −0.413 …
−0.365) and come forward between the counter and the first window table (the window tables stand
2 cm further right than in phase 1 to leave the room).

**The upper floor.** The game's walk grid (`nav/nav-grid.ts`) treats everything above head height
(`top`, 0.1) as overhead, so on the ground floor the upper deck is a ceiling: the baristas walk
under it and its two front posts are thin obstacles. The upper floor needs a second grid of its
own: the same `NavGrid` over the same café with the floor raised (`seed` at `UpperFloorTop`, heights
measured from 0.1548, `top` 0.1548 + 0.1), or simply the two short paths it has (the landing to each
table and to the piano, along z −0.17). Between the floors characters do not path-find: they walk
`StairBottom` → `StairTop` in a straight line, the root rising 8.7 mm for every 9 mm (the slope in
the root extras), playing `StairsUp` / `StairsDown` (guests) or `ClimbUp` / `ClimbDown` /
`CarryUp` / `CarryDown` (staff), then on from `UpperLanding`. Going up is about 7.5 s at the clips'
own pace (two steps a second); play the staff's at 2× to keep service brisk.

## The furniture (phase 2): `pieces_build.py`

Five pieces, each its own glb (the game places them by the layout, `game/src/cafe/canada-layout.ts`),
with the Japanese pieces' conventions: origin at the bottom centre, the front toward +Z, `Seat-N` at
the seat top (1.6 cm) with its +Z toward the table, `Meal-N` on the table top (2.8 cm), `TableTop`.
Materials from `kit.py`, textured by `textures.py` with a 512 px occlusion atlas each; 250–510 triangles, 0.4–0.8 MB each.

| File | What | Size (w × h × d, cm) | Seats | Where it stands |
|---|---|---|---|---|
| `table-ca-2.glb` | square maple table on a pedestal, two slat-back chairs with red cushions, a napkin holder | 9.3 × 3.9 × 4.2 | 1–2 (chairs at x ±3.3) | the cabin's window wall, `TableSpot-1/2` (under the sockets), and the door side, `TableSpot-4/5` |
| `table-ca-4.glb` | long maple table, a plaid-cushioned bench either side, a candle | 7.0 × 3.8 × 10.3 | 1–2 front bench, 3–4 back | the cabin's middle, `TableSpot-3`, turned 90° |
| `patio-table.glb` | red steel bistro table with snow on it, two red bistro chairs | 9.0 × 3.7 × 4.4 | 1–2 | the deck, `PatioSpot-1/2`; and the upper deck, `UpperSpot-1/2/3/4` (y 0.1548) |
| `dock-bench.glb` | pine bench for two facing +Z (the lake and the player), plaid cushion, snow on its back, a mug shelf on each arm (the meal spots) | 8.7 × 4.0 × 2.6 | 1–2 | the dock, `DockSpot` (y 0.030) |
| `fire-chair.glb` | red Muskoka chair with a log stump beside it (the meal spot), snow on both | 5.7 × 4.7 × 3.5 | 1 | round the fire, `FireSpot-1/2/3`, each turned to face it |

## The characters (phase 3): `staff_canada_build.py`, `guests_canada_build.py`

Both scripts exec the Japanese characters' build scripts from `base/` (copies of the ones that made
`barista-*.glb`, `guest-*.glb` and `accessories.glb`) and add looks, species and clothes on top, so
**every node name, attach point, anchor and clip the game already uses is the same**. Several
characters are built in one scene, so run `python3 fix_names.py <glbs>` after an export: it strips
Blender's `.001` name suffixes (the scripts' outputs here were run through it). Renders in `previews/`
(`staff-lineup`, `staff-janitor-wipe`, `staff-fiddler-play`, `staff-pianist-play`, `staff-climb-carry`,
`guests-lineup`, `guests-seated`, `guests-dressed`, `guests-dressed-2`, `guests-walk`,
`guests-stairs-up`, `guests-stairs-down`). The whole café as the game will compose it (the layout's
furniture, guests seated on both floors and on the stairs, a barista carrying a tray up, both
musicians playing, with the game's matte materials) is `compose.html` (serve this folder with the
glbs beside it); its screenshots are `previews/compose-*.jpg`.

### Staff (`barista-<name>.glb`, the barista rig: Rig, Body, Head, Blink, Arm-L/R, Leg-L/R, Tray, Guitar, Hand-L/R)

All seven have the Japanese staff's eight clips (Idle, Work, Wave, Bow, Walk, Carry, Serve, Strum)
and four for the stairs: `ClimbUp`, `ClimbDown` (empty-handed: the lifted leg high going up, reaching
down going down, the body leaning into it and bobbing on each step, the head watching the steps) and
`CarryUp`, `CarryDown` (the same with the tray held out and riding the bob). 1 s, two steps a loop.
One 64 px skin each, 108–228 triangles, 76–93 KB. Every clip carries all three channels of every part it
poses, held still or not (the export keeps constant channels, `export_optimize_animation_keep_anim_object`,
and drops only repeated keys): before, a part that held one pose for a whole clip was left out, so the
pianist played standing with its legs through the bench and the fiddler's neck hand hung at its side.

| File | Who | Look | Extra nodes / clips |
|---|---|---|---|
| `barista-maple.glb` | barista 1 | brown hair, red cap with a cream brim, cream shirt, red apron, denim | |
| `barista-aspen.glb` | barista 2 | blonde bun with a red tie, cream shirt, red apron, white shoes | |
| `barista-rowan.glb` | barista 3 | dark skin, black hair, cream toque with a red pompom, red apron | `Toque` (on the head) |
| `barista-birch.glb` | janitor (open from the start) | red lumberjack plaid, dark overalls with a brass button, spruce toque | `Toque`, `Shovel` (on the back), `Cloth` (right hand), `Bucket` (beside, as the Japanese janitor: show it while cleaning); clip `Wipe` (2 s) |
| `barista-cedar.glb` | janitor (to unlock) | green plaid, dark overalls, red toque band as earmuffs | `Earmuffs`, `Shovel`, `Cloth`, `Bucket`; clip `Wipe` |
| `barista-fiddler.glb` | the violinist (purchasable) | cream quilted parka with a red zip, denim, red-and-cream toque | `Violin` (on the body: on the left shoulder tucked under the chin, the neck reaching forward and out to the left, strings up), `Bow` (in the right hand, so it saws); clip `Play` (2 s loop: the left hand on the violin's neck with a vibrato, the bow arm sawing across the strings at chin height, a sway, a lean onto the chin rest) |
| `barista-pianist.glb` | the pianist (purchasable) | navy cardigan, red bow tie, dark hair in a bun with a red ribbon | clip `PlayPiano` (2 s loop, sitting: the rig lowered 8 mm onto the bench, legs straight out under the keys, hands rising and falling out of step and drifting along the keys, a sway and a nod); place it at `PianoSpot` |

The game plays the fiddler's `Play` where it plays the Japanese musician's `Strum`; the `Strum`
clip is still there (the guitar hand pose) if ever needed. The root extra `barista` holds the name.

### Guests (`guest-<species>.glb`, the guest rig, 12 clips, St-/Se- poses, attach points HeadTop/Face/Neck/Chest/Guitar)

The Japanese guests' ten clips, and `StairsUp` / `StairsDown` (1 s, two steps a loop, on the
standing pose: going up the lifted knee comes high and the foot lands level on the next tread, the
body leans in and bobs, the arms pump; going down the leading foot reaches down while the support
knee bends, the body leans back a touch).

| File | Species (`guest_type`) | Shape | Signature accent node | Size (w × h × d) | Tris / pose |
|---|---|---|---|---|---|
| `guest-snowbit.glb` | `snowbit` | round donut hole, golden with a pale seam and sugar | `Snowcap` (powdered sugar on the crown) | 3.9 × 5.8 × 3.5 cm | 4,136 |
| `guest-beavertail.glb` | `beavertail` | tall flat oval of fried dough, cinnamon-sugar | `MapleLeaf` (red leaf with a stem, lying over the crown) | 4.3 × 7.0 × 2.4 cm | 4,016 |
| `guest-nanaimo.glb` | `nanaimo` | square bar: chocolate top, custard, coconut crumb | `Curl` (two chocolate curls) | 4.0 × 5.6 × 3.4 cm | 3,884 |
| `guest-doubledouble.glb` | `doubledouble` | takeaway coffee cup: cream paper, a red ribbed sleeve with a cream maple leaf low down, the face above it, a white lid with a lip as the top of the head | `Steam` (a sip hole on the lid and a curl of steam rising from it) | 4.7 × 6.5 × 4.1 cm | 4,272 |
| `guest-buttertart.glb` | `buttertart` | squat shortcrust shell crimped into 14 flutes (smooth across the face), browned on the ridges and rim | `Pecan` (the glossy caramel filling level with the rim and a pecan half on it) | 4.8 × 4.4 × 4.2 cm | 4,092 |

The two newest (built on a lathe, `body_revolve` in the script) were chosen for pinch-and-carry: the
cup's lid is a natural handle and reads clearly from above; the tart is wide and low with a dark
caramel top that is easy to spot on a table. `Grip` sits at 4.3 cm (cup) and 3.5 cm (tart) over the
root. Every clip carries all three channels of every part it poses (the export keeps held poses and
drops only repeated keys), so a part one clip leaves still is not left where the previous clip put it;
the guest files are 300–384 KB.

**Colours:** unlike the Japanese guests these ship in their real colours (the three layers of the
nanaimo cannot be a tint). Give them a white tint, or at most a very light pastel (≥ 0.9 per
channel), or skip tinting for Canadian species. Everything else is as `../11-guest/INTEGRATION.md`
(materials `GuestSkin-<species>` plus the flat face materials; new flat materials `GuestSugar`,
`GuestMapleLeaf`, `GuestChoc`, `GuestSteam`, `GuestCaramel`, `GuestPecan`). The game needs the two new
`guest_type` values `doubledouble` and `buttertart` registered (and their files loaded) to use them.

### Wardrobe (`accessories-canada.glb`, 20 items, 384 KB, one 258 px atlas `GuestAccessoryAtlasCanada`)

Each item's origin is its attach point and its `attach` extra names it, exactly as `accessories.glb`,
so `actor.ts`'s `dress()` works on it unchanged once it loads this file for Canadian guests.

| Item | Attach | What |
|---|---|---|
| `Toque-<species>` | `HeadTop` | red knit cap fitted to the head, cream folded band and pompom |
| `Earmuffs-<species>` | `HeadTop` | red muffs at the ears on a dark band over the head |
| `Scarf-<species>` | `Neck` | red knit scarf wound round the neck, a tail with a cream fringe down the front |
| `Parka-<species>` | `Chest` | cream quilted parka to just under the mouth, fur collar, red zip, two red pockets |

Suggested wardrobe (cast.ts), for all five species: HeadTop `Toque-{s}` / `Earmuffs-{s}` (chance 0.6), Neck `Scarf-{s}`
(0.35), Chest `Parka-{s}` (0.4), still at most two items each. Toque + Scarf and Earmuffs + Parka
are the combinations in the previews. The Japanese items (ChefHat, Beret, Glasses, Bow) fit these
bodies too if ever wanted; the per-species ones (Hachimaki, Apron, Vest) do not exist for them.

## Still to come (see the plan)

**Moved in the layout pass of 17 Nov (the game's `canada-layout.ts` and `routes.ts` must follow):**
`BaristaSpot-1/2/3` and `TakeawaySpot` 4.5 cm forward, `TableSpot-1..5`, `Socket-1/2` and `FireplaceSpot` (see the table),
`UpperSpot-1/2` moved and `3/4` new, `PianoSpot` (centred in front of the rooftop sign, now facing +Z), `MusicianSpot` off the removed stage, `Exit` new.

Phase 4 (game): the café picker, the five guest species (snowbit, beavertail, nanaimo, doubledouble, buttertart), registering these files in `assets.ts`, the Canadian layout
(`canada-layout.ts`: 25 seats on two floors, with `TableSpot-4/5`), the upper floor's walk grid and the stair walk (above),
the new wishes (`socket`, `outside`, `takeaway`, `lake`, `patio`, `bonfire`, `warm`, `upstairs`),
the two musician purchases (the fiddler at `MusicianSpot`, the pianist at `PianoSpot`), the second
janitor as a Shop row, no passthrough dimming here.
