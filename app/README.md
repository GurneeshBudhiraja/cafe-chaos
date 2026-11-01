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
npm run check:stickies     # sticky notes check, screenshots in artifacts/stickies/ (~9 min)
npm run check:text-editor  # the typing editor's rules and layout, no browser (seconds)
npm run check:typing       # typing mode check, screenshots in artifacts/typing/ (~9 min)
npm run record:typing      # headset-view video of typing mode into artifacts/typing.mp4
npm run check:canvas       # infinite canvas check, screenshots in artifacts/canvas/ (~8 min)
npm run record:canvas      # headset-view video of the infinite canvas into artifacts/canvas.mp4
```

The smoke and recording scripts launch their own Chromium. Set `CHROMIUM_PATH` if Playwright
cannot find a browser. Add `?simulateSaveFailure` to the app URL to make every
note write fail (for checking error handling by hand).

`npm run dev` prints the runtime URLs. On a Quest on the same network, open the
`network` HTTPS URL in Meta Quest Browser and accept the local certificate.

## What the app does today

- **Home:** the dock, a row of floating glass buttons (Settings, Recent,
  then New note at the right end). It is the only screen at launch:
  entering XR places it about 85 cm out, straight ahead at eye level, and a
  headset recenter brings it back there. Open panels shrink if needed to fit
  50 degrees of the view's height, so nothing needs a look up or down. Stick mode (it follows your view) is
  on by default.
- **Panels:** Settings and Recent each open a glass panel. While
  one is open the dock's buttons fade away and the panel takes their place,
  where you are already looking; its close button (or picking an item)
  brings the buttons back.
- **Recent:** the latest six notes, each with its ink, title and when it
  was edited. Its Recents / Show all toggle switches to a scrolling grid of
  every note, filtered by when it was edited and sorted by date or title.
- **Note page:** New note (one pinch: there are no note types to choose,
  and every new note is a dotted canvas) or a note picked from Recent opens
  it on a tablet lying flat on the desk in front of you, like an iPad on a
  table: the nearest table or desk that Quest knows from Space Setup,
  within reach and below your eyes. With no desk it floats straight ahead,
  a little below eye level and facing you. It shows the note's paper and
  ink, with a bar just beyond it: the title, the canvas zoom, Write / Type
  and close. The dock fades away while it is open; closing it brings the
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
- **Sticky notes:**
  - **New:** five small stacks (yellow, mint, pink, blue, an index card)
    lie on the desk along the tablet's left edge. Pinch one with your free
    hand (or tap it with a ray) and a sticky note peels off and floats up.
  - **Writing:** write on it with the pen, as on the tablet. The tool
    wheel, eraser, lasso and undo work on it too.
  - **Sticking:** pinch it to carry it. Near a wall, desk or any surface
    Quest knows from Space Setup, it lies flat on it; let go to stick it
    there, or let go in mid-air to leave it floating.
  - **Throwing away:** while you carry one, a bin shows low in your view.
    Over it, the bin grows and opens; let go to drop the note in (the
    toast's Undo brings it back).
  - **Keeping:** sticky notes belong to the room: they show with or without
    a note open, and come back to the same spot next session (kept
    relative to the room's anchor), saved on the headset.
- **Typing mode:** the Write / Type toggle on the note bar.
  - **Type:** the tablet goes away; the page (with its handwriting) floats
    ahead of you, larger, with a formatting toolbar under it, and the
    headset's own keyboard (Meta Quest's system keyboard; Quest Browser
    26.1 or later) comes up. The caret waits just below the handwriting;
    tap anywhere on the page to type there instead (a new text box, as in
    Excalidraw), which also brings the keyboard back if it was closed, as
    does the keyboard button at the toolbar's left end.
  - **Keys:** Meta's keyboard types at the caret (suggestions included). A
    real (Bluetooth) keyboard types too, with Google Docs' shortcuts.
  - **Formatting:** the toolbar has Docs' main tools: undo and redo,
    Normal text and three headings, bold, italic, underline,
    strikethrough, bulleted, numbered and checklists, a quote, indent,
    alignment and clear formatting; buttons light up for the style at the
    caret. Enter continues a list and leaves it on an empty item; Markdown
    shortcuts work ("- ", "1. ", "[] ", "# ", **bold**, *italic*).
  - **Selecting:** drag across text with a ray; a quick double tap selects
    a word; a tap on a checklist's box ticks it.
  - **The page:** move it by the grab bar under the toolbar, resize it from
    its bottom corners. Write flies it back to the tablet; the typed text
    stays on the page with the ink, saved with the note.
- **Infinite canvas:** every page is a window onto an endless canvas, as
  in Excalidraw. Pinch the page with one hand and slide it to pan (with the
  pen in the other hand, the free hand pans); pinch it with both hands and
  move them apart or together to zoom around the point between them. The
  dots pan and zoom with the ink; the zoom shows on the note bar, and a tap
  on it glides back to the start. The view is saved with the note.
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
- **3D assets** (push pin, washi tape) are registered in `src/assets.ts`
  but not placed in the scene.
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
src/systems/                   ECS systems: dock, note page, pen, tool wheel, typing (text, Type
                               mode staging, toolbar), toasts, stick mode
                               (follow), tweens, home window (parked), ink, tablet handle, XR scroll fix
src/input/                     hand pinch reading, pen taps, pinch targets
src/text/                      typing: rich-text editor, layout, canvas rendering, key commands,
                               the headset's system keyboard
src/stickies/                  sticky notes: model, store, board, 3D object, surfaces, bin
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
