# Knife demo

A small IWSDK (Meta's Immersive Web SDK, WebXR) app for Quest 3 / 3S,
**hands only, no controllers**: a chef's knife lies on the floor next to a
small table with an apple on a cutting board. Bend down, pinch the knife's
handle to pick it up, and slice down through the apple: it falls in two.

- **Grabbing with bare hands**: the knife carries IWSDK's
  `OneHandGrabbable`. IWSDK's `GrabSystem` turns a hand-tracking pinch near
  an object into a grab, so no controller is needed.
- **Gloves**: your tracked hands show as solid gloves instead of IWSDK's
  default white outline (`GloveSystem`).
- **Holding like a real hand**: while you hold the knife, the glove stops
  copying your fingers and closes in a hammer grip around the handle. The
  fingers wrap it and the thumb closes over them. This "hand grab pose" is
  computed from the hand model's own skeleton and seated on the handle.
  When you let go, the glove follows your fingers again.
- **Cutting** (`SliceSystem`): the knife's edge has to come down through
  the apple from above. The apple then splits along the blade's plane: the
  halves part, tip over cut face up, and a little juice sprays out.
- **Letting go** (`KnifeRestSystem`): the knife drops onto whatever is
  under it (the board, the table or the floor) and lies flat.

## Run it

```bash
cd knife-demo
npm install
npm run dev
```

On the Quest (same Wi-Fi as your computer), open the `network` HTTPS URL
that `npm run dev` prints in Quest Browser and accept the certificate
warning. Or over USB: run `adb reverse tcp:8082 tcp:8082`, then open
`https://localhost:8082/`. Press Enter XR, put the controllers down and
use your hands.

## Record the demo video

With the dev server running: `npm run record` writes `artifacts/knife.mp4`.
The video shows the headset's view in IWER (IWSDK's browser XR emulator):
Quest 3 field of view, no captions, with the head and hands moved the way a
user would move them.

## Layout

```
src/scene-assets/kitchen.scene-asset.ts  knife, apple, side table + board (built in code)
src/scene-assets/room.scene-asset.ts     the room: plank floor, walls, window
src/slicing/apple-half.ts                an apple half with its cut face
src/systems/slice-system.ts              the cut, the falling halves, the juice
src/systems/glove-system.ts              gloves, and the grip round the handle
src/systems/knife-rest-system.ts         a let-go knife drops and lies flat
src/lighting.ts                          daylight and shadows
public/scenes/main.iwsdk.scene.json      where everything stands
scripts/record-knife.mjs                 the recording (scripts/lib/headset.mjs drives IWER)
```
