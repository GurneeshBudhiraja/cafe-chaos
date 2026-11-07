# cafe-shell — the Japanese garden café (final art)

**File:** `cafe-shell.glb` — 32,008 triangles, 28 meshes (one draw call each), 28 materials, 17 packed textures, 3.6 MB.
**This replaces the grey-box shell.** Same root name and anchor names, so game code written
against the grey box keeps working, but the shell is larger and the entrance moved: re-read
the sizes below.

## What it is

A diorama of a Japanese café in a small garden, sitting on the player's real table:

- **Base:** 92 × 62 cm garden plate; the café room itself is 70 × 46 cm, centred.
- **Café room:** timber posts and beams, glowing shoji-paper walls, a plank floor,
  a counter along the back wall (coffee machine, pastry case, menu board, hanging
  paper lanterns under a tiled eave).
- **Entrance / right side (+X):** a roofed gate with an indigo noren curtain and an
  engawa step. The rest of the right side is an **open veranda** — timber posts and a
  low rail instead of a solid wall — so the player sees every seat from any angle.
- **Garden ring:** raked gravel with stones (front), moss, a stone path from the gate,
  a koi pond with lilies (front-left), boulders, a bamboo fence, a stone lantern, and
  a cherry tree (back-left) leaning over the roof, with fallen petals.
- Baked contact shading (AO skirts) along wall bases; no real-time shadows needed.

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
| `BenchSpot` | front-right corner by the gate (0.235, 0.024, 0.165) | yaw 180°: waiting guests face into the café |
| `FloorTop` | (0, 0.024, 0) | — |

`BenchSpot` matches the tested layout below — drop the `waiting-bench` model on it
with the anchor's rotation.

## The tested 10-table layout

From `test-app/src/cafe-layout.ts` (all y = 0.024, café space):

- Columns at x = −0.26, −0.13, 0, +0.13, +0.26.
- **Back row** z = −0.135: `table-4` ×3 (cols 1–3), `table-2` ×2 (cols 4–5).
- **Front row** z = +0.025: `table-2` ×5.
- **Waiting bench** at (0.235, +0.165), yaw 180° — front-right corner by the gate,
  waiting guests face into the café.
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
