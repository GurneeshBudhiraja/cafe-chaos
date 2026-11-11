# cafe-shell — the Japanese garden café (final art)

**File:** `cafe-shell.glb` — about 40,000 triangles, 38 meshes, 25 materials, 16 packed textures, one 2 s `Ambient` clip, 4.0 MB.
**This replaces the grey-box shell.** Same root name and anchor names, so game code written
against the grey box keeps working, but the shell is larger and the entrance moved: re-read
the sizes below.

## What it is

A diorama of a Japanese café in a small garden, sitting on the player's real table:

- **Base:** 92 × 62 cm garden plate; the café room itself is 70 × 46 cm, centred.
- **Café room:** timber posts and beams, glowing shoji-paper walls, a plank floor, and
  the counter along the back wall. The counter is a walnut service bar — a framed front with cream
  panels, bamboo slats and a brass foot rail, under a thick rounded walnut top (y = 0.085); behind it a raised duckboard where the two baristas stand (`BaristaSpot-1/2`
  anchors, see `../18-barista/`), then a back-bar cabinet with a tetsubin on a brazier,
  a matcha bowl (with ∞ latte art), a pour-over on a wooden stand, a copper kettle and
  stacked bowls; one clean wall shelf above with five tea tins (app-sticker labels), a
  plant, cups and a stack of menus with a tiny headset resting on it; the espresso machine
  and a lucky cat on the bar, the pastry case at the right end, the menu board on the wall.
  All the props share **one painted 512 px atlas** (`CafeBarPalette`: 16 materials, each
  a tile with its own grain, glaze, enamel stripes or hammered copper) so the whole back bar
  is a handful of draw calls.
- **`Ambient` clip (2 s loop):** six steam puffs over the kettle, the dripper and the
  machine rise, swell and shrink away. Play it on the shell's root with an `AnimationMixer`
  and leave it running (`mixer.clipAction(clip).play()`): that is the "something is
  brewing". Nothing else in the shell animates.
- **Menu board:** a chalk-style texture (`MenuBoard`): お品書き / INSTA CAFÉ, Meta-themed
  items (Insta-gram Latte, Reels Roast, Threads Chai, Llama Matcha; Poke Mochi, Like-button
  Dango, Horizon Dorayaki, Quest-ard Taiyaki) with coin prices, a NEW! burst, a "most liked!"
  arrow, the real Meta mark top right, a "how do you do, fellow baristas?" scribble and a blue
  footer strip — META HACKATHON 2026 · hands-only on Quest — sized to read from the seat.
  Re-render with `menu_render.py` (text block in the .blend) to change the text.
- **Meta touches, kept subtle:** the Meta mark (traced from the official vector) carved into the
  flat stone by the front path — a real 1.6 mm groove in the stone's top, floor in a darker
  granite grey, no paint — the ∞ latte art, the sticker labels on the tins, the headset on the
  menus, the footer on the board.
- **Entrance / right side (+X):** fully **open**: no wall, posts, beams, gate roof or
  curtain on this side, so the player sees every seat from the right with nothing in the
  way. A free-standing timber **door frame** (`GateFrame`: two posts, a top lintel and a tie
  beam) marks the entrance in the gate opening, flanked by two small post lamps
  (`GateLamps`, emissive paper so they glow without a light), with a knee-high sill, the
  veranda rail and an engawa step. The gravel on this side is clear (no stepping stones), so
  guests walking in from the gate have a flat path. (The removed timber, gate roof, noren,
  stones and stone lantern are kept in the Blender file as `*.bak-*` meshes/objects.)
