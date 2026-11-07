# Yappers: All Aboard

A hands-only game for Meta Quest 3 / 3S, built with Meta's Immersive Web
SDK (WebXR). A crowd of Yappers, thumb-sized creatures with big eyes and
hats, queues at a bus stop on the table. Each one holds up a card saying
where it will sit: a window seat, the front row, beside a friend, not
beside a grump, with a spare seat alongside. Pinch them one by one and
put them in the open-top bus so that everyone's rules hold. No
controllers.

## How it plays

- **Grab with bare hands**: pinch near a Yapper to pick it up (IWSDK's
  `OneHandGrabbable` and `GrabSystem`). A ring of light shows which one a
  pinch would take; a carried Yapper kicks its feet.
- **The bus** (`game/bus.ts`): rows of bench seats, two each side of the
  aisle, the front toward the stop. Let a Yapper go over a seat and it
  sits down facing the front. Over a taken seat, the sitter squawks and
  the newcomer bounces off the bus back onto the table ("Is this seat
  taken?").
- **The rules** (`yappers/rules.ts`): seven kinds. Window seat, aisle
  seat, front row, back row, beside a named Yapper (sharing a pair of
  seats), not beside a named Yapper, and a spare seat beside it. Every
  change of seating is judged (`systems/seat-system.ts`): a Yapper whose
  rules all hold beams and chirps; one with a broken rule scowls and
  yaps, and each new grumble counts. Everyone seated and content ends the
  level: three stars with no grumbles, two with up to two, one otherwise.
- **The cards** (`yappers/cards.ts`): a speech bubble over each head with
  the name, the portrait, and one picture per rule, each tinted grey
  until it can be judged, green when met, red when broken. Cards turn to
  face you and shrink once their owner is seated and happy.
- **Levels**: made on the spot and always solvable. A seating is drawn at
  random, each Yapper's rules are read off it, and rules are added until
  few seatings satisfy them (counted by backtracking). Easy: 2 rows, 4
  Yappers, one rule each. Medium: 3 rows, 6 Yappers, up to two rules.
  Hard: 3 rows, 8 Yappers, up to three rules, a couple of solutions. The
  pads on the table's front edge (touch them) start a level; "New crowd"
  repeats the difficulty with a new crowd.
- **The Yappers** (`yappers/yapper-mesh.ts`): egg-shaped bodies with a
  painted belly and speckle, eyes that blink, brows that show the mood, a
  beak that yaps, a tuft, stubby arms and feet, and eight hats (cap, bow,
  beanie, glasses, flower, propeller, headphones, or none) in eight
  colours, so each is told apart at a glance. They breathe, bounce and
  wave when happy, shake their heads when grumpy
  (`systems/yapper-system.ts`).
- **Sound** (`audio/soundscape.ts`): all made with the Web Audio API. A
  light travelling tune (a plucked strum over four chords, a soft bass, a
  little glockenspiel) and soft effects: a plump sit, a chirp, a yap-yap,
  a "mep?" on pick-up, a boing on a bump, the bus's bell and horn when
  everyone is aboard.
- **Score**: a departures board behind the bus, and a small panel on the
  back of the left wrist (look at your hand like a watch), with a face per
  Yapper: faded while queueing, beaming when seated and content, scowling
  while a rule is broken.

Everything (the Yappers, the bus, the stop, the table, the room, the
textures) is built in code; there are no model or sound files.

## Run it on a Quest

```bash
cd yappers
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
  start to finish with the hands and expects three stars, then drops a
  Yapper on a taken seat (a bump), seats it where a rule breaks (a
  grumble) and puts it right again (7 checks).
- `node scripts/test-ui.mjs`: the sound, the hover ring, the cards, the
  wrist panel, the pads, an offline render of the soundtrack.
- `npm run record`: records an easy level played start to finish (with a
  bump and a grumble on the way) as the headset shows it, with the game's
  soundtrack, to `artifacts/yappers.mp4`.
- `node scripts/look.mjs [name] [difficulty] [seed]`: screenshots of the scene.

## Layout

```
src/
  index.ts                  World, systems, the game
  yappers/rules.ts          seats, rules, judging, level generation (pure maths)
  yappers/yapper-mesh.ts    the Yappers' look and hats
  yappers/cards.ts          the rule cards (and portraits for the board)
  yappers/yapper.ts         Yappers as entities
  game/bus.ts               the bus
  game/game.ts              starting levels, the score, sound hooks
  game/hud.ts               the departures board and the wrist panel
  game/pads.ts              the Easy / Medium / Hard / New crowd pads
  systems/seat-system.ts    sitting, bumps, judging the rules, scoring
  systems/yapper-system.ts  breathing, blinking, moods, the bounce, the cards
  systems/rest-system.ts    Yappers land where they are let go
  systems/hover-system.ts   the ring under what a pinch would take
  audio/soundscape.ts       music and effects, live and offline
  scene-assets/             the room, the table and the bus stop (also for the editor)
```
