# Café Chaos — 3D models: start here

**For:** the AI agent that builds the Café Chaos game.
**What this folder is:** the game's **3D models**, made in Blender and exported as `.glb`. The art pass is under way: models 01–04 and 11 (the three guest species and their accessories) are **final art** (a cozy Japanese garden café); the others are still **grey-box placeholders** at their final sizes, so the game can be built and played now. Also here: a tiny test app that checked the sizes with simulated hands.
**Read first:** `docs/game-brief.md` (the owner's game brief), then this file.

## 1. The game in one paragraph

A tiny café sits on the player's real table. Guests arrive at the door, each with a demand (a quiet spot, by the window, the front, the back, next to a friend, not near someone).
- **Seating:** the player pinches a guest, carries them, and lets go over a seat.
- **Food:** it arrives and is eaten on its own.
- **Cleaning:** when guests leave, their table is dirty until the player taps it and the janitor cleans it.
- **Scoring:** a guest's mood sets their review; reviews set the café's rating; money buys unlocks.

It is hands only and seated, built with IWSDK (WebXR) for the Quest 3/3S and Meta's VR Glasses. The competition entry is due **Nov 18, 2026, 12:00 PM PT**.

## 2. What is in this folder

| Path | What it is |
|---|---|
| `models/NN-<name>/` | One model per folder: `<name>.glb` plus an `INTEGRATION.md` (size, anchors, how to use it). |
| `models/01-cafe-shell/blender/cafe-shell-art.blend` | Blender source for the **final-art** models: scenes `CafeShellArt`, `TableTwoArt`, `TableFourArt`, `BenchArt`, `GuestArt`, `AccessoryArt`, plus `Showroom` (all of them side by side). Textures are packed; copies are in `models/01-cafe-shell/blender-textures/`. |
| `models/_blender/cafe-greybox.blend` | The Blender source for the grey-box models: scene `CafeGreybox`, one root empty per model. It does not include the sample layout. |
| `test-app/` | Grey-box test only, **not the game**. A minimal IWSDK app that puts a sample café on the detected desk and lets a tracked hand pinch a guest into a seat. |
| `docs/game-brief.md` | The owner's game brief. |

| # | Model | Purpose |
|---|---|---|
| 01 | `cafe-shell` | **Final art:** the Japanese garden café — 92×62 cm garden base, 70×46 cm café room, entrance gate on the right (+X). See its INTEGRATION.md; it replaces the grey-box shell. |
| 02 | `waiting-bench` | **Final art:** timber bench with an indigo cushion, four waiting slots 4.6 cm apart; sits on the shell's `BenchSpot`, facing the player |
| 03 | `table-2` | **Final art:** chunky square table, two short slat-back chairs, sakura-pink cushions |
| 04 | `table-4` | **Final art:** rectangular table with two segmented sofa benches (2 seats each), indigo |
| 05 | `window-booth` | **Unlock:** a booth for four against the windows (`seat_tags: window`) |
| 06 | `quiet-corner` | **Unlock:** an armchair behind a plant screen (`seat_tags: quiet`) |
| 07 | `bar-2` | **Unlock:** a counter with two stools (`seat_tags: solo,pair`) |
| 08 | `table-big` | **Unlock:** a long table for six (`seat_tags: group`) |
| 09 | `table-mess` | The dirty-table state |
| 10 | `meal` | The food that arrives |
| 11 | `guest-mochi`, `guest-onigiri`, `guest-tofu` + `accessories` | **Final art:** three snack-spirit species (ball, rounded triangle, rounded square) on one shared rig: standing and seated poses, 8 clips (`Idle`, `Walk`, `Lifted`, `SitHappy`…; `Walk` is a real gait walked in place, the game moves the root), 5.9–6.7 cm; plus 13 hats, glasses, bows and outfits that hang on their attach points. `guest.glb` = a copy of the mochi one |
| 12 | `guest-kid` | Child guest, 4.16 cm |
| 13 | `janitor` | The janitor with cap and mop |
| 14 | `demand-bubble` | Speech bubble with an `IconSlot` |
| 15 | `mood-ring` | Mood indicator around a guest's feet |
| 16 | `seat-glow` | Marks the valid or best seat while carrying |
| 17 | `coin` | Money |

The **second janitor** unlock reuses `janitor`. The **rating meter**, end-of-shift card and other panels are UI (UIKitML), not models.

## 3. Rules shared by every model

- **Units and axes.** Units are metres. +Y is up, and the front faces **+Z** (toward the player). Each model's origin is at its bottom centre, where it stands.
- **Root node.** It is named after the model (`table-2`, `guest`, …). `AssetManager.getGLTF(id).scene` gives a fresh copy each time.
- **Anchors** are empty nodes the game reads, and each name is unique within its model:
  - `Seat-N`: where a guest sits;
  - `Slot-N`: where a waiting guest stands;
  - `Meal-N`: where the food goes;
  - `TableTop`: where the mess goes;
  - `Grip`: where a guest is pinched;
  - `BubbleAnchor` and `MoodAnchor`: where the bubble and mood ring hang;
  - `Entrance` and `BenchSpot`: on the café shell.
- **To put a guest on a seat or slot, copy the anchor's world position and rotation onto the guest.** The anchor is turned so the guest then faces the table (or, for a slot, away from the bench back). The guest's origin is at its feet; its `Seated` pose's origin is at the hips, which is the seat's top.
- **Seat tags.** Seat models carry glTF extras on their root: `seat_count`, plus `seat_tags` on the unlocks. The game decides "front", "back" and "quiet" from where it places tables in the café: the front row is nearest the door and the player.
- **Guests have two poses:** `Standing` and `Seated` groups. Both are visible in the file, so hide one when the guest loads. Every guest species shares the same node names, clips and attach points (`St-`/`Se-` + `HeadTop`, `Face`, `Neck`, `Chest`), so one piece of guest code serves all of them; accessories parent onto those attach points (see `models/11-guest/INTEGRATION.md`).
- **Flat grey-box materials** (named `GB_*`, plus `GuestBody`, `GuestHead`, `JanitorBody`, `SeatGlow`, `MoodRing`). Clone a material before tinting it per guest; glTF copies share materials.
- **Budget:** the whole café with every model is about 16,000 triangles, well under budget for Quest at 72 fps.

## 4. Why these sizes (hand tracking needs them)

Hand tracking is accurate to about 1 cm, and the player is seated, so:
- **The café room is 70 × 46 cm** (on a 92 × 62 cm garden base, since the art pass). Placed with its centre about **35 cm** out from the eyes, the back-row seats stay within comfortable seated reach; only the decorative garden rim goes further.
- **Guests are 5.9–6.7 cm tall** (ball, triangle, square species, with proper three-part legs; kids 4.16 cm): big enough to pinch, and about 6–7° tall at desk distance.
- **Seats are at least 3.2 cm apart** (4.5 cm in the current layout, 4.6 cm on the bench), so a dropped guest lands on the seat the player meant. The test pick-up radius was 3 cm around `Grip`, and the drop radius 4 cm.
- **The furniture is chunkier than real life** (tables 4.6–5.4 cm across, seat tops 1.6 cm up) so it stays readable and tappable at this scale.

## 5. What was tested (in IWSDK's emulator, simulated hands)

`test-app/scripts/check-sizes.mjs`:

| Check | Result |
|---|---|
| The café lands on the emulated desk (plane detection) | Yes |
| Guest height at desk distance | 5.1° (kid 3.6°) |
| Closest two seats or slots | 3.2 cm |
| Pinch a guest off the bench, carry it to a chair, let go | Picked up, the seat glowed, the guest sat in the `Seated` pose |
| Let go over empty floor | The guest went back to their bench slot |
| Console errors | None |

Screenshots are in `test-app/artifacts/`.

**Three lessons for the game, found in testing:**
1. **When the player lets go, hold the guest still while the fingers open.** The point between thumb and index jumps as they separate, which threw the guest off the seat before release. In the test app: once the thumb-to-index gap is over 1.5 cm, stop moving the guest; drop it when the gap passes 3 cm.
2. **The demand bubble must turn to face the viewer.** Hung on a guest seated sideways, it is otherwise seen edge-on.
3. **Place the café closer than the notes app placed its tablet.** The copied desk-placement code (`test-app/src/lib/desk-placement.ts`) put the café's centre about 51 cm out, with the back edge at 67 cm, too far to reach. Aim for about 35 cm.

**To run the test app:**

```sh
cd test-app
npm install
npx iwsdk dev restart --foreground --no-open
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/check-sizes.mjs
```

Wait for "Runtime ready" before running the check. If Playwright has its own Chromium installed, leave out `CHROMIUM_PATH`.
- `test-app/src/cafe-test-system.ts`: placement and pinch-carry-drop, about 200 lines. Use it as a reference, not as the game's code.
- `test-app/src/lib/`: helpers copied from the owner's earlier IWSDK project (desk placement, pinch reading).
- `test-app/public/envs/meta-studio.hdr`: a studio light for the models.

## 6. Lighting the game (the recipe)

The art models carry their own glow (shoji walls, lanterns) and baked contact
shadows, but the overall mood comes from the game's ambient light:

- **Use a warm golden-hour HDR as `scene.environment`** (equirectangular, set
  `EquirectangularReflectionMapping`). The test app wires one up in
  `test-app/src/index.ts` with `test-app/public/envs/warm-cafe.hdr` — copy both.
- **No real-time shadow maps** (a WebGL shadow-sampler bug on Quest broke a demo
  at the IWSDK workshop); the models' baked AO skirts do that job.
- No extra lights are needed; if a scene reads too dark, raise
  `scene.environmentIntensity` rather than adding lamps.

## 7. Not done yet (the art pass and the game)

- **The art style is chosen: a cute, cozy Japanese garden café** (models 01–04 set it). Models 05–17 still need their art pass in that style; guests will be cute little round bot-like creatures with stubby hands and legs. **Everything must look clearly unlike _Is This Seat Taken?_**, the game that inspired the mechanic (2D, round cute characters on cream). Only the general seating mechanic carries over; the characters, art, name and wording must be original.
- **Final models must keep each grey-box model's size, origin, facing and anchor names,** so the game code keeps working. Then they need real materials and baked shadows. Do not use real-time shadow maps: a WebGL shadow sampler bug on Quest broke a demo at the IWSDK workshop. Use KTX2 texture compression where textures are large.
- **Demand icons** (window, quiet, front, back, friend, not-near) for the bubble's `IconSlot` are not made.
- **No animation:** no walking, eating or cleaning, and the janitor's mop is static. Guests and the janitor are single rigid poses.
- **Decor unlocks** (cosmetic, later in the brief) are not made.

## 8. How the owner likes to work

- **Work in phases.** After each one, stop, give a short plain-language summary with screenshots, and wait for the owner's go-ahead.
- **Change only what was asked;** mention other things instead.
- **Do not push, open pull requests or merge unless asked.** Never put AI model names in commits.
- **Ask when unsure about anything that changes the look or feel,** with a recommendation.
