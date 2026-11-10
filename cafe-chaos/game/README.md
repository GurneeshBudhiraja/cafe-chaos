# Café Chaos (the game)

A seating puzzle on the player's real table, for Meta Quest 3 / 3S: hands
only, seated. Built with Meta's Immersive Web SDK (WebXR). The brief is in
[`../docs/game-brief.md`](../docs/game-brief.md); the models and how they
were sized are in [`../START-HERE.md`](../START-HERE.md).

## What this build does

As soon as the session starts, the café appears on the table in front of
the player, below the gaze so it is looked down on, the room dims to dusk
around it, and its lamps come up: a lo-fi night at the café, its light
spilling out over the real table. Like a Horizon OS window, the café has
a grab pill on the side facing the player (pinch and drag to move it) and
a bracket at each corner (pinch and pull to resize, swing to turn), always
visible, in the café's own style; pinching the café itself works too. The
player's hands are drawn in the same warm style.

**The café** (`src/systems/cafe-system.ts`):

- **The models** (`src/assets.ts`, from `public/models/`): the Japanese
  garden café shell (open right side, timber door frame, post lamps), the
  waiting bench by the gate, the opening layout's ten tables (three
  four-seaters and two two-seaters in the back row, five two-seaters in
  the front row), a two-stool bar along the left wall, the quiet armchair
  corner at the back right, and meals already out on eight tables
  (`src/cafe/layout.ts`). The grey-box pieces are dressed in the café's
  own walnut, indigo and ceramic at load (`src/cafe/materials.ts`); the
  models themselves are untouched.
- **Placement**: the nearest detected flat surface in front of the player
  that is not the floor (WebXR plane detection, the planes from the
  headset's Space Setup: a table, desk, counter, couch seat, shelf or
  unlabelled box, anything horizontal at least 20 cm up, within 1.2 m and
  below the eyes; `src/lib/desk-placement.ts`), with the café's centre
  about 45 cm out so the whole café sits below the gaze while the back row
  stays within seated reach, or as far in as a small surface allows. If no
  surface is found within two seconds the café floats 60 cm ahead and
  55 cm below the eyes, and still moves onto a surface found in the next
  few seconds (unless the player has already moved it). It turns to face
  the player and pops up with a short ease.
- **Size**: the whole café hangs from one parent, scaled by `CAFE_SCALE`
  (1.0: the modelled 92 × 62 cm base, a 70 × 46 cm café room) until the
  player resizes it.

**The handles** (`src/systems/handle-system.ts`, `src/handles/handles.ts`):
the café's grab pill and corner brackets, in the manner of a Horizon OS
window but always visible and in the café's paper-lantern cream with an
amber glow. They are low cream blocks standing on the table just outside
the base (not flat marks, so they still read when the player looks across
the table at a shallow angle), they grow with the café within limits so
they stay in proportion to it, follow the café wherever it goes, and
brighten as a hand comes near and fully while held. Their sizes, growth
limits and brightness are the constants at the top of
`src/handles/handles.ts`.

- **The pill** lies outside the edge of the base that faces the player and
  moves to another edge as the player moves round the café (with a little
  hysteresis, so it never flickers between two). Pinch it and drag: the
  café comes along, lifted, slid or set down elsewhere.
- **The brackets** wrap the four corners of the base. Pinch one and pull it
  out from the café's centre to grow the café (from its base, in place),
  push it in to shrink it, swing it round the centre to turn the café: the
  corner stays under the fingers throughout.

Pinches near a handle are kept from the café's own grab, so a handle
always wins where they overlap.

**The frame budget** (`src/systems/render-budget-system.ts`,
`src/cafe/static-batch.ts`): what keeps the café smooth on the headset (a
missed frame shows as judder and smearing when the head moves).

