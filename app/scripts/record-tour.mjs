/**
 * Records a tour of the home UI exactly as the headset shows it: Quest 3
 * field of view, no captions or overlays, and UI animations and stick mode
 * at their true speed (see lib/headset-recorder.mjs). A 360-degree outdoor
 * photo stands in for passthrough, since IWER only emulates indoor rooms.
 *
 * Flow: look at the window and tap its buttons (sort, scroll, a template,
 * settings), drag it by its grab bar, look around and come back, pin it and
 * turn (it follows), unpin, minimise to the dock (fade and shine), open the
 * Recent and Templates pop-ups, drag the dock, look around, then expand
 * (the window returns with a glow).
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
];
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
  // Standing eye height, the hand held low and forward like a relaxed pinch.
  await r.moveHead(HEAD);
  await r.moveHand({ x: 0.2, y: 1.2, z: -0.22 });
  await r.turnHead(0, -2, 100);
  await r.pause(600);
}

// Quest 3 per eye: about 96 degrees vertical and 110 horizontal.
const rec = await startHeadsetRecording({ size: { width: 1032, height: 800 }, fovDeg: 96, captions: false, prepare });
const { page, fps, speedUp, pause, turnHead } = rec;
const until = (predicate, arg) => page.waitForFunction(predicate, arg, { timeout: 8000 * speedUp });
const visible = (name) =>
  page.evaluate((n) => window.__metaNotes.world.scene.getObjectByName(n)?.isVisible.peek() === true, name);
/** World position of a placed panel (scene node id), raised by `dy`. */
const panelAt = (node, dy = 0) =>
  page.evaluate(([n, d]) => {
    const p = window.__metaNotes.world.getSceneObject(n).position;
    return { x: p.x, y: p.y + d, z: p.z };
  }, [node, dy]);
/** The head yaw (degrees, as turnHead takes it) that faces a point. */
const yawTo = (p) => (Math.atan2(-(p.x - HEAD.x), -(p.z - HEAD.z)) * 180) / Math.PI;
/** Turn to look straight at a panel. */
const lookAtPanel = async (node, ms, dy = 0) => {
  const at = await panelAt(node, dy);
  await rec.lookAt(at, ms);
  return yawTo(at);
};

await pause(1800);

// --- Expanded window: tap through its buttons.
await rec.tap('sort-button');
await pause(900);
await rec.tap('sort-button');
await pause(700);
await rec.tap('recent-next');
await pause(1100);
await rec.tap('recent-prev');
await pause(900);
const before = await page.evaluate(() => window.__metaNotes.session.summaries.length);
await rec.tap('template-grid');
await until((n) => window.__metaNotes.session.summaries.length > n, before);
await pause(1200);
await rec.tap('settings-button');
await pause(1600);
await rec.tap('settings-button');
await pause(900);

// --- Move the window by its grab bar (the eyes follow it), look around, come back.
const bar = await rec.objectCenter('window-grab-bar');
await rec.rayDrag(bar, { x: bar.x + 0.32, y: bar.y + 0.04, z: bar.z + 0.08 }, 1800);
await pause(600);
let yaw = await lookAtPanel('home-window', 1000);
await pause(900);
await turnHead(yaw + 75, 4, 2400);
await pause(1200);
await turnHead(yaw - 65, 8, 3400);
await pause(1200);
yaw = await lookAtPanel('home-window', 2200);
await pause(1000);

// --- Stick mode: pin, turn away (the window follows), turn back, unpin.
await rec.tap('window-pin');
await pause(900);
await turnHead(yaw - 60, 0, 2800);
await pause(2800);
await turnHead(yaw + 20, -2, 2800);
await pause(2800);
yaw = await lookAtPanel('home-window', 800);
await rec.tap('window-pin');
await pause(900);

// --- Minimise: the window fades out, the dock fades in with a shine.
await rec.tap('compact-toggle');
await until(() => window.__metaNotes.world.scene.getObjectByName('dock-new')?.isVisible.peek() === true);
await lookAtPanel('compact-dock', 900, 0.08);
await pause(1800);

await rec.tap('dock-recent');
await pause(1800);
await rec.tap('dock-templates');
await pause(1800);
await rec.tap('dock-templates');
await pause(900);

// --- Move the dock (the eyes follow it), look around, come back to it.
const dockBar = await rec.objectCenter('dock-grab-bar');
await rec.rayDrag(dockBar, { x: dockBar.x - 0.3, y: dockBar.y + 0.05, z: dockBar.z + 0.05 }, 1800);
await pause(600);
yaw = await lookAtPanel('compact-dock', 1000, 0.08);
await pause(900);
await turnHead(yaw - 80, 6, 2600);
await pause(1200);
await turnHead(yaw + 60, 2, 3400);
await pause(1000);
await lookAtPanel('compact-dock', 2200, 0.08);
await pause(1000);

// --- Expand: the window returns where the dock was, with a glow.
await rec.tap('dock-expand');
await until(() => window.__metaNotes.world.scene.getObjectByName('home-root')?.isVisible.peek() === true);
await lookAtPanel('home-window', 900);
await pause(2800);

const expanded = await visible('home-root');
const errors = await rec.finish('tour');
console.log(`${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; expanded ${expanded}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
