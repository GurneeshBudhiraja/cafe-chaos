# Meta Notes (working name)

A spatial notes app for Meta Quest 3 / 3S: capture the room, annotate it, and
keep notes near their useful context. Built with TypeScript and Meta's
Immersive Web SDK (IWSDK) on WebXR. "Meta Notes" is a placeholder name and does
not imply Meta affiliation.

The application lives in [`app/`](app/README.md). Start there for run commands
and the source layout.

## Recorded versions

| Tool | Version |
| --- | --- |
| @iwsdk/core, @iwsdk/cli, @iwsdk/vite-plugin-dev | 1.0.1 |
| Three.js (super-three, via IWSDK) | r181 (0.181.0) |
| IWER emulator | 2.6.0 |
| @pmndrs/uikit | 1.0.77 |
| Vite / TypeScript | 7.3.7 / 5.9.3 |
| Node.js / npm (cloud dev container) | 22.22.0 / 10.9.4 |

## Status

All results below come from desktop Chromium and the IWER emulator. **Nothing
has been tested on a physical Quest yet.** Headset checks are tracked
separately and remain open.

### Phase 1, day 1 (roadmap: 17 October)

| Check | Result | Evidence |
| --- | --- | --- |
| Clean launch | Pass | No console errors or warnings after a fresh reload |
| Tablet with pen interaction | Pass | Mouse and simulated-hand pinch strokes commit in page coordinates |
| Simulated hand selects the tablet | Pass | IWER hand ray hovers the tablet; pinch-select and pinch-drag create ink |
| Tablet moves only through its handle | Pass | Pinch-grab on the handle moves the tablet by the same offset; no ink while moving |
| Ink stops at the page edge | Pass | A stroke that leaves the page ends at the edge |
| Camera trial produces a still | Pass (desktop) | `npm run smoke:camera` captures 1920x1080 from Chromium's fake camera |
| Optional feature checks with fallbacks | Pass | Panel reports camera, hands, surfaces, anchors; app works when absent |

### Phase 1, day 2 (roadmap: 18 October)

| Check | Result | Evidence |
| --- | --- | --- |
| Note list, create, open | Pass | Notes panel lists notes (5 per page), opens on select, highlights the active note |
| Rename and typed text | Pass | Title and text fields save through autosave |
| Strokes saved locally | Pass | IndexedDB; status shows Saving, Saved, or Save failed |
| Note with text and strokes survives 5 reloads | Pass | `npm run smoke:notes`: 5/5, tablet re-renders every stroke |
| Simulated save failure keeps the note | Pass | Error shown, stroke kept on screen, saved after "Try saving again" |
| Delete needs confirmation | Pass | Cancel keeps the note; confirm deletes only that note |

### Open items

- Headset: Quest outward-camera access, hand-tracking quality, system keyboard
  focus on the UIKit text fields, readability, and frame rate.
- XR panel clicks with simulated hands were not checked separately (the same
  IWSDK pointer path was checked with the mouse and with hand rays on the tablet).
- Pen-tip proximity feedback and stroke smoothing arrive with pen tools (19 October).
- Browser storage is not a backup; export and restore arrive on 23 October.

### Run the checks

```sh
cd app
npm install
npm run dev            # in one terminal
npm run typecheck && npm run build
npm run smoke:notes    # notes, reloads, save failure, delete
npm run smoke:camera   # camera capture with a fake camera
```
