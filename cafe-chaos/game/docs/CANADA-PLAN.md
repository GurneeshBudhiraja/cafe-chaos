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
| Two-story: deprioritised in the meeting (a hand cannot reach a lower floor under a roof) | Built as an open upper deck over the counter only (phase 3c): no seat is under it, so the worry does not arise. |
| Fresh start per café; "coming soon" placeholders (European etc.) | Game side, later: the café picker on the start card. |
| Two floors: seats on the upper end and the lower end ("second floor patio") | Phase 3c (built): an open upper deck over the counter (the part of the room the player never reaches into), two tables and the rooftop piano on it, stairs up from the patio outside the cabin's right wall. Nothing roofs a seat, so both floors stay in reach of the hand (the reason two floors were set aside in the meeting). |
| A musician (violinist or guitarist; and a pianist) on the patio, purchasable | Phase 3c: the violinist on the patio stage and a pianist at the rooftop piano, each bought; seats in earshot meet `music`. |
| Warmth ("I want temperature"), the Banff cabin | Phase 3c: a fieldstone fireplace inside the cabin; the tables beside it meet `warm`. |
| The Rockies, the waterfall (the Seongsu "Banff Town" reference) | Phase 3c: a mountain backdrop with a waterfall into a pool, along the plate's back edge. |
| Guests, servers and janitors with different looks | Phase 3 (built): Canadian snack spirits (a snowbit, a beavertail, a nanaimo bar) with toques, earmuffs, scarves and parkas; three baristas in red aprons (cap, bun, toque); two janitors in plaid with a snow shovel; the violinist in a parka with a violin and a Play clip. See `models/27-cafe-canada/INTEGRATION.md`. |
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
3d. Realism pass (built, after review): relief mountains with a painted rock-and-snow texture, haze and baked sun-side shading; the waterfall down a cleft; a river-stone fireplace with andirons, embers, shaped flames, a beam mantel, garland and stockings; the same flames and embers on the bonfire; a fieldstone texture for every stone; JPEG textures for a smaller download.
3c. The missing pieces from the notes (built): the upper deck with stairs and its seats, the rooftop piano and the pianist, the fireplace, the Rockies and the waterfall; stair clips for every character (guests `StairsUp`/`StairsDown`, staff `ClimbUp`/`ClimbDown`/`CarryUp`/`CarryDown`).
3. The characters (built): three Canadian guest species with winter accessories; three baristas; two janitors; the musician. Scripts `staff_canada_build.py`, `guests_canada_build.py`; names fixed by `fix_names.py`.
4. Game side (later): the café picker, the new wishes, the takeaway flow, the musician purchase, no dimming.

## Textures and baked lighting (phase 3b)

Meta's guidance for Quest favours baked lighting and lightmaps over real-time effects, as few
material/texture state changes as possible, and treats texture size as a memory (not GPU-time)
question; third-party WebXR guides add KTX2 compression and under ~100 draw calls as targets. So
the realism pass bakes rather than computes: tiling colour + normal maps generated per material
(one image per material, no new materials), and one ambient-occlusion atlas per file on a second
UV set, which the game's matte (Lambert) materials already keep. No roughness/metal maps (the
Lambert swap drops them), no real-time shadows added. See `models/27-cafe-canada/INTEGRATION.md`.

## Sources

- Tim Hortons Seongsu flagship (Banff cabin theme, red canoe, lake, cabin booths): The Korea Herald, blogTO, Herald Business, 2026.
- Tim Hortons "Welcome Image" redesign (Canadian maple tables, communal seating, heritage art): QSR, NRN, Food Service & Hospitality.
- Meta MR design (shadows to ground objects, lighting consistency with the room, passthrough): developers.meta.com/horizon/design/mr-design-scene, horizon-os-passthrough.
- Meta performance (Quest 3 comparison, WebXR draw-call guidance): developers.meta.com/horizon/resources/device-optimization-comparison, documentation/web/webxr-perf-workflow.
- Stylized snow: facing-up faces white, caps as separate shapes (Packt Unity shaders cookbook; low-poly snow shader write-ups).
- Meta, Unity mobile performance intro (baked lightmaps and light probes over dynamic light, keep draw calls down): https://developers.meta.com/horizon/documentation/unity/unity-mobile-performance-intro/
- Meta, WebXR performance best practices (bake lighting for static scenes; shadow maps count against the budget): https://developers.meta.com/vr/documentation/web/webxr-perf-bp/
- Meta, draw call cost analysis (state changes are the cost; texture size/compression did not change GPU draw cost; atlas and sort): https://developers.meta.com/horizon/documentation/unity/po-draw-call-analysis/
- Meta, "Down the Rabbit Hole" developer best practices (atlasing, fewer state changes): https://developers.meta.com/horizon/blog/down-the-rabbit-hole-w-oculus-quest-developer-best-practices-the-store/
- Needle Engine, VR performance (under ~100 draw calls, 200–300k triangles, KTX2 textures; third-party targets): https://engine.needle.tools/docs/how-to-guides/xr/vr-performance
