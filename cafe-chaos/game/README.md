# Café Chaos (the game)

A seating puzzle on the player's real table, for Meta Quest 3 / 3S: hands
only, seated. Built with Meta's Immersive Web SDK (WebXR). The brief is in
[`../docs/game-brief.md`](../docs/game-brief.md); the models and how they
were sized are in [`../START-HERE.md`](../START-HERE.md).

## What this build does

As soon as the session starts, the café appears on the table in front of
the player, and guests start arriving at the gate.

**The café** (`src/systems/cafe-system.ts`):

- **The models** (`src/assets.ts`, from `public/models/`): the Japanese
  garden café shell, the waiting bench by the gate, and the opening
  layout's ten tables (three four-seaters and two two-seaters in the back
  row, five two-seaters in the front row), exactly as sized and tested with
  simulated hands. The other models (guests, janitor, unlocks, markers)
  load in the background for the game to come.
- **Placement**: the nearest detected desk or table in front of the player
  (WebXR plane detection, the surfaces from the headset's Space Setup),
  with the café's centre about 35 cm out so the back row stays within
  seated reach, or as far in as a small table allows. If no table is found
  within two seconds the café floats at arm's reach, and still moves onto
  a table found in the next few seconds. It turns to face the player and
  pops up with a short ease.
- **Size**: the whole café hangs from one parent, scaled by `CAFE_SCALE`
  (1.0: the modelled 92 × 62 cm base, a 70 × 46 cm café room). The models'
  notes allow up to about 1.2× before the back row leaves comfortable
  reach. There is no in-game resizing yet.
- **Light** (`src/lighting.ts`): the scene's warm HDR environment plus a
  warm sky fill and a low sun; no real-time shadows (the models carry
  baked contact shading, and shadow maps are unsafe on Quest).

**The guests** (`src/systems/guest-system.ts`, `src/guests/`):

- **Arrivals**: a guest appears at the far end of the path outside the
  gate every 3 to 8 seconds (at random) while there is room, adults and
  the odd child, each in its own colour. It fades in as it walks up to the
  back of the line.
- **The line**: a single file at the door (`guests/queue.ts`). The first
  guest stands in the gate opening looking into the café; each newcomer
  stands behind the one before, along the path. Nobody comes inside until
  they are seated. Up to six wait at once.
- **Waiting**: a patience bubble over each head counts down from 90
  seconds, its ring draining from green through amber to red
  (`guests/patience-bubble.ts`). It turns to face the player.
- **Giving up**: when the timer runs out the guest steps out of the line,
  walks away down the path and fades out; everyone behind steps up a
  place. Arrivals carry on, so the door never stays empty for long.
- The models are rigid, so walking is a small bob and sway. Picking a
  guest up and seating them is the next phase.

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

Both drive the app in IWER, IWSDK's browser headset emulator (its living
room has a desk-height table), from a running dev server:

- `node scripts/check-placement.mjs`: the café lands on the detected
  table at table height, within reach and facing the viewer, with the whole
  opening layout (4 checks) and screenshots.
- `node scripts/check-guests.mjs`: with patience shortened, a guest walks
  up and waits at the gate with a bubble over its head, the others line up
  single file behind it outside, the first leaves and fades when its
  patience runs out, the line steps up, and arrivals keep coming within
  the line's room (6 checks).
- `node scripts/record-cafe.mjs`: the café's arrival and a look around it,
  as the headset shows it, to `artifacts/cafe.mp4`.
- `npm run record [-- seconds]`: the guests arriving, waiting and giving up
  (patience shortened to 18 s for the video), to `artifacts/guests.mp4`.

## Layout

```
src/
  index.ts                   World, lighting, the café system
  assets.ts                  the model manifest (critical pieces first)
  cafe/layout.ts             the opening floor plan
  systems/cafe-system.ts     building the café and placing it on the table
  systems/guest-system.ts    guests arriving, queueing, waiting and giving up
  guests/queue.ts            the line at the door and the path
  guests/patience-bubble.ts  the timer over a guest's head
  lib/desk-placement.ts      finding the table among the detected surfaces
  lib/hand-pinch.ts          reading a hand's pinch from its joints (for the game to come)
  lighting.ts                the warm light
public/models/               the .glb models (copies of ../models/*/)
public/envs/warm-cafe.hdr    the environment
scripts/                     the emulator check and the recording
```
