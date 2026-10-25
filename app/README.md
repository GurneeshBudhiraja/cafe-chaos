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
npm run smoke:notes  # notes, 5 reloads, save failure, home window (dev server running)
npm run smoke:camera # camera capture with a fake camera (dev server running)
```

The smoke scripts launch their own Chromium. Set `CHROMIUM_PATH` if Playwright
cannot find a browser. Add `?simulateSaveFailure` to the app URL to make every
note write fail (for checking error handling by hand).

`npm run dev` prints the runtime URLs. On a Quest on the same network, open the
`network` HTTPS URL in Meta Quest Browser and accept the local certificate.

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
src/scene-assets/              procedural 3D assets (tablet, handle)
src/notes/                     note model, IndexedDB store, editing session (autosave)
src/ink/                       stroke sampling rules and stroke rendering
src/systems/                   ECS systems (ink, home window, tablet handle, camera, XR status)
src/ui/                        UIKitML panel helpers and text formatting
src/util/                      dev-only logging and test hooks
scripts/                       automated smoke checks (Playwright)
```

## Design rules

- Strokes are stored in page coordinates (0..1), never world meters, so moving
  or tilting the tablet never changes saved ink.
- Writing and moving are separate: the tablet takes ink; only its handle moves it.
- Every device feature (camera, hands, surfaces, anchors) is optional. The app
  reports what the session granted and stays usable without it.
- The camera opens only after a user action and stops after a capture.
- A failed save never discards work: the note stays in memory, the panel says
  so, and the next edit or "Try saving again" retries.
- Note content is stored separately from any room placement (placement comes
  later), so a missing room anchor can never remove a note.
