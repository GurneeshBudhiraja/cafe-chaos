# Café Chaos (the game)

A seating puzzle on the player's real table, for Meta Quest 3 / 3S: hands
only, seated. Built with Meta's Immersive Web SDK (WebXR). The brief is in
[`../docs/game-brief.md`](../docs/game-brief.md); the models and how they
were sized are in [`../START-HERE.md`](../START-HERE.md).

## What this build does

As soon as the session starts, the café appears on the table in front of
the player, below the gaze so it is looked down on, the room dims to dusk
around it, and its lamps come up: a lo-fi night at the café, its light
spilling out over the real table. Guests walk up and line up outside the
door; the player pinches one up, carries it over the café and lets go
over the seat that glows blue; after its meal the guest hops down and
leaves. Like a Horizon OS window, the café has a grab pill on the side
facing the player (pinch and drag to move it) and a bracket at each
corner (pinch and pull to resize, swing to turn), always visible, in the
café's own style. The player's hands are soft plush hands in the same
warm cream.

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

**The guests** (`src/systems/guest-system.ts`, `src/guests/`): the
snack-spirit cast from `public/models/guest-*.glb`.

- **Who comes** (`guests/cast.ts`): each guest is a random species (mochi,
  onigiri, tofu), tinted one of seven pastels and dressed in up to two
  things from `accessories.glb` (chef's hat, beret, headband, glasses, bow,
  apron, vest). A newcomer never looks the same as the guest before it.
- **How many** (`guests/rules.ts`): never more than ten on stage, counting
  everyone, and five in the line. Arrivals come every 3.5 to 6.5 seconds
  when the café is empty and slow as it fills, so it fills briskly and
  then settles.
- **The line**: single file outside the door, its head on the deck, turned
  partly to the player so faces show. Each guest has its own patience (40
  seconds, give or take a quarter): past halfway it taps its foot and
  gives the side-eye, then it gives up and everyone behind steps up.
- **Picking up**: a pinch closing on a guest lifts it. It hangs from the
  fingers, legs kicking, turned to face the player. A guest in the line or
  in a seat watches a free hand that comes close with wide eyes, so it is
  plain they can be picked up.
- **Expressions** (`guests/expressions.ts`), from the models' own face parts
  (five pairs of eyes, five mouths, pupils that look about): startled when
  picked up; wondering what is happening at arm's length, eyes sweeping
  round; and, held up to the player's face (within 40 cm), a run of
  feelings: curious, confused with its head on one side, searching left,
  right and down, sad and drooping, sulking with its eyes screwed shut,
  then won over and beaming; then round again.
- **The seat glow** (`guests/seat-glow.ts`): while a guest is carried,
  every free seat shows a small blue dot, and the seat it would land on
  glows sky blue: a pad on the cushion, a halo, and a soft column of light
  so it shows from the player's seat. Blue because nothing else in the
  café is.
- **Sitting**: let go over the glowing seat and the guest hops onto it:
  pleased, then eating, then idle. Let go anywhere else and it hops back to
  its place in the line (or its own seat). 23 seats are usable; the six on
  the far side of the back row's four-seaters are inside the shell's
  counter and are left out (`guests/paths.ts`).
- **Leaving**: after a minute seated, a guest hops off its chair to the
  nearest aisle and walks out of the door. Everyone who leaves, fed or fed
  up, goes toward the front and marches off left or right at random along
  one of three lanes on the table in front of the café, keeping a gap
  behind the one ahead, and fades out at the end.
- **Cost**: each pose's nine body parts are folded into one skinned mesh
  whose bones are the parts themselves, hidden face parts are not drawn,
  and the contact shadows are one instanced mesh, so a guest is about 8
  draw calls, not 22.

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

**The hands** (`src/hands/cafe-hand.ts`): the player's tracked hands are
soft plush hands in the café's warm cream, in place of the stock white
outline. The mesh is IWSDK's own tracked hand; the look is all in the
material, so it is code, not a modelled asset: matte and solid (a hand
behind the door frame is hidden by it, a guest hangs from real-looking
fingers), a fine felt grain, a soft velvet edge light, an amber glow at
the thumb and forefinger tips as they pinch, and a wrist that fades out.