- **One mesh per material.** The furniture never moves inside the café, so
  every opaque mesh sharing a material is merged at start-up: about 90
  meshes become about ten, and a frame is roughly 65 draw calls instead of
  200. The originals stay, hidden, for their anchors. Anything that moves on
  its own is marked `userData.dynamic` and left out.
- **The shadow map rests.** The house light and its shadow casters stand
  still inside the café, so the map is redrawn only when the café is moved,
  turned or resized (or when something calls `touchShadows()`), not every
  frame.
- **Five lights, not seven.** Every light is worked out for every lit pixel:
  the centre lantern's light is carried by its neighbours and the room
  light (its paper and halo still glow).
- **A matte spill.** The disc on the table covers much of the view, so it
  uses the cheapest lit material.
- **A steady 72 Hz** is asked of the headset where it offers a choice.
- Add `?fps` to the address for a frames-per-second readout over the café.
  `node scripts/probe-perf.mjs` counts what a frame draws and times the
  parts of the look in the emulator.

**The hands** (`src/hands/cafe-hand.ts`): the player's tracked hands use
IWSDK's own hand mesh but the café's materials in place of the stock white
outline: translucent warm cream with a faint inner glow that brightens as
the fingers pinch, and a thin amber rim at the silhouette. Clear enough to
see what is under a fingertip; bright enough to read over the dimmed room.

**Holding the café directly** (`src/systems/hold-system.ts`; the numbers in
`src/hold/hold.ts`), for anyone who reaches for the model itself: pinch anywhere on or just around the café (over its
garden, roof or fence, within 6 cm) and it follows the pinch: lift it,
slide it along the table, set it down elsewhere. Pinch with both hands
and the distance between them resizes it (between 0.3× and 2.5×), the
line between them turns it, and the point between the hands stays under
them; it grows from its base, so it never sinks or rises while being
stretched. It always stays upright and never goes below the floor.
Pinches are read from the hands' joints (`src/lib/hand-pinch.ts`), so no
pointer rays are involved. Once the player has moved the café, it is not
placed again that session.

**The night** (`src/lighting.ts`, `src/light/`, `src/systems/mood-system.ts`;
every number that tunes the look is in `src/light/mood.ts`):

- **Dusk**: a headset page cannot turn the passthrough cameras down, so a
  large dark, slightly blue, translucent shell is drawn around the head
  first, without depth, and the scene draws over it. Once the café is
  placed it fades in over about three seconds, tinting the room to dusk;
  the HDR environment is turned well down and a dim cool fill takes over.
- **The lamps**: point lights at the two post lamps by the door and the
  three paper lanterns over the counter, plus an unseen warm room light,
  each with a limited reach, and a soft additive halo sprite on every
  visible lamp. The lantern and shoji papers' emissive glow is set for
  the night. The lamps come up a moment after the dusk begins, and the
  lanterns breathe: a slow, slight flicker.
- **Shadows**: the house light, a warm spot high over the counter shining
  down and out toward the front, is the one light that casts shadows
  (PCF, a 1024 map): the furniture throws them across the floor, and the
  door frame, rail and fence throw them out onto the table in the light
  that pours from the café's open side and front. A faint cool moon from
  high front left shapes the roof, the tree and the garden, without
  shadows. *The model notes advise against shadow maps on Quest after a
  sampler bug seen at a workshop; this build turns them on because the
  look asks for them. If a headset shows artefacts, set
  `renderer.shadowMap.enabled` false in `src/lighting.ts` and the rest of
  the look stands.*
- **The spill**: a wide disc lies on the table under the café and catches
  the lamps' pools and the house light pouring out of the café, each
  falling off with distance, with the frame and fence shadows in it. Its
  shader keeps direct light only (no ambient, fill, environment or moon),
  and it blends colour only, never alpha: the page's canvas is composited
  over the passthrough with premultiplied alpha, so a plain additive blend
  would also cover the real table and darken it, which is what made an
  earlier version look like a painted disc. Now it can only brighten what
  is behind it, so the real table's texture shows through the glow and
  the glow has no edge of its own (a wide feather is only a safety bound
  at about 85 cm). The halos blend the same way.
