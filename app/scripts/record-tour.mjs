/**
 * Records a tour of the home UI exactly as the headset shows it: Quest 3
 * field of view, no captions or overlays, and UI animations and stick mode
 * at their true speed (see lib/headset-recorder.mjs). A 360-degree outdoor
 * photo stands in for passthrough, since IWER only emulates indoor rooms.
 *
 * The head looks straight ahead, as a person standing still would; it only
 * turns at the end to show stick mode.
 *
 * Flow (a returning user; the first launch is in the smoke test): the dock
 * appears with its shine; open Recent (its panel takes the buttons' place)
 * on the latest six notes, switch to Show all, scroll through every note,
 * filter to this week's notes, then open one (a toast: writing is
 * next);
 * open Templates, point along the papers and start a grid page (a toast
 * confirms it); open Settings, switch stick mode off and on, try Connect
 * (it answers "Coming soon" in place) and close it with its close button;
 * drag the dock by its grab bar; then look around: stick mode is on, so
 * the dock comes along.
 *
 * Usage: start the dev server (`npm run dev`), then
 *   npm run record:tour -- <equirectangular.jpg> [panorama yaw degrees]
 * The photo is not in the repo; any CC0 one works (e.g. Poly Haven).
 * Output: artifacts/tour.mp4
 */

import { readFileSync } from 'node:fs';
import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

const [panoramaPath, panoramaYaw = '0'] = process.argv.slice(2);
if (!panoramaPath) {
  console.error('Usage: npm run record:tour -- <equirectangular.jpg> [yaw degrees]');
  process.exit(1);
}

const lines = (rows, size, seed) =>
  rows.flatMap((t, i) => layoutLine(t, { u: 0.07, v: 0.16 + i * 0.13, size, seed: seed + i }).strokes);
const notes = [
  { title: 'Trip ideas', paper: 'dotted', strokes: lines(['coast road', 'pack light'], 0.0038, 41) },
  { title: 'Groceries', paper: 'checklist', strokes: lines(['milk, eggs', 'oats, coffee', 'bread'], 0.0034, 31) },
  { title: 'Physics ch. 4', paper: 'grid', strokes: lines(['F = ma', 'p = mv'], 0.0045, 21) },
  { title: 'Lab notes', paper: 'lined', strokes: lines(['Titration Thu', 'pH 7.2 at 3 pm', 'add 2 ml buffer'], 0.0032, 11) },
  { title: 'Reading list', paper: 'cornell', strokes: lines(['Dune', 'The Overstory'], 0.004, 51) },
  { title: 'Standup', paper: 'lined', strokes: lines(['ship grid', 'record tour'], 0.0036, 61) },
  { title: 'Sketches', paper: 'blank', strokes: lines(['tree', 'bench'], 0.005, 71) },
  { title: 'Spanish verbs', paper: 'lined', strokes: lines(['ser, estar', 'tener'], 0.0036, 81) },
  { title: 'Book club', paper: 'lined', strokes: lines(['ch. 7 by Fri'], 0.0036, 91) },
  { title: 'Gym plan', paper: 'checklist', strokes: lines(['squats', 'rows'], 0.0036, 101) },
  { title: 'Recipes', paper: 'lined', strokes: lines(['dal tadka', 'naan'], 0.0036, 111) },
  { title: 'Chem quiz', paper: 'grid', strokes: lines(['NaCl', 'H2O'], 0.0045, 121) },
  { title: 'Gift ideas', paper: 'dotted', strokes: lines(['scarf', 'book'], 0.0038, 131) },
  { title: 'Budget', paper: 'grid', strokes: lines(['rent 900', 'food 250'], 0.004, 141) },
];
/** Days since some notes were edited, so Show all's When filters have something to sort. */
const EDITED_DAYS_AGO = { 'Trip ideas': 30, Groceries: 3, 'Physics ch. 4': 12, 'Lab notes': 5, 'Reading list': 45, Standup: 2 };
const HEAD = { x: 0, y: 1.55, z: 0.05 };

