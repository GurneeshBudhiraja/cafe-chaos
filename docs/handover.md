# Handover: Meta Notes

**For:** the next AI agent working on this project.
**Read with:** [`asset-brief.md`](asset-brief.md), the detailed brief for the next five assets. This file is the context around it: what the project is, what was built in the previous sessions, every decision the owner made and why, how the owner likes to work, what's broken or unfinished, and what to do next.

Read both files fully before touching code. Then read `app/README.md` and `app/AGENTS.md`.

---

## 1. The project in brief

- **What:** a spatial note-taking app for **Meta Quest 3 / 3S**, running as a WebXR app in the Meta Quest Browser.
- **Built with:**
  - Meta's **Immersive Web SDK (IWSDK) 1.0.1**, TypeScript, Vite.
  - UIKit / UIKitML for the panels, Three.js (re-exported from `@iwsdk/core`).
- **Name:** "Meta Notes" is a **placeholder**. It can't ship with Meta's name in it.
- **The vision** (in the owner's words, paraphrased):
  - A student sits in a classroom wearing a Quest.
  - The headset finds the flat surfaces, and a tablet appears **lying on their real desk like an iPad**, with a pen next to it.
  - They **pick up the pen with a pinch and write like on a real pad**, "not using gestures, but by holding a real pen".
  - Later they can switch to typing on a keyboard on the desk, and move or tilt the tablet with natural gestures.
- **Owner:** Gurneesh (GitHub `GurneeshBudhiraja`), building it for a hackathon. The owner is in Canada.
- **Hardware:** the owner is **buying a Quest 3S** to test on, and will use it with **hands only, no controllers**.
  - Nothing has been tested on a physical headset yet. Everything so far was verified in **IWER** (IWSDK's browser emulator of a Quest 3 with simulated hands).
  - The previous agent told the owner, about the Quest 3S:
    - Hand tracking, pinch, passthrough and desk detection all work.
    - It **has no depth sensor**, so the desk may need to be **added by hand in Space Setup**.
    - Hand tracking must be turned on (Settings → Movement tracking → Hand and body tracking).
    - The controllers are needed only for the first-time headset setup.
    - Open the dev server's `network` HTTPS URL in Quest Browser on the same Wi-Fi.
    - Handwriting may be a bit shakier than in the emulator.

## 2. Repository and branches

- Repo: `GurneeshBudhiraja/meta-hack`. The app is in `app/`; the root `README.md` has an older status log.
- **Active branch: `design/recent-show-all`**, pushed, **no pull request opened yet.** All of the previous session's work is on it.
  - The latest commit is `7ec050b`, "Recorder pen rises 6 cm before its first stroke, clear of the page".
- `chore/isolate-classroom` is pushed with no PR. The owner **hasn't decided** whether it joins the `design/recent-show-all` PR. Ask before merging it in.
- `claude/modest-johnson-0upjq7` was the session's system-designated branch, but the owner's work continued on `design/recent-show-all`. Keep working there unless told otherwise.
- Other branches (`design/first-screen`, `design/recent-templates`, `claude/meta-notes-next`, `Charan/*`) are older work. Leave them alone.
- **Do not open a PR unless the owner asks.** Opening the PR for `design/recent-show-all` is on the "maybe next" list (section 8).

## 3. What exists today (the whole feature set)

See `app/README.md` → "What the app does today" for the user-facing version.

| Area | What it does | Key files |
|---|---|---|
| Dock | Four floating glass buttons (Settings, Templates, Recent, New note) at eye level, about 85 cm out. It's the only thing visible at launch. Recentering the headset brings it back. Stick mode (it follows your view) is on by default. | `src/systems/compact-dock-system.ts`, `public/ui/compact-dock.uikitml` |
| Panels | Recent, Templates and Settings each **crossfade in place** of the dock's buttons. They shrink to fit 50° of the view's height: Show all is at about 56% scale, Recents 62%, Settings 72%, and the smallest text stays about 1.3° tall, which is readable. | the same files |
| Recent / Show all | The latest six notes as cards with real ink previews. Show all is a scrolling grid with time filters ("this week" and so on) and sorting. | `src/ui/all-notes-grid.ts`, `src/ui/note-filters.ts` |
| Templates | Six papers: Blank, Lined, Grid, Dotted, Cornell, Checklist. | `src/ui/paper-preview.ts` |
| Settings | The stick-mode switch, plus Google Drive and Microsoft "Connect" buttons, which answer "Coming soon". | |
| Toasts | One slim line at the top of the view. It **always keeps a 3° gap above the dock** when the dock is in front, after the owner complained about the toast touching the dock. | `src/systems/toast-system.ts` |
| Note view | New note, a template, or a Recent card fades the dock away. The **tablet fades in lying flat on the nearest real desk**, or floats ahead with no desk. A glass **note bar** (title, paper type, X) stands just past the tablet's far edge. The X closes the page, and the dock returns. | `src/systems/note-view-system.ts`, `src/ui/note-view.ts`, `src/ui/note-actions.ts`, `public/ui/note-bar.uikitml`, `src/ui/mesh-fade.ts` |
| Desk detection | Uses WebXR plane detection: the tables and desks from Quest's Space Setup. It picks the nearest horizontal table or desk 15 cm–1 m below the eyes, within 1 m reach and 60° of straight ahead. The tablet lands 40 cm out and is moved 20 cm in from the desk's edges. | `src/ui/desk-placement.ts` |
| Pen | Lies beside the tablet's right edge. A pinch (thumb and index tips under 1.5 cm apart) within 5 cm of it picks it up. It sits in the pinch from the web of the thumb to 3 cm past the fingertips. Ink flows while the nib is within 3 mm of the page, and stops once it lifts past 6 mm. It never goes through the page. Opening the pinch (over 3 cm) glides it back. **Tracked hands only** (no controllers yet). | `src/systems/pen-system.ts`, `src/systems/ink-system.ts`, `src/ui/pen-state.ts`, `src/scene-assets/stylus.scene-asset.ts` |
| Storage | Notes in IndexedDB; preferences in localStorage. There is no sync or backup. | `src/notes/` |
| Classroom (dev only) | A procedural 3D classroom used for desktop views and the recordings, placed with `demo.showClassroom(...)` in `src/util/dev-hooks.ts`. It's hidden in XR. | `src/scene-assets/classroom-*.ts` |

## 4. Decisions the owner made (do not reopen without asking)

**Look and motion**
- **Panels fade in place.** The owner: "the appearing / disappearing of the window should happen like its fading into or away in the screen, not like jerky animations coming in from different angles." **No sliding, flying in or glides.**
- **There should always be a gap** between the toast and the dock.
- **Theme:** "calm and studious": dark warm smoked glass, warm-white text, **one clay accent `#d4704f`**, warm white paper, and the Bricolage Grotesque and Fraunces fonts. Full palette in `asset-brief.md` §2.
- **Panels must be readable.** WebXR apps size their own panels; Horizon OS only sizes 2D app windows. Panels shrink to fit the view, with the minimum text at about 1.3° tall.

**The desk flow** (brainstormed with the owner; their answers)

| Question | Answer |
|---|---|
| Where does the tablet go? | **Automatically on the nearest desk.** |
| What angle? | **Flat at first.** The owner: "with the option ... to move it anywhere ... and tilt it using the natural gestures." (This is phase 2.) |
| How do you type? | **Our own keyboard on the desk**, not the system keyboard. (This is phase 4.) |
| What if there's no desk? | **Float in front.** |

**The pen**
- "Hold the pen and be able to write like writing on a real pad. Not using gestures, but by holding a real pen, using a pinch, and then writing on it."
- The pinch is read from the hand joints, not from pointer "select" events.

**The phases agreed with the owner**
1. Desk placement: **done.**
2. Move and tilt with natural gestures: **not started.**
3. Pen: **done.**
4. Typing mode (keyboard on the desk, plus a writing/typing switch): **not started.**
   - The original plan had a toggle *on the pen*. In the asset discussion the previous agent recommended a switch on the **note bar** instead; it's listed in the brief's "not building".
   - The owner said "sure" to the shortlist, but **confirm the switch's location when phase 4 starts.**
5. Polish (remember the tablet's spot, plus a tour): **not started.** The tour is now planned as small one-time tip cards (asset 5).

**Assets**
- The owner asked which assets "make the most sense" and accepted this shortlist, in this order:
  1. The nib shadow.
  2. The tablet edge glow.
  3. The desk keyboard.
  4. The app icon.
  5. The tip cards with hand-gesture icons.
- Dropped: a tilt stand, the pen toggle band, the old tablet handle, the push pin and washi tape, the five sticky-note colours, the tool wheel, the polaroid and viewfinder, and extra sounds.
- **All of this is specified in `asset-brief.md`.**

## 5. How the owner likes to work (important)

- **Phases with pauses.** After each phase, stop. Give a **short summary** (with screenshots or a video), and **wait for the owner to agree** before continuing. Never start the next phase on your own.
- **"Only worry about the changes that I asked for."** No unrequested refactors or side changes. Mention them instead.
- **Code style:** modular and explainable, with descriptive names and proper but not excessive comments (the *why*, in plain language).
- **Use IWSDK's own features** where they exist (ECS systems, `createSystem`, UIKitML, scene JSON, the skills in `app/.claude/skills/`).
- **Commit and push often.** Commit messages are short, plain, present-tense sentences ("Pick up the pen with a pinch and write with its nib").
  - **Never put AI model names or IDs in commits.**
  - Previous commits ended with the attribution trailer the harness supplies; keep doing whatever your environment specifies.
  - A stop hook in this environment insists that uncommitted changes get committed and pushed.
- **Videos the owner asks for:**
  - Headset-faithful, in the Quest 3 field of view.
  - **No captions or overlays.**
  - The head looks **straight ahead like a real person**, or naturally down at a desk. No odd camera angles.
  - When writing, behave like **"a student taking notes on an iPad in a real classroom"**: write small and neat on the lines, glance up at the board between lines, then put the pen down.
- **Plain-language answers.** The owner asks practical questions (for example "will the Quest 3S work?" or "can I use it without controllers?"). Answer directly, with any caveats.
- When unsure about taste or product direction, **ask**. Give a recommendation, not a survey.

## 6. How to run, test and record

From `app/`:

```sh
npm install
npm run dev            # CLI-managed dev server + managed Chromium with IWER
npm run typecheck      # before every browser check
npm run build
npm run record:tour    # tour of the home (dock and panels)
npm run record:desk    # classroom: New note → pen pickup → write → close → reopen (artifacts/desk.mp4)
npm run record:flow    # whole flow, about 136 s of video (artifacts/flow.mp4); takes about 10 minutes to record
npm run smoke:notes    # OUTDATED: see section 7
```

Practical notes from the last session:
- **Dev server in the cloud container:**
  - Start it with `npx iwsdk dev restart --foreground --no-open`, **in the background**.
  - Wait for it with `until grep -q "Runtime ready" <logfile>; do sleep 2; done`.
  - Background commands there are **killed after at most 2 hours**, so restart when needed.
  - **New `.uikitml` files or changes to `src/assets.ts` need a dev-server restart.**
- **Recordings:**
  - Run long recordings in the **background**; `record:flow` exceeds the 10-minute foreground limit.
  - The emulator renders at about 7–9 fps, and the recorder speeds the video up about 3.5×, so motion is choppier than on a headset.
- **The recorder library** is `scripts/lib/headset-recorder.mjs`:
  - `tap` (220 ms pinch; don't lengthen it, because the ray drifts off small buttons).
  - `tapUntil` (retry).
  - `pickUpPen`, which approaches from the right and above so the pen is visible.
  - `penWrite`, with arc-length pacing so low fps doesn't make strokes jagged, 1 cm hops between strokes, and a 6 cm rise before the first stroke.
  - `putDownPen`, which lifts 5 cm before returning so no diagonal line is drawn.
  - `moveHandTo`, `pinchPoint` and `handPosition`.
- **IWER remote control** (from the scripts):
  - `set_transform` takes a position plus an orientation quaternion.
  - Also available: `get_transform`, `look_at` and `set_select_value`.
  - Its pinch closes the fingertips to about 1 mm.
  - When a hand is close to UI, IWSDK switches from the ray to **touch**. So move the hand back (to the recorder's `HAND_REST`) before tapping the X.
- **Seeded data:** `record-flow.mjs` seeds 9 notes (4 backdated) for the Recent and Show all shots.

## 7. Known issues and gaps

| Issue | Notes |
|---|---|
| `smoke-notes.mjs` is outdated | It predates six Recents, Show all, the filters and the note page. Update it before relying on it. |
| The pen works only with tracked hands | Controllers can't pick it up. A ray can still draw on the page. |
| The hand's blue pointer ray stays visible while holding the pen | An offered fix: hide the ray while the pen is held. **Not done, not yet requested.** |
| Lined-paper rules are invisible at video resolution | They show in close stills. |
| An earlier unexplained dashed artefact in Show all | The cause was never found; it hasn't reappeared. |
| `npm run record:writing` not updated for the note page | `record:desk` and `record:flow` replace it. |
| Camera capture and XR-status systems are not registered | `smoke-camera.mjs` can't pass. |
| The old full home window is parked (hidden) | It still raises the save-failure toast. |
| Desk detection on the Quest 3S | No depth sensor, so the user may need to add the desk in Space Setup. **Untested on hardware.** |
| No app icon | `index.html` has an empty favicon. This is asset 4. |

## 8. What to do next

The owner's latest direction was the asset shortlist, then "create a doc ... to provide to another agent". So:

1. **Read `asset-brief.md`** and start with **Asset 1 (nib shadow)**, then **Asset 2 (edge glow)**.
   - These two go naturally with **phase 2 (move and tilt)**, which the edge glow prepares for.
   - Before building phase 2's actual grab, move and tilt behaviour, **confirm the scope with the owner**: whether they want the full gesture system now or only the glow.
2. **Pause after each asset**: a summary plus screenshots, then wait for approval.
3. Later, when the owner asks:
   - Phase 4 (typing mode with the desk keyboard).
   - Phase 5 (remember the tablet's spot, tip cards).
   - The app icon and name.
   - Opening the PR for `design/recent-show-all`, and whether `chore/isolate-classroom` joins it.
   - Updating `smoke-notes.mjs`.
   - Hiding the hand ray while the pen is held.
   - Controller support for the pen.
4. When the owner's Quest 3S arrives, they may want a **first-run walkthrough** on the headset:
   - Same Wi-Fi as the computer, the `network` HTTPS URL, accepting the certificate.
   - Hand tracking turned on, the desk added in Space Setup.
   - The `iwsdk-native-xr-test` skill covers driving a real headset.

## 9. Where things are

```
README.md                       old status log (phase 1 checks)
docs/handover.md                this file
docs/asset-brief.md             the next five assets, in detail
app/README.md                   current features, run commands, source layout, design rules
app/AGENTS.md                   IWSDK project rules (read first)
app/iwsdk.config.json           project authority (scene, assets, components, XR features)
app/public/scenes/main.iwsdk.scene.json   scene: compact-dock, home-window, toast, tablet, note-bar
app/public/ui/*.uikitml         panels: compact-dock, note-bar, toast, tools-panel, home-window
app/src/index.ts                World.create and system registration (order matters: PenSystem before InkSystem)
app/src/assets.ts               asset manifest
app/src/scene-assets/           procedural 3D models (tablet, stylus, classroom, ...) and materials
app/src/systems/                dock, note view, pen, ink, toasts, follow, tweens, ...
app/src/ui/                     helpers: theme, liquid glass, desk placement, pen state, note view state, fades
app/scripts/                    recorders and smoke tests (Playwright + IWER)
```