- **Tone**: ACES filmic tone mapping, exposure 1.3.

No guests in this build; the seating game comes next.

## Run it on a Quest

```bash
cd cafe-chaos/game
npm install
npm run dev
```

The dev server prints a `network` HTTPS address on port 8082. Open it in
the Quest Browser on the same Wi‑Fi, accept the certificate warning, and
press **Enter AR** at a table. (Or over USB: `adb reverse tcp:8082 tcp:8082`,
then open `https://localhost:8082`.)

## Scripts

All drive the app in IWER, IWSDK's browser headset emulator (its living
room has a desk-height table), from a running dev server:

- `node scripts/check-placement.mjs`: the café lands on the detected
  table at table height, within reach and facing the viewer, with the whole
  layout (4 checks) and screenshots.
- `node scripts/check-mood.mjs`: the passthrough has dimmed around the
  head and the lamps are up, the café carries its lamps, halos, key light
  and spill, and the renderer is set for the look (3 checks), with
  screenshots of the seated view, the gate, the counter and a low look
  along the table.
- `node scripts/check-handles.mjs`: the pill lies outside the edge facing
  the viewer and moves edge as the viewer moves round, the brackets wrap
  the corners; pinching the pill carries the café; pulling a corner grows
  it in place and swinging it turns it, the bracket staying under the
  fingers; and the surface finder takes a couch or an unlabelled box and
  refuses the floor, a too-low, too-far or behind surface and a wall
  (15 checks), with screenshots.
- `node scripts/check-hold.mjs`: one hand carries the café exactly with the
  pinch and leaves it where it is put down, a pinch away from it takes
  nothing, two hands resize it by their spread and turn it by their line
  with the point between them kept, and the hold frame glows near and
  held (12 checks), with screenshots of the café lifted and enlarged.
- `npm run record:handles`: the handles in use (the pill carrying the café,
  a corner pulled to grow and swung to turn it, the pill moving edge as the
  viewer moves round), as the headset shows it, to `artifacts/handles.mp4`.
- `npm run record:hold`: one hand lifting and carrying the café, then two
  hands enlarging and turning it, as the headset shows it, to
  `artifacts/hold.mp4`.
- `npm run record`: the café's arrival, the dusk and the lamps coming up,
  and a look around, as the headset shows it, to `artifacts/cafe.mp4`.

## Layout

```
src/
  index.ts                   World, the café, hold, handle and mood systems, lighting, the hands
  assets.ts                  the model manifest (the café's pieces first)
  cafe/layout.ts             the floor plan and the dressing (meals)
  cafe/materials.ts          the café's materials on the grey-box pieces
  systems/cafe-system.ts     building the café and placing it on the table
  systems/hold-system.ts     pinching the café to move, resize and turn it
  systems/handle-system.ts   the grab pill and corner brackets: placing and working them
  systems/mood-system.ts     the dusk, the lamps coming up, the lanterns' breath
  hold/hold.ts               the numbers behind holding the café
  handles/handles.ts         the pill and bracket shapes, and the numbers behind them
  hands/cafe-hand.ts         the player's hands in the café's style
  lighting.ts                the renderer and the fill light
  light/mood.ts              every number that tunes the look
  light/dimmer.ts            the passthrough dimmer
  light/cafe-lights.ts       lamps, halos, key light, shadow flags, the spill
  light/halo.ts              the glow sprite
  light/spill.ts             the light-and-shadow catcher on the table
  lib/desk-placement.ts      finding a flat surface (not the floor) among the detected planes
  lib/hand-pinch.ts          reading a hand's pinch, or a fingertip, from its joints
public/models/               the .glb models (copies of ../models/*/)
public/envs/warm-cafe.hdr    the environment
scripts/                     the emulator checks and the recording
```
