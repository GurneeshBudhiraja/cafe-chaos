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

Still open for this phase: Quest outward-camera access, pen-tip proximity
feedback (planned with pen tools), and real hand-tracking quality.
