# Cake Box

A hands-only game for Meta Quest 3 / 3S, built with Meta's Immersive Web
SDK (WebXR). A strawberry cake stands on the counter. Pick up the knife
with a pinch, cut the cake into the shapes the box's cards ask for, and
fit the pieces into the box. No controllers.

## How it plays

- **Grab with bare hands**: pinch near the knife or a piece of cake to pick
  it up (IWSDK's `OneHandGrabbable` and `GrabSystem`). A ring of light
  shows what a pinch would pick up. The hand holding the knife closes
  round the handle like a real hand (`HandGripSystem`).
- **Cut where the blade goes** (`CutSystem`): the cake is a convex
  footprint extruded up in layers (sponge, jam, sponge, cream, sponge,
  frosting), and the knife's edge is tracked as a stroke. A piece splits
  only where the blade's sweep covers the whole chord across it, so a cut
  across a corner takes just the corner. A blade that stops inside the
  cake scores a groove, and grooves on the same line add up, so a cut
  finished in a second stroke goes through. Crumbs fall as the blade goes
  down. Nothing depends on what the headset sees of the knife: a hand in
  front of the cake changes nothing.
- **Fit the cards** (`BoxSystem`): each cell of the box carries a card
  with a shape. Let a piece go over a cell and it settles in; the fit is
  the overlap of its footprint with the card's shape at the way you turned
  it (with a few degrees of forgiveness), shown on the card and on the
  cell's light. Fill every cell and the level is scored: three stars for
  good fits within the level's own cut count.
- **Levels** (`game/level.ts`): made on the spot and always solvable. The
  cards come from cutting the cake's footprint with random straight cuts,
  each a full line as a knife makes. Easy: one straight cut of a square
  cake, cards as the pieces sit. Medium: two cuts, diagonals allowed, cards
  turned by quarter turns. Hard: two crossing cuts of a round cake, cards
  turned any which way. The pads on the counter's front edge (touch them)
  start a level; "New cake" repeats the difficulty with a new cake.
- **Sound** (`audio/soundscape.ts`): all made with the Web Audio API. A
  slow, quiet pad with a sparse pluck, and soft effects: the blade through
  the cake, a thump when a piece comes free, a plop when a piece settles
  (a chime for a good fit), an arpeggio when the box is done.
- **Score**: a scoreboard behind the box, and a small panel on the back of
  the left wrist (look at your hand like a watch).

Everything (the cake, the knife, the box, the room, the textures) is built
in code; there are no model or sound files.

## Run it on a Quest

```bash
cd cake-box
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

- `node scripts/test-cut.mjs`: a corner cut, a partial cut, a cut finished
  in a second stroke (4 checks).
- `node scripts/test-level.mjs [easy|medium|hard] [seed]`: plays a level
  start to finish and expects three stars.
- `node scripts/test-ui.mjs`: the sound, the hover ring, the wrist panel,
  the pads, an offline render of the soundtrack.
- `npm run record`: records an easy level played start to finish as the
  headset shows it, with the game's soundtrack, to `artifacts/cake.mp4`.
- `node scripts/look.mjs`: screenshots of the scene.

## Layout

```
src/
  index.ts                 World, systems, the game
  game/level.ts            level generation (pure maths)
  game/box.ts              the box and its cards
  game/game.ts             starting levels, the score, sound hooks
  game/hud.ts              the scoreboard and the wrist panel
  game/pads.ts             the Easy / Medium / Hard / New cake pads
  cake/polygon.ts          convex polygon maths (split, chord, overlap)
  cake/cake-mesh.ts        the cake's look, strawberries, beads, grooves
  cake/textures.ts         painted textures (layers, frosting, strawberry)
  cake/piece.ts            cake pieces as entities, splitting
  systems/cut-system.ts    cutting that follows the blade
  systems/box-system.ts    fitting pieces into cells, scoring
  systems/rest-system.ts   things settle where they are let go
  systems/crumb-system.ts  crumbs
  systems/hand-grip-system.ts  the hand closes round the knife
  systems/hover-system.ts  the ring under what a pinch would take
  audio/soundscape.ts      music and effects, live and offline
  scene-assets/            the kitchen and the knife (also for the editor)
```