// Set the stage off camera: outdoors, standing, a few handwritten notes.
async function prepare(r) {
  const photo = `data:image/jpeg;base64,${readFileSync(panoramaPath).toString('base64')}`;
  await r.page.evaluate(([url, yaw]) => window.__metaNotes.demo.showPanorama(url, yaw), [photo, Number(panoramaYaw)]);
  await r.page.evaluate(async (list) => {
    const { session } = window.__metaNotes;
    for (const note of list) {
      await session.createNote(note.title, note.paper);
      for (const points of note.strokes) {
        session.commitStroke({ id: crypto.randomUUID(), tool: 'pen', color: '#1f1c19', width: 0.004, points: points.flat() });
      }
    }
    await session.flush();
  }, notes);
  await r.page.evaluate(async (ages) => {
    const { session, store } = window.__metaNotes;
    for (const summary of session.summaries) {
      const days = ages[summary.title];
      if (!days) continue;
      const note = await store.get(summary.id);
      note.updatedAt = Date.now() - days * 86400000;
      await store.put(note);
    }
    session.summaries = await store.list();
  }, EDITED_DAYS_AGO);
  // Standing eye height, the hand held low and forward like a relaxed pinch.
  await r.moveHead(HEAD);
  await r.moveHand({ x: 0.2, y: 1.2, z: -0.22 });
  // Recenter for the standing pose, so the home sits where it would at launch.
  await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
  await r.turnHead(0, 0, 100);
  await r.pause(600);
}

// Quest 3 per eye: about 96 degrees vertical and 110 horizontal.
const rec = await startHeadsetRecording({ size: { width: 1032, height: 800 }, fovDeg: 96, captions: false, prepare });
const { page, fps, speedUp, pause, turnHead } = rec;
const until = (predicate, arg) => page.waitForFunction(predicate, arg, { timeout: 8000 * speedUp });
const visible = (name) =>
  page.evaluate((n) => window.__metaNotes.world.scene.getObjectByName(n)?.isVisible.peek() === true, name);
// The head looks straight ahead throughout, like a person standing still:
// the dock and its panels are placed in the centre of the view.

// The resting hand points down, out of the way of the panels.
const rest = () => rec.moveHand({ x: 0.2, y: 1.2, z: -0.22 }).then(() =>
  page.evaluate(() => window.IWER_DEVICE.remote.dispatch('look_at', { device: 'hand-right', target: { x: 0.25, y: 0, z: -0.3 } })));

// --- The home is the dock: four glass buttons and nothing else.
await rest();
await pause(2000);

// --- Recent: the latest six, then Show all: scroll, filter, open a note.
await rec.tap('dock-recent');
await rest();
await pause(1700);
for (const card of [0, 1, 2, 5]) {
  await rec.point(`dock-recent-card-${card}`);
  await pause(500);
}
await rec.tap('recent-tab-all');
await rest();
await pause(1800);
// Drag the grid up with the ray to scroll down to older notes, then back.
const grid = await rec.objectCenter('dock-popover-all');
await rec.rayDrag({ x: grid.x, y: grid.y - 0.08, z: grid.z }, { x: grid.x, y: grid.y + 0.2, z: grid.z }, 1400);
await rest();
await pause(900);
await rec.rayDrag({ x: grid.x, y: grid.y + 0.08, z: grid.z }, { x: grid.x, y: grid.y - 0.25, z: grid.z }, 1200);
await rest();
await pause(700);
// This week's notes ("11 of 14").
await rec.tap('when-week');
await rest();
await pause(1700);
await rec.point('dock-all-card-1');
await pause(500);
await rec.tap('dock-all-card-1');
await rest();
await pause(2400);

// --- Templates: point along the papers, start a grid page (a toast confirms it).
await rec.tap('dock-templates');
await rest();
await pause(1900);
for (const paper of ['dock-template-blank', 'dock-template-lined', 'dock-template-cornell', 'dock-template-grid']) {
  await rec.point(paper);
  await pause(600);
}
const before = await page.evaluate(() => window.__metaNotes.session.summaries.length);
await rec.tap('dock-template-grid');
await until((n) => window.__metaNotes.session.summaries.length > n, before);
await rest();
await pause(2600);

// --- Settings: switch stick mode off and back on, try Connect (a toast:
// coming soon), then close it.
await rec.tap('dock-settings');
await rest();
await pause(2100);
await rec.tap('set-stick');
await rest();
await pause(1400);
await rec.tap('set-stick');
await rest();
await pause(1200);
await rec.point('set-connect-microsoft');
await pause(700);
await rec.tap('set-connect-drive');
await rest();
await pause(2400);
// Close it with its close button: the buttons come back.
await rec.point('dock-popover-close');
await pause(500);
await rec.tap('dock-popover-close');
await rest();
await pause(1000);

// --- Move the dock by its grab bar.
const dockBar = await rec.objectCenter('dock-grab-bar');
await rec.rayDrag(dockBar, { x: dockBar.x + 0.25, y: dockBar.y + 0.04, z: dockBar.z + 0.04 }, 1800);
await pause(1800);

// --- Stick mode is on: turn away and the dock comes along; turn back.
await turnHead(70, 0, 2800);
await pause(2800);
await turnHead(-50, 0, 3600);
await pause(2800);
await turnHead(0, 0, 2400);
await pause(2000);

const docked = await visible('dock-root');
const errors = await rec.finish('tour');
console.log(`${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; dock shown ${docked}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