- **Lighting is the game's job:** the file has emissive lanterns/lamps and baked contact
  shading only; add a soft ambient plus one key light (or the headset's lighting estimate).
- **Garden ring:** raked gravel with stones (front), moss, a stone path from the gate,
  a koi pond with lilies (front-left), boulders, a bamboo fence, and
  a cherry tree (back-left) leaning over the roof, with fallen petals.
- Baked contact shading (AO skirts) along wall bases; no real-time shadows needed.
- The right-hand moss bed sits 1.8 mm above the gravel so the two no longer z-fight (that was the shimmer on Quest).

## Numbers the game needs

| Thing | Value |
|---|---|
| Root node | `cafe-shell` (origin at the centre of the base's underside) |
| Base footprint | 0.92 × 0.62 m (X × Z) |
| Café room | 0.70 × 0.46 m, walls 0.16 m high |
| Café floor top | **y = 0.024** — place tables, guests, the bench at this height |
| Garden ground top | y = 0.0225 |
| Café room edges | front z = **+0.19**, back z = **−0.27** (glTF space; see axes note) |
| glTF extras on the root | `cafe_model: true`, `front_edge_z_m: 0.19`, `back_edge_z_m: -0.27`, `floor_top_y_m: 0.024`, `window_side: "none"`, `entrance_side: "+x"` (plus legacy `front_edge_y_m`/`back_edge_y_m` in Blender's Y — ignore those) |

**Axes:** +Y up, the player sits toward **+Z**. The room's interior runs
x ∈ [−0.33, +0.33], z ∈ [−0.25, +0.17] (the counter occupies the back of that).
Use the `*_z_m` extras keys; the `*_y_m` ones are the same numbers in Blender's Y axis,
kept only for grey-box compatibility.

## Anchors (empties under the root)

| Anchor | Where | Facing |
|---|---|---|
| `Entrance` | in the gate opening, right wall (x ≈ 0.33, z ≈ 0.055) | into the café (−X) |
| `BenchSpot` | front-right corner by the gate (0.235, 0.024, 0.165) | no turn: waiting guests face the player (+Z), so their faces show |
| `FloorTop` | (0, 0.024, 0) | — |

`BenchSpot` matches the tested layout below — drop the `waiting-bench` model on it
with the anchor's rotation.

## The tested 10-table layout

From `test-app/src/cafe-layout.ts` (all y = 0.024, café space):

- Columns at x = −0.26, −0.13, 0, +0.13, +0.26.
- **Back row** z = −0.135: `table-4` ×3 (cols 1–3), `table-2` ×2 (cols 4–5).
- **Front row** z = +0.025: `table-2` ×5.
- **Waiting bench** at (0.235, +0.165), no turn — front-right corner by the gate,
  waiting guests face the player.
- Closest two seats/slots: 3.2 cm (safe for the 4 cm drop radius).

## Scaling it up

The shell may be scaled **uniformly** on one parent that holds the shell *and* the
tables, guests and bench, so everything stays in proportion; the anchors scale with
it, and the game's world-space radii (3 cm grab, 4 cm drop) only get easier to hit.
Keep it to about **1.1–1.2×**: at the recommended 35 cm placement the back-row seats
sit near 55 cm of reach already, and much past 1.2× they leave comfortable seated
reach. (The garden rim is decorative — it may go beyond reach.)

## Materials and rendering

- 28 materials, all textured PBR (wood, plaster, roof tiles, gravel, moss, water…).
- **Shoji panels, lanterns and the lantern's chamber are emissive** — they glow on
  their own; the scene needs only ambient light (an HDR environment works well).
- **Blossom canopy and leaves use alpha BLEND** (not MASK) — safe on Quest.
- The AO skirts are thin transparent gradient strips near wall bases: render them as
  they come (no shadow set-up needed). Do not enable real-time shadow maps on Quest.

## Re-exporting from Blender

Source: `blender/cafe-shell-art.blend`, scene `CafeShellArt` (textures also in
`../blender-textures/`). Export glTF Binary with +Y up, include custom properties,
apply modifiers, active scene only. After export, strip any `.001` name suffixes in
the JSON chunk (three.js renames duplicate node names otherwise) — the project's
export snippet in the blend's text block does both.
