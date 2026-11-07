# Puppy Bite

A hands-only game for Meta Quest 3 / 3S, built with Meta's Immersive Web
SDK (WebXR). A litter of sleepy puppies lies on a blanket. Pick each one
up with a pinch, turn it, and tuck it into the bed so they all fit. A
puppy dropped onto another one nips and hops back out. No controllers.

## How it plays

- **Grab with bare hands**: pinch near a puppy to pick it up (IWSDK's
  `OneHandGrabbable` and `GrabSystem`). A ring of light shows which puppy a
  pinch would take; a carried puppy wags its tail.
- **Poses and footprints** (`puppies/shapes.ts`): five poses, each taking
  a few cells of the bed like a small polyomino: a ball (1), a loaf (1×2),
  a sprawl (an L of 3), a stretch (1×3) and a curl (2×2).
- **The bed** (`game/bed.ts`, `systems/bed-system.ts`): a quilted mattress
  whose stitching marks the cells. Let a puppy go over it and it settles
  into the cells under it, turned to the nearest quarter turn, with a
  contented squash and a sigh. If it would land on another puppy or hang
  off the edge, it nips: a yip and a hop back onto the table. Every puppy
  on the bed ends the level: three stars with no nips, two with up to two,
  one otherwise.
- **Levels** (`game/level.ts`): made on the spot and always solvable. The
  litter is packed onto the bed first (a backtracking tiling with random
  choices), then scattered on the blanket. Easy: a 3×3 bed with room to
  spare, 3 puppies. Medium: 4×4, nearly full, 5 puppies. Hard: 4×5, every
  cell taken, 6 puppies. The pads on the table's front edge (touch them)
  start a level; "New litter" repeats the difficulty with a new litter.
- **The puppies** (`puppies/puppy-mesh.ts`): plush little dogs built from
  rounded parts, with painted fur coats (six coats, blotches for the
  patched ones), floppy ears, closed sleepy eyes, a collar with a tag, and
  a tail. They breathe, twitch an ear now and then, and wag when carried
  or just settled (`systems/puppy-system.ts`).
- **Sound** (`audio/soundscape.ts`): all made with the Web Audio API. A
  slow lullaby with a music-box pluck, and soft effects: a sigh on
  settling, a yip on a nip, a tiny whine on pick-up, a happy little howl
  when the litter is tucked in.
- **Score**: a scoreboard behind the bed, and a small panel on the back of
  the left wrist (look at your hand like a watch), with a face per puppy
  that closes its eyes once it is on the bed.

Everything (the puppies, the bed, the table, the room, the textures) is
built in code; there are no model or sound files.

## Run it on a Quest

```bash
cd puppy-bite
npm install
npm run dev
```

The dev server prints a `network` HTTPS address on port 8082. Open it in
the Quest Browser on the same Wi‑Fi, accept the certificate warning, press
**Enter VR**, and put the controllers down. (Or over USB:
`adb reverse tcp:8082 tcp:8082`, then open `https://localhost:8082`.)

## Scripts

All of these drive the app in IWER, IWSDK's browser headset emulator, with
emulated hand tracking, from a running dev server:

- `node scripts/test-level.mjs [easy|medium|hard] [seed]`: plays a level
  start to finish with the hands, expects three stars, then drops a puppy
  on another and expects a nip (4 checks).
- `node scripts/test-ui.mjs`: the sound, the hover ring, the wrist panel,
  the pads, an offline render of the soundtrack.
- `npm run record`: records an easy level played start to finish (with one
  careless drop and its nip) as the headset shows it, with the game's
  soundtrack, to `artifacts/puppies.mp4`.
- `node scripts/showcase.mjs`: the five poses up close.
- `node scripts/look.mjs`: screenshots of the scene.

## Layout

```
src/
  index.ts                 World, systems, the game
  game/level.ts            level generation (pure maths)
  game/bed.ts              the bed
  game/game.ts             starting levels, the score, sound hooks
  game/hud.ts              the scoreboard and the wrist panel
  game/pads.ts             the Easy / Medium / Hard / New litter pads
  puppies/shapes.ts        poses, footprints, grid snapping (pure maths)
  puppies/puppy-mesh.ts    the puppies' look
  puppies/puppy.ts         puppies as entities
  systems/bed-system.ts    settling into cells, nips, scoring
  systems/puppy-system.ts  breathing, ears, tails, the snuggle, the hop
  systems/rest-system.ts   puppies settle where they are let go
  systems/hover-system.ts  the ring under what a pinch would take
  audio/soundscape.ts      music and effects, live and offline
  scene-assets/            the room and the table (also for the editor)
```
