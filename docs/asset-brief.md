# Asset brief: Meta Notes

**For:** an AI coding agent picking up asset work on this project.
**From:** the project owner, written with the agent that built the app so far.
**Repository:** `GurneeshBudhiraja/meta-hack`, branch `design/recent-show-all`. The app lives in `app/`.

Read this whole brief before writing code. It explains what the product is, how it should feel, the visual language, the technical rules, and then each asset to build: its purpose, its look, its size, its behaviour, and how to check it is done.

---

## 1. What we are building

**Meta Notes** (a working name; see open question 1) is a note-taking app for the **Meta Quest 3 and 3S** headsets. It runs in the Meta Quest Browser as a WebXR app, built with Meta's **Immersive Web SDK (IWSDK) 1.0.1** in TypeScript.

### The vision in one paragraph

A student sits at a desk in a real classroom, wearing a Quest. Through passthrough (the headset's cameras show the real room) they see their own desk, and on it lies a virtual tablet, like an iPad on a table, with a pen beside it. They pinch the pen with their fingers, pick it up, and write on the page as they would on real paper. They glance up at the board, then back down, and keep writing. When they want to type instead, a keyboard lies on the desk. When they are done, they close the page and a small dock of buttons is all that remains. **It must feel calm, physical and studious, never like a game or a sci-fi interface.**

### The person using it

- A student or professional taking notes, usually **seated at a desk**, for long sessions.
- They use **their bare hands, not controllers.** The owner is testing on a **Quest 3S**. Every asset must work with hand tracking alone.
- They are in a **real room** with other people, so nothing should be loud, flashy or large.

### What already works (do not rebuild)

| Feature | Where |
|---|---|
| **Dock:** four floating glass buttons (Settings, Templates, Recent, New note) at eye level. | `src/systems/compact-dock-system.ts`, `public/ui/compact-dock.uikitml` |
| **Panels:** Recent (latest six notes, plus a "Show all" grid with filters), Templates (six papers) and Settings. Each crossfades in place of the dock's buttons. | the same files |
| **Note view:** opening a note fades the dock out. The tablet fades in **lying flat on the nearest real desk** (found from the Quest's Space Setup). With no desk, it floats ahead. A slim glass **note bar** (title plus an X) stands just past the tablet's far edge. | `src/systems/note-view-system.ts`, `src/ui/desk-placement.ts`, `public/ui/note-bar.uikitml` |
| **Pen:** it lies beside the tablet's right edge. Pinch near it to pick it up. It sits in the pinch like a real pen, ink flows while the nib touches the page, and opening the pinch returns it. | `src/systems/pen-system.ts`, `src/systems/ink-system.ts`, `src/ui/pen-state.ts` |
| **Toasts:** one slim line of text near the top of the view. | `src/systems/toast-system.ts` |
| **Storage:** notes are saved on the device (IndexedDB). | `src/notes/` |

Watch the existing behaviour before you start: run `npm run record:flow` (see section 6), or read `app/README.md`.

### Where the project is going (the phases)

1. Desk placement: **done.**
2. **Move and tilt the tablet** with natural hand gestures (grab an edge, move it, tilt it up like a propped iPad): **next.**
3. Pen writing: **done.**
4. **Typing mode:** type on a keyboard that lies on the desk.
5. **Polish:** remember where the tablet was, plus first-time tips.

The five assets in this brief serve phases 2, 4 and 5, and the launch.

---

## 2. The look and feel (the theme)

Every asset must look as if it came from the same studio. The theme is called **"calm and studious"**: warm, quiet, tactile, like a good notebook, a ceramic pen and a walnut desk. It is **not** neon, blue sci-fi, chrome or gamer RGB.

### Colours

These colours come from `src/ui/theme.ts` and `src/scene-assets/notes-materials.ts`. Use them; do not invent new ones.

| Role | Value | Used for |
|---|---|---|
| Warm white (text, icons) | `#f7f2ea` | Text and icons on the glass panels. |
| Soft grey (secondary text) | `#b3aba1` | Captions and labels. |
| Ink (dark text on light) | `#1f1c19` | Ink on paper, and text on light fills. |
| **Clay (the one accent)** | `#d4704f` (hover `#df7e5d`, pressed `#c0603f`) | Main actions and the pen's band. Use it sparingly: **one clay thing in view at a time.** |
| Warm dark body | `#2a2420` | The tablet's body. |
| Warm ceramic | `#efe8dc` | The pen's body. |
| Satin light metal | `#d6cdc1` (metalness 0.65) | Rims and trims. |
| Paper | white, with a grain texture | Pages. |
| Glass fill | `rgba(255, 250, 242, 0.08)`, rising to `0.18` on hover and `0.26` when pressed | Buttons on glass. |

### Materials and lighting rules

- **Dark objects need a light rim or a soft glow.** In passthrough, dark colours sink into a dim room. On see-through (additive) displays, black renders as invisible. The tablet has a satin rim and the pen has a softly glowing clay band for this reason.
- Prefer **light, warm surfaces** for things the hand touches (the pen is warm ceramic white).
- Use `MeshStandardMaterial` or `MeshPhysicalMaterial` with real roughness, with no pure black and no pure white except on paper.
- **Glow is subtle.** Emissive intensity stays around 0.3–0.5, never a bloom.

### Panels (2D UI in 3D)

- Panels are written in **UIKitML** (`public/ui/*.uikitml`, an HTML/CSS-like format) and sit on a **liquid glass slab**: a shader-drawn, frosted, warm-tinted glass with a bright rim (`src/ui/liquid-glass.ts`). Copy how `note-bar.uikitml` and `note-view-system.ts` attach it.
- **Fonts:** Bricolage Grotesque for interface text and Fraunces for display or serif text. The fonts are in `public/fonts/`; copy the `@font-face` blocks from `note-bar.uikitml`.
- **Icons:** Lucide-style line icons (2 px stroke, round caps), in warm white.
- **Motion:** things **fade in and out in place** (about 220–320 ms, ease-out to appear, ease-in to leave). They never fly in, slide from the side or bounce. The owner explicitly rejected "jerky animations coming in from different angles". Small press motion is fine (scale 1.08 on hover, 0.92 on press; see `src/ui/press-motion.ts`).
- **One thing at a time:** a panel replaces the dock's buttons, and a tip never shows on top of another tip.

### Sound

The only sounds are soft synthesized ticks and chimes (`src/ui/ui-sounds.ts`, Web Audio, no files). Anything new stays quiet and short. Remember the person is in a classroom.

---

## 3. Technical rules (read before coding)

Read `app/AGENTS.md` first. The rules that matter most here:

1. **3D models are built in TypeScript code, not loaded from files.** Each asset is a `*.scene-asset.ts` file in `src/scene-assets/` that builds a parentless `Group` (a "prototype") and is registered in `src/assets.ts`. See `tablet.scene-asset.ts` and `stylus.scene-asset.ts` as the reference style. Reuse the helpers in `src/scene-assets/lib/hardsurface.ts` (for example `bevelBox`) and `notes-shapes.ts` (for example `roundedRim`), and the materials in `notes-materials.ts`.
2. **`src/assets.ts` runs twice** (once for the app, once for the scene editor), so asset modules must have **no side effects**: no `World`, no DOM, no timers.
3. **Prototypes are shared and never changed after registration.** IWSDK clones the hierarchy but shares geometry and materials. To change a material on one instance, clone the material first (see `usePaperTexture` in `note-view-system.ts`).
4. **Import Three.js from `@iwsdk/core`, never from `three`.**
5. **Units are metres.** Every asset documents a **contract** in its header comment: which way it faces, where its origin is, and its named parts. Copy the format of the stylus header.
6. **Behaviour goes in systems** (`src/systems/*.ts`, built with `createSystem`) and is registered in `src/index.ts`. Shared state lives in `world.globals` behind a small getter (see `src/ui/pen-state.ts`).
7. **Quest performance:** the Quest has a tiled mobile GPU.
   - Keep each asset to a few thousand triangles.
   - Avoid `discard` in shaders, avoid large textures, and do no per-frame allocation (reuse `Vector3`s, as the existing systems do).
8. **Hands, not rays, for anything physical.** Read hand joints with `frame.getJointPose(...)`, as `PenSystem.readPinch` does. Rays still hit invisible meshes, so hidden things must leave pointer input; see how `setShown` in `note-view-system.ts` removes `RayInteractable`.
9. **Code style the owner wants:**
   - Code is modular and explainable, with descriptive names.
   - Comments are proper but not excessive: say *why*, in plain language.
   - Small files with one job.
10. **Use the project's skills** in `app/.claude/skills/`: `iwsdk-build-model` for models, `iwsdk-ui` for UIKitML panels, `iwsdk-debug` for runtime checks, and `iwsdk-pwa-packaging` for icons and the manifest.

---

## 4. The five assets to build

They are listed in priority order. Build and verify them one at a time, and pause after each for the owner's review (section 7).

### Asset 1: Nib shadow (the "hover dot")

**Purpose:** when you write on a real page you feel the paper. In VR you feel nothing, so you can't tell how far the pen tip is from the page. People either stab through it or write in the air.
- The nib shadow is a small soft dot on the page, directly under the pen tip, which **grows darker and tighter as the tip gets closer**, exactly like the shadow of a real pen under a desk lamp.
- It is the single biggest improvement to writing with hand tracking, and hand tracking on the Quest 3S is a little less precise than on the Quest 3.

**What it looks like:**
- A soft, round, blurred spot, **not a hard circle and not a ring.** It looks like a shadow, not a cursor.
- **Colour:** the ink colour `#1f1c19` at low opacity, so it looks natural on white paper.
- **Size and darkness by height** (height is the nib's distance above the page):

  | Nib height | Spot diameter | Opacity |
  |---|---|---|
  | 3 cm or more | not shown | 0 |
  | 3 cm | about 14 mm | about 0.08 |
  | 1 cm | about 8 mm | about 0.25 |
  | touching (3 mm or less) | about 4 mm | about 0.45 |

  Ease the change in between (smoothstep), never step it.
- **Touching:** when ink starts flowing, the spot settles at its smallest and darkest, and stays there under the ink. **No flash, no clay colour, no ring pulse.** The ink appearing is the feedback.
- It shows only over the page area, never on the bezel and never off the tablet.

**Behaviour:**
- It is visible only while the pen is held (`getPen(world).held`) and the nib is above the page within 3 cm.
- Read the nib position from `PenState.nib` (world space), which `PenSystem` updates every frame before `InkSystem` runs.
- Project the nib straight down onto the page, along the page's normal. The page is the mesh named `WritingSurface` inside the tablet; its local +Z faces up and out of the page.
- The touch thresholds must match `InkSystem` (`PEN_TOUCH_M = 0.003`, `PEN_LIFT_M = 0.006` in `src/systems/ink-system.ts`), so "darkest" means "inking". Share the constants instead of copying the numbers.
- It fades with the tablet when the note view opens and closes (`MeshFade` in `src/ui/mesh-fade.ts` already fades the tablet's children).

**How to build it:**
- Use one small plane mesh with a **radial-falloff shader or a tiny generated gradient texture** (64×64 is plenty), with `transparent: true` and `depthWrite: false`. Lift it about 0.5 mm above the page so it doesn't flicker into the paper.
- Add it as a child of the `WritingSurface` so it moves with the tablet.
- Put the logic in a new small system (for example `src/systems/nib-shadow-system.ts`), registered after `PenSystem`.
- It must draw **under** the ink strokes, or the strokes look dirty. Check the render order against `src/ink/stroke-mesh.ts`.

**Done when:**
- In the emulator, holding the pen and lowering it over the page shows the spot growing darker and smaller, with no flicker.
- The spot never shows off the page or when the pen is down.
- A screenshot sequence at 3 cm, 1 cm and touching is attached.

---

### Asset 2: Tablet edge glow (the "grab here" hint)

**Purpose:**
- Phase 2 lets you **grab the tablet by its edge** to move it or tilt it up (like propping an iPad).
- The page itself must stay for writing only. The project's design rule is "writing and moving are separate".
- So the edge needs to tell you, without any visible handle, that **this is where you hold it**.
- This replaces the old separate handle model (`tablet-handle`), which we no longer want to show.

**What it looks like:**
- A **thin line of soft warm-white light** running along the outer rim of the tablet's bezel (follow the existing rounded rim: `roundedRim` in `tablet.scene-asset.ts`).
- **At rest it is invisible.** No glow when no hand is near.
- **Hand near** (a hand's pinch point within about 6 cm of the bezel, and outside the page area):
  - The rim lights up **only near the hand**: a soft pool of light about 8 cm long, centred on the closest point of the rim, fading out along the edge.
  - Colour: warm white `#f7f2ea`, low intensity. It is as if your hand's nearness warms the edge.
- **Grabbed** (once phase 2 adds grabbing): the whole rim glows gently and evenly, with a faint clay tint (`#d4704f`), for as long as it is held. It fades out over about 220 ms on release.
- **Never shows while the pen is held** (`PenState.held`), so writing near the edge doesn't keep lighting it up.

**How to build it:**
- Add a named part **`EdgeGlow`** to the tablet prototype: a thin ribbon or tube around the bezel's outer edge, slightly proud of the rim.
- Give it a small **shader material** with uniforms for the hand's point (in tablet-local space), intensity, and tint, using additive or transparent blending with no texture.
- Keep it in the tablet asset file, and document it in the tablet's contract comment.
- The near-hand logic goes in a small system: either a new `tablet-edge-system.ts`, or the start of the phase 2 move/tilt system if you are building that too.
  - Read both hands' pinch points the way `PenSystem.readPinch` does. Consider moving that reading into a shared helper (for example `src/ui/hand-pinch.ts`) instead of copying it.
  - Pass the closest hand into the uniform.
- Because the prototype's material is shared, **clone the material per tablet instance** before changing its uniforms.

**Done when:**
- In the emulator, moving a tracked hand toward each of the four edges lights the nearest part of the rim and nothing else.
- Moving the hand away fades the glow out.
- Holding the pen suppresses the glow.
- Screenshots: rest, hand near the right edge, and hand near a corner.

---

### Asset 3: Desk keyboard

**Purpose:**
- Typing mode (phase 4) lets the student type notes.
- The Quest's system keyboard floats in front of the face and covers the page.
- We want a keyboard that **lies flat on the real desk, in front of the tablet**, as a laptop keyboard or a Magic Keyboard would. The student types on it with their fingertips, pressing down onto the desk.
- **The owner's direction:** "our own keyboard on the desk."

**What it looks like:**
- A **slim, low, premium keyboard**, like a thin aluminium-and-ceramic Bluetooth keyboard, matching the tablet so they read as a set.
- **Base:** the warm dark body `#2a2420`, with a satin light rim (`#d6cdc1`) along its edge, like the tablet's. Rounded corners with a radius of about 10 mm, and a slight wedge (thicker at the back). It is about 8 mm thick at the back and 5 mm at the front.
- **Keycaps:** **light warm ceramic** (`#efe8dc`, like the pen), slightly rounded, with a satin finish.
  - Light keys stay visible in a dim room, which is the same reason the pen is light.
  - Legends are in ink colour `#1f1c19`, in the Bricolage UI font, centred.
- **One clay key:** Return, in clay `#d4704f` with a white legend. This is the keyboard's one accent.
- **Size:** about **29 cm wide × 11 cm deep.** The tablet is 39 cm wide with its bezel, so the keyboard should look a little narrower than it.
  - Key pitch is **19–20 mm**, a full-size keyboard spacing, because fingertip tracking needs large targets. Do not shrink the keys to fit more of them.
  - Key gap is about 3 mm.
- **Layout:** US QWERTY (see open question 2), in five rows:
  1. Numbers 1–0 and Backspace.
  2. Q–P.
  3. A–L and Return (clay).
  4. Shift, Z–M, comma and period.
  5. A wide space bar, flanked by "123" (symbols) on the left and a key to hide the keyboard on the right.

  No function keys, no arrow keys, no numpad. This is a note-taking keyboard, not a computer keyboard.
- Lighting: no RGB backlight. A faint warm glow on the Return key (emissive about 0.3) is enough to find it in the dark.

**The asset contract:**
- File: `src/scene-assets/desk-keyboard.scene-asset.ts`; asset ID `desk-keyboard` in `src/assets.ts`.
- Orientation: it **lies flat**, with the key tops facing +Y and the front edge (the space bar side) toward +Z, the viewer. The origin is at the centre of the base's **bottom** face, so placing it at a desk point puts it on the desk.
- Named parts:
  - `Base`.
  - One mesh per key, named `Key_<code>`, for example `Key_KeyQ`, `Key_Space`, `Key_Enter`, `Key_Backspace`, `Key_ShiftLeft`, `Key_Symbols`, `Key_Hide`, using the web `KeyboardEvent.code` names where they exist. Each key is its own mesh so it can be pressed down on its own.
  - The legends: draw them all into **one shared texture atlas** (one canvas drawn when the asset is created) rather than many text meshes, to keep draw calls low. Map each keycap's top face to its cell in the atlas.
- Export from the file:
  - A `KEYBOARD_KEYS` table of `{ code, label, shiftLabel?, centre (local metres), size }`, so a future system can find which key a fingertip is over.
  - The constants `KEYBOARD_WIDTH_M`, `KEYBOARD_DEPTH_M` and `KEY_TRAVEL_M`.

**Behaviour.** Scope: build the asset and the press visuals. Typing into the note is phase 4 and **not** part of this brief.
- **Key travel:** 2 mm. A pressed key moves down 2 mm and comes back over about 80 ms.
- Expose a small helper, `pressKey(keyboard, code)` / `releaseKey(...)`, or show it in a demo system, so phase 4 only needs to wire fingertips to it.
- Sound (for phase 4): a very soft, low tick per key, added to `ui-sounds.ts`, quieter than the existing press sound.
- Placement (for phase 4): when typing mode is on, it lies on the same desk as the tablet, centred between the viewer and the tablet. The tablet then slides about 12 cm further back, or tilts up like a laptop screen.

**Done when:**
- The asset renders in isolation (use the `iwsdk-build-model` skill's inspection steps), lit by the scene, with legends legible in a close-up screenshot.
- Placed on the classroom desk next to the tablet (with `demo.showClassroom` in `src/util/dev-hooks.ts`), it looks like a matching set.
- It stays under about 8,000 triangles and uses at most 3 draw calls for the keycaps (keys can share geometry and material, plus the atlas).
- `pressKey` visibly depresses a key.

---

### Asset 4: App icon and name

**Purpose:**
- When the app is installed on the Quest (as a PWA, an installable web app) or listed in the Horizon Store, it needs an icon. You see it every time you launch the app.
- Today the page's icon is literally empty (`<link rel="icon" href="data:," />` in `app/index.html`).

**What it looks like:**
- **Concept:** the corner of a warm white paper page, with a single short, confident pen stroke in **clay** across it, on the **warm dark** background `#2a2420`. Optionally, the page has a soft fold or curl at one corner.
  - It reads as "notes, handwritten" in a quarter of a second.
- **Style:** flat with a gentle shading (one soft shadow under the page). No gradients across the whole icon, no 3D render, no text or letters, no headset drawn in it.
- **No Meta branding at all:** no Meta logo, no infinity symbol, no Quest headset. A store listing cannot use Meta's marks. The current name "Meta Notes" is a placeholder for the same reason (open question 1).

**Files to deliver:**
- Put them in `app/public/icons/`:
  - `icon-512.png` and `icon-192.png`, ordinary icons with transparent or dark corners.
  - `icon-512-maskable.png`, a maskable icon: keep the artwork inside the central **80% safe zone**, because the system crops it to a circle or squircle.
- Make the source an **SVG** (`icon.svg`) so it can be re-exported at any size; generate the PNGs from it.
- Link the icon in `app/index.html`, and add or update the web app manifest. Follow the `iwsdk-pwa-packaging` skill for the exact manifest fields and the sizes the Quest needs.

**Done when:** the icon files exist, the browser tab and the installed app show the icon, and you have attached a preview of the icon at 512 px and at 48 px. At 48 px the stroke must still be recognisable.

---

### Asset 5: First-time tip cards with hand-gesture icons

**Purpose:**
- The first time someone uses the app in a headset, they don't know the gestures:
  - that they can pinch the pen,
  - that they grab the edge (not the page) to move the tablet,
  - that the X closes the page.
- A long tour is tiresome. Instead, **one small card appears next to the thing it's about, once, at the moment it's useful, and disappears as soon as the person does it.**

**What it looks like:**
- A **small glass pill**, the same style as the note bar (`public/ui/note-bar.uikitml`): a liquid glass slab, height about 44 px, fully rounded ends.
- On the left, a **hand-gesture icon** (see below) in warm white, about 24 px. Then **one line of text**, at most about 36 characters, in the Bricolage UI font (16 px, weight 500, `#f7f2ea`).
- No buttons, no "Next", no "Got it". It goes away by itself when the action is done, or after the note view closes.
- Physical size: at the same scale as the note bar (scene scale about 0.175), so the text is readable at arm's length but the card is smaller than the note bar.

**The hand-gesture icons** (new: draw these as SVGs, in Lucide style: 2 px stroke, round caps and joins, 24×24 grid, no fill, warm white):

| Icon | Shows |
|---|---|
| `hand-pinch` | A side view of a hand with thumb and index fingertip touching. |
| `hand-grab` | A hand with its fingers curled, closing around an edge (a short line under the fingers). |
| `hand-point` | An index finger pointing, with a small tap mark at its tip. |

Put them in `app/src/ui/icons/` (or wherever UIKit icons can be loaded; check how the X icon in the note bar is provided).

**The cards** (exact wording; keep it this short):

| # | When it appears | Where | Icon | Text | Disappears when |
|---|---|---|---|---|---|
| 1 | The first time a note page opens | Floating just above the pen, facing the viewer | `hand-pinch` | "Pinch the pen to pick it up" | The pen is picked up. |
| 2 | After the first stroke is written, and the pen is put down | Just outside the tablet's left edge, facing the viewer | `hand-grab` | "Grab an edge to move the page" | The tablet is grabbed (phase 2), or after 8 seconds. |
| 3 | The first time a page is open for 60 seconds without being closed | Beside the note bar's X | `hand-point` | "Tap X to put the page away" | The page is closed. |

**Behaviour:**
- **Each card shows once ever**, remembered on this device. Use the existing preferences helper, `src/ui/preferences.ts` (localStorage); wrap reads and writes in try/catch, as the existing code does.
- **Only one card at a time**, and **never at the same time as a toast**. Respect the "one thing at a time" rule; check how `toast-system.ts` and the dock coordinate.
- They fade in (about 320 ms) and out (about 220 ms) in place, like every other panel. They never slide.
- They are hidden from rays when invisible (remove `RayInteractable`).
- Build it as **one** UIKitML asset (`public/ui/tip-card.uikitml`, registered as `tip-card`) whose icon and text are set from code, plus one small `tip-system.ts`. Do not make three separate panels.

**Done when:** each card appears in its moment and position in the emulator, disappears on the action, and never reappears after a reload. The cards must look like siblings of the note bar. Provide screenshots of each.

---

## 5. Things we decided NOT to build (and why)

These were considered and dropped. Don't build them, even though some already exist in the code.

| Item | Why not |
|---|---|
| A tilt stand or kickstand model | The edge glow and the tablet's own angle explain the tilt; a stand adds clutter. |
| A toggle band on the pen for typing mode | A switch on the note bar is easier to find than a ring on a pen you may not be holding. Phase 4 will add a small writing/typing switch to the note bar instead. |
| The separate tablet handle (`tablet-handle`) | Replaced by the edge glow. Leave the code alone for now; just don't show it. |
| Push pin, washi tape and the five sticky-note colours | For a far-off feature (pinning notes in the room). When it comes, one sticky note is enough. Leave the existing code alone. |
| The tool wheel (radial menu) | A few colour dots on the note bar beat a menu you have to summon. Leave the existing code alone. |
| Polaroid photo frame and camera viewfinder | Camera capture isn't ready on the headset yet. |
| Extra sounds beyond one soft pen sound and the key tick | Sound in a classroom must stay minimal. |

---

## 6. How to run, check and record

From `app/`:

```sh
npm install
npm run dev          # CLI-managed dev server + browser with IWER (the Quest emulator)
npm run typecheck    # run before every browser check
npm run build
npm run record:flow  # records the whole flow from the headset's view into artifacts/flow.mp4 (about 10 min)
npm run record:desk  # shorter: the classroom desk, the pen, writing
```

- The dev server can also be started with `npx iwsdk dev restart --foreground --no-open`. New `.uikitml` files and changes to `src/assets.ts` **need a dev-server restart.**
- **IWER** is IWSDK's browser emulator of a Quest 3 with simulated hands. The recorder scripts in `scripts/` (`scripts/lib/headset-recorder.mjs`) drive it.
  - `pickUpPen`, `penWrite` and `putDownPen` show how to move a simulated hand, pinch, and write. Reuse them for screenshots of your assets.
- `src/util/dev-hooks.ts` has `demo.showClassroom(...)`, which places a 3D classroom with desks around the viewer. Use it to see assets on a desk.
- For screenshots or videos meant for the owner: show the **headset's real view** (Quest 3 field of view, the head looking straight ahead or naturally down at the desk), with **no captions or overlays.**

---

## 7. How the owner likes to work

- **Work in phases.** After each asset, stop. Give a **short summary** (what you built, a screenshot or two, anything you are unsure about), and **wait for the owner's go-ahead** before the next one.
- **Only change what was asked.** No drive-by refactors, renames or "improvements" elsewhere. If you see something worth fixing, mention it instead.
- **Commit and push often**, with clear messages that say what changed and why. Do not put AI model names or IDs in commits.
- **Ask when unsure** about anything that changes how the product looks or feels. Don't guess on taste.
- Explain things in plain language. The owner is building this for a hackathon and wants to understand each piece.

---

## 8. Open questions (with our current default)

If the owner hasn't answered these yet, use the default and say you did.

1. **The app's real name.** "Meta Notes" can't ship, because it uses Meta's name. *Default:* keep the placeholder in code. The icon contains no text, so it doesn't depend on the name.
2. **Keyboard layout.** *Default:* US QWERTY only. The owner is in Canada, so French AZERTY or Canadian Multilingual may matter later.
3. **Does the keyboard always show with the tablet, or only in typing mode?** *Default:* only in typing mode, so the desk stays clear for writing.
4. **When typing, does the tablet slide back or tilt up like a laptop screen?** *Default:* it tilts up about 60° and slides back about 12 cm. Confirm with the owner when phase 4 starts.

---

## 9. Quick reference: sizes and numbers

| Thing | Value |
|---|---|
| Tablet page | 36 × 27 cm (aspect 4:3); bezel 1.6 cm; body 9 mm thick |
| Tablet with bezel | about 39.2 × 30.2 cm |
| Pen | 155 mm long, 11.6 mm across; nib at +X; warm ceramic with a clay band |
| Ink starts / stops | nib within 3 mm of the page / lifted past 6 mm |
| Pinch / release | thumb–index tips under 1.5 cm / over 3 cm |
| Tablet on the desk | 1 cm above the desk surface, about 40 cm out from the eyes, lying flat |
| Note bar | 52 px tall, 26 px corner radius, scene scale 0.175 |
| Panel text minimum | about 1.3° of view height (readable on Quest 3S) |
| Fade timings | appear 320 ms (ease-out, short delay), disappear 220 ms (ease-in) |
