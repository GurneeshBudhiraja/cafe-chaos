# Meta Notes app

Spatial notes for Meta Quest 3 / 3S, built with Meta's Immersive Web SDK
(IWSDK). This is a Vite + TypeScript project, but `iwsdk.config.json` (not
`vite.config.ts`) is the project authority for the scene, assets, components,
and XR features. Read `AGENTS.md` before changing project structure.

## Run

```sh
npm install
npm run dev          # CLI-managed dev server + managed browser (IWER emulator)
npm run typecheck    # always run before testing in the browser
npm run build        # production build into dist/
npm run smoke:notes  # notes, reloads, save failure, the dock and its panels (dev server running)
npm run record:tour -- <360-photo.jpg>  # headset-view video of the home into artifacts/tour.mp4
npm run check:tool-wheel   # tool wheel check, screenshots in artifacts/tool-wheel/ (~12 min)
```

The smoke and recording scripts launch their own Chromium. Set `CHROMIUM_PATH` if Playwright
cannot find a browser. Add `?simulateSaveFailure` to the app URL to make every
note write fail (for checking error handling by hand).

`npm run dev` prints the runtime URLs. On a Quest on the same network, open the
`network` HTTPS URL in Meta Quest Browser and accept the local certificate.

## What the app does today

- **Home:** the dock, a row of floating glass buttons (Settings, Templates,
  Recent, then New note at the right end). It is the only screen at launch:
  entering XR places it about 85 cm out, straight ahead at eye level, and a
  headset recenter brings it back there. Open panels shrink if needed to fit
  50 degrees of the view's height, so nothing needs a look up or down. Stick mode (it follows your view) is
  on by default.
- **Panels:** Settings, Templates and Recent each open a glass panel. While
  one is open the dock's buttons fade away and the panel takes their place,
  where you are already looking; its close button (or picking an item)
  brings the buttons back.
- **Recent:** the latest six notes, each with its ink, title and when it
  was edited. Its Recents / Show all toggle switches to a scrolling grid of
  every note, filtered by when it was edited and sorted by date or title.
- **Note page:** New note, a template, or a note picked from Recent opens
  it on a tablet lying flat on the desk in front of you, like an iPad on a
  table: the nearest table or desk that Quest knows from Space Setup,
  within reach and below your eyes. With no desk it floats straight ahead,
  a little below eye level and facing you. It shows the note's paper and
  ink, with its title and a close button in a bar just beyond it. The dock fades away while it is open; closing it brings the
  dock back.
- **The pen:** it lies beside the tablet's right edge. Pinch next to it with
  a tracked hand to pick it up: it sits in the pinch like a real pen, from
  the web of the thumb to just past the fingertips, and ink flows while its
  nib touches the page (the nib rests on the page, never through it). Open
  your fingers for a moment and it goes back beside the tablet. Without the
  pen in hand, a ray (pointer) can still draw on the page.
- **The tool wheel:** while holding the pen, double-tap it (open and close
  the holding fingers twice, quickly) or pinch with the other hand. A wheel
  opens beside the pen with seven segments: Pen, Marker, Highlighter,
  Eraser, Lasso, Undo and Redo, with the current tool's colours and sizes
  around it.
  - **Aiming:** slide the pen above the page (away from you for the top,
    toward you for the bottom); a dot shows the aim and the hub names it.
  - **Picking:** tap the pen once, or let go of the other hand's pinch.
    The wheel stays open for more picks; the hub, or writing again,
    closes it.
  - **Tools:**
    - The **highlighter** draws see-through, under the writing.
    - The **eraser** removes whole strokes; its ring shows its size.
    - The **lasso** selects the strokes inside a loop; drag inside its box
      to move them, or pick Delete on its ring.
  - **Undo and redo** cover writing, erasing, moving and deleting.
- **Templates:** six papers (Blank, Lined, Grid, Dotted, Cornell, Checklist),
  each with a line on what it is for; picking one starts a note on it.
- **Settings:** the stick mode switch (remembered on this device) and Google
  Drive / Microsoft connections (not built yet: Connect answers "Coming
  soon").
- **Toasts:** one slim line at the top centre of the view for confirmations
  and a failed save (with "Try again").
- **First launch:** no note is created; one hint line points at New note.
- **Storage:** notes in IndexedDB and preferences in localStorage, both on
  this device. There is no backup or sync yet.

## Not wired up yet

- **The pen with controllers.** Only tracked hands pick up the pen so far;
  `npm run record:writing` has not been updated for the note page
  (`npm run record:desk` films the pen on a classroom desk).
- **Camera capture and XR status.** `camera-capture-system.ts` and
  `xr-status-system.ts` are kept but not registered in `src/index.ts`, so
  `smoke-camera.mjs` cannot pass until capture returns.
- **The full home window** (`home-window.uikitml`, `HomeWindowSystem`) is
  hidden and kept for a future "all notes" view; it still raises the
  save-failure toast.
- **3D assets** (stylus, tool wheel, sticky notes, push pin, washi tape) are
  registered in `src/assets.ts` but not placed in the scene.
- **Account connections, a light theme and handedness** are planned for
  Settings.

## Terms

- **XR**: an immersive WebXR session (headset view; passthrough in mixed reality).
- **IWER**: IWSDK's browser XR emulator. It simulates a Quest 3, its hands, and
  controllers, so XR flows can be tested on a desktop.
  See [Testing your experience](https://iwsdk.dev/guides/02-testing-experience.html).
- **ECS**: entity-component system. Entities are scene objects, components are
  data, and systems hold behaviour. See [ECS concepts](https://iwsdk.dev/concepts/ecs/).

## Source layout

```
iwsdk.config.json              project authority: scene, assets, components, XR features
public/scenes/main.iwsdk.scene.json   scene composition (placement only)
public/ui/*.uikitml            spatial UI panels (UIKitML)
src/index.ts                   World.create() and explicit system registration
src/assets.ts                  asset manifest (shared by runtime and editor)
src/components.ts              component manifest (shared by runtime and editor)
src/note-components.ts         app ECS component declarations (no systems)
src/scene-assets/              procedural 3D assets: tablet, stylus, tool wheel, sticky
                               notes, push pin, washi tape (shared theme materials,
                               paper grain); classroom backdrop for the desktop view
src/notes/                     note model, IndexedDB store, editing session (autosave)
src/ink/                       stroke sampling rules and stroke rendering
src/systems/                   ECS systems: dock, note page, pen, tool wheel, toasts, stick mode
                               (follow), tweens, home window (parked), ink, tablet handle, XR scroll fix
src/input/                     hand pinch reading and pen taps
src/ui/                        UI services and helpers: theme, liquid glass, toasts,
                               home mode, preferences, press motion, sounds, drag
src/util/                      dev-only logging and test hooks
scripts/                       smoke checks and headset-view recordings (Playwright, IWER)
```

## Design rules

- Strokes are stored in page coordinates (0..1), never world meters, so moving
  or tilting the tablet never changes saved ink.
- Writing and moving are separate: the tablet takes ink; only its handle moves it.
- Every device feature (camera, hands, surfaces, anchors) is optional. The app
  reports what the session granted and stays usable without it.
- The camera opens only after a user action and stops after a capture.
- A failed save never discards work: the note stays in memory, a toast says
  so, and the next edit or its "Try again" retries.
- Objects stay findable: dark objects get a light rim and key parts a soft
  glow, because dark colours disappear in a dim room and render transparent on
  see-through (additive) glasses.
- One thing at a time: a panel replaces any toast and, while it is open, the
  dock's buttons.
- Note content is stored separately from any room placement (placement comes
  later), so a missing room anchor can never remove a note.
