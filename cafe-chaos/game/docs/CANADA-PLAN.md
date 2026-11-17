# The Canadian café: plan

The second café, bought with the first one's coins (a fresh start there:
nothing carries over). A bright, snowy, sunny Canadian lakeside coffee
cabin, built for the Quest the way the Japanese garden café was: a diorama
on the player's table, hands only, everything within a seated reach.

Source: the owner's notes of 13 Nov 2026 ("Canadian cafe level design and
progression mechanics"), line by line, and the brief of 17 Nov (bright
sunny day, snow, cute, aesthetic, minimal; different looks for guests,
servers and janitors; the model first, then the characters).

## The notes, item by item, and where each lands

| From the notes | In the café |
|---|---|
| Tim Hortons as the reference; a fictional name (GTA's Burger Shot) | **Hoser's · Coffee & Donuts**: the red oval sign in cream script, red and cream counter, donut case, coffee urns. Reads as the Canadian coffee-and-donut chain at a glance; no trademark (not the name, not "double-double", not "Timbits": the menu says 2×2 Coffee, Snowbits, Beaver Tail, Maple Latte). |
| Inspired by Tim Hortons Seongsu (a Banff cabin: log walls, a red canoe, a lake, cabin booths, snowy summits on the roof) | A log cabin with a snow-capped eave; a frozen lake with a dock and a red canoe; snowy spruces; a snow-dusted deck. |
| Counter area untouched | The counter is along the back wall where the Japanese one is, the baristas' three stations behind it at the same x and z (`routes.ts`), so the staff logic works unchanged. |
| Tables on one side | Inside the cabin, the left half of the plate: 3 tables (two along the window wall with sockets, one in the middle). |
| Patio outside | The snow-dusted deck on the right half, between the cabin door and the gate: 2 patio tables, a patio heater, string lights. |
| **Electric socket** (a laptop guest) | Two wall sockets on the left wall, one over each window-wall table: the `socket` wish is met at those tables. |
| **Outside** | Any seat not inside the cabin (patio, dock, bonfire) meets `outside`. |
| **Takeaway** (straight to the counter, no table) | `TakeawaySpot` anchor inside the door, in front of the counter's right end: a takeaway guest is carried there, waits a moment, pays and leaves. |
| **By the lake / boat** | The dock over the frozen lake, front right, with the red canoe pulled up beside it and a two-seat dock bench: `lake`. |
| **On the patio** | The deck's tables: `patio`. |
| **Near the musician** (violinist, bought) | A small round stage with a snow-capped awning at the back of the deck (`MusicianSpot`); once bought, seats within earshot meet `music` (the Japanese `music` wish, with a violinist instead of a singing guest). |
| **By the bonfire** | A stone fire ring front left, three Muskoka chairs round it, a woodpile: `bonfire`. |
| 3 baristas, 2 janitors (one open, one to unlock), 2–3 tables expandable (4 levels) | Progression stays the game's level system; the shell leaves room for 3 inside + 2 patio + dock + 3 bonfire seats (17 seats), tables bought from the Shop as now. A second janitor is a Shop row. |
| Two-story: deprioritised | Not built (hand tracking cannot reach a lower floor under a roof). |
| Fresh start per café; "coming soon" placeholders (European etc.) | Game side, later: the café picker on the start card. |
| Guests, servers and janitors with different looks | Phase 3: Canadian snack spirits (a Snowbit, a Beaver Tail, a Maple Cookie) in toques and scarves; baristas in red aprons and visors; janitors in plaid with a snow shovel; the violinist in a parka. |
| Bright sunny day, snow, not dark, no dimming | Flat snow with blue-tinted shade, one sun from the game's lighting, no emissive walls; the lamps and string lights glow only a little (it is daytime). The game's passthrough dimming is turned off for this café (game side). |

## Hard constraints (so the game needs no geometry changes)

- Root `cafe-canada`; the same extras keys as `cafe-shell` (`cafe_model`, `front_edge_z_m`, `back_edge_z_m`, `floor_top_y_m`, `entrance_side: "+x"`), plus `cafe_style: "canada"`.
- Plate 0.92 × 0.62 m, origin at the centre of its underside; floor top y = 0.024; +Y up, the player toward +Z, the entrance on +X (the queue forms outside the right edge as now).
- Counter front at z ≈ −0.16, baristas' duckboard at y 0.036 behind it (stations x −0.235, −0.115, 0.005 at z −0.204).
- Open top over every seat (no roof over tables): a hand must drop a guest on any seat from above. The eave covers only the counter.
- Walkable: snow and deck tops at 0.024 (the same as the cabin floor), steps under 1.3 cm; nothing taller than 10 cm except walls, trees, the eave and the gate (the walk grid's `top`).
- Within a seated reach: the farthest seats (bonfire, dock) are at the plate's front, nearest the player; the inside tables are at most 40 cm back.

## Performance budget (Quest 3, WebXR)

The Japanese shell is 35 k triangles and 28 materials, batched to a few dozen draw calls. The Canadian shell aims under 20 k triangles and about 24 flat materials (no large textures: the look is flat pastel with soft shade), one glass material, one ice, three emissive. Snow caps are their own meshes in one `Snow` material. Meta's own figures for Quest 3 are well above this (a few hundred draw calls, around a million triangles); the ceiling that matters here is the WebXR one, draw calls, which the game's static batching handles.

## Phases

1. The shell (this document's layout), with previews from the seat. Review against the notes and Meta's MR guidance (grounding shadows, nothing too close, nothing above the gaze band).
2. The furniture pieces: cabin tables and chairs, patio tables, the dock bench, the fire chairs, the musician's stand; the violinist.
3. The characters: three Canadian guest species with winter accessories; three baristas; two janitors; the musician.
4. Game side (later): the café picker, the new wishes, the takeaway flow, the musician purchase, no dimming.

## Sources

- Tim Hortons Seongsu flagship (Banff cabin theme, red canoe, lake, cabin booths): The Korea Herald, blogTO, Herald Business, 2026.
- Tim Hortons "Welcome Image" redesign (Canadian maple tables, communal seating, heritage art): QSR, NRN, Food Service & Hospitality.
- Meta MR design (shadows to ground objects, lighting consistency with the room, passthrough): developers.meta.com/horizon/design/mr-design-scene, horizon-os-passthrough.
- Meta performance (Quest 3 comparison, WebXR draw-call guidance): developers.meta.com/horizon/resources/device-optimization-comparison, documentation/web/webxr-perf-workflow.
- Stylized snow: facing-up faces white, caps as separate shapes (Packt Unity shaders cookbook; low-poly snow shader write-ups).