**Holding the café directly** (`src/systems/hold-system.ts`; the numbers in
`src/hold/hold.ts`). This is switched off in play (`HoldSystem.directGrab`):
with guests to pick up all over the café, a pinch that just misses one
must not drag the whole café away, so the pill and brackets are the way to
move it. Switched on, it works like this: pinch anywhere on or just around the café (over its
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
  and spill, the renderer is set for the look, and the frame budget holds
  (4 checks), with
  screenshots of the seated view, the gate, the counter and a low look
  along the table.
- `node scripts/check-handles.mjs`: the pill lies outside the edge facing
  the viewer and moves edge as the viewer moves round, the brackets wrap
  the corners; pinching the pill carries the café; pulling a corner grows
  it in place and swinging it turns it, the bracket staying under the
  fingers; and the surface finder takes a couch or an unlabelled box and
  refuses the floor, a too-low, too-far or behind surface and a wall
  (16 checks), with screenshots.
- `node scripts/check-hold.mjs`: one hand carries the café exactly with the
  pinch and leaves it where it is put down, a pinch away from it takes
  nothing, two hands resize it by their spread and turn it by their line
  with the point between them kept (9 checks, with direct holding switched
  on for the check), with screenshots of the café lifted and enlarged.
- `node scripts/check-guests.mjs`: guests arrive and line up on their
  spots, a mix of species, colours and outfits; each draws only what
  shows; a guest who waits too long shows it, gives up, and the line steps
  up; a leaver marches off along a lane in front and fades; never more than
  ten on stage (8 checks), with screenshots.
- `node scripts/check-seating.mjs`: a pinch picks a guest up and the café
  stays put; carried, it hangs from the pinch and faces the player; the
  seat under it glows and the other free seats show dots; let go there it
  sits; let go elsewhere it hops back to the line; its time up, it hops
  off, goes out of the door and marches away, its seat free (8 checks),
  with screenshots.
- `node scripts/check-expressions.mjs`: a guest watches a hand that comes
  close; picked up it is startled, then wonders; up at the face it goes
  through its feelings in order, each with its own face and lean; put back
  its face is its own again (7 checks), with a close-up of each expression.
- `node scripts/look-hands.mjs`: pictures of the hands, open, pinching and
  close up. `node scripts/look-top.mjs`: a plan view of the café with a
  grid, for laying out paths.
- `npm run record:guests`: the whole story as the headset shows it (the
  line forming, a guest picked up and brought to the face, seated on the
  glowing seat, another giving up, the first leaving after its meal), to
  `artifacts/guests.mp4`. Timers are shortened there so it fits one video.
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
  index.ts                   World, the systems (café, hold, handles, guests, mood, frame budget), lighting, the hands
  assets.ts                  the model manifest (the café's pieces first)
  cafe/layout.ts             the floor plan and the dressing (meals)
  cafe/materials.ts          the café's materials on the grey-box pieces
  systems/cafe-system.ts     building the café and placing it on the table
  systems/hold-system.ts     reading the pinches; carrying, resizing and turning the café
  systems/guest-system.ts    the guests: arriving, the line, carrying, sitting, leaving
  systems/render-budget-system.ts  the resting shadow map, the refresh rate, the fps readout
  cafe/static-batch.ts       the furniture merged into one mesh per material
  guests/rules.ts            every number that paces the guests
  guests/cast.ts             species, colours and outfits, at random
  guests/actor.ts            one guest: its model, clips, face, materials, folded skin
  guests/expressions.ts      how a held guest acts, and the face it makes at a hand
  guests/paths.ts            the line, the aisles, the way out, the lanes in front
  guests/walker.ts           following a path
  guests/seats.ts            the usable seats and who is on them
  guests/seat-glow.ts        the blue glow on the landing seat, the dots on free seats
  guests/blobs.ts            the guests' contact shadows
  systems/handle-system.ts   the grab pill and corner brackets: placing and working them
  systems/mood-system.ts     the dusk, the lamps coming up, the lanterns' breath
  hold/hold.ts               the numbers behind holding the café
  handles/handles.ts         the pill and bracket shapes, and the numbers behind them
  hands/cafe-hand.ts         the player's plush hands (a material on the tracked hand mesh)
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
