/**
 * Records a tour of the home UI exactly as the headset shows it: Quest 3
 * field of view, no captions or overlays, and UI animations and stick mode
 * at their true speed (see lib/headset-recorder.mjs). A 360-degree outdoor
 * photo stands in for passthrough, since IWER only emulates indoor rooms.
 *
 * Flow (a returning user; the first launch is in the smoke test): the dock
 * appears with its shine; open Recent, point along the notes and open one
 * (a toast: writing is next); open Templates and start a grid page (a
 * toast confirms it); open Settings, switch stick mode off and on, try
 * Connect (it answers "Coming soon" in place) and close it with a pinch
 * outside the panel (the buttons fade away while it is open); drag the dock by its
 * grab bar; then look around: stick mode is on, so the dock comes along.
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
  // Recenter for the standing pose, so the home sits where it would at launch.
  await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
  await r.turnHead(0, -6, 100);
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

const rest = () => rec.moveHand({ x: 0.2, y: 1.2, z: -0.22 }).then(() =>
  page.evaluate(() => window.IWER_DEVICE.remote.dispatch('look_at', { device: 'hand-right', target: { x: 0.75, y: 0.7, z: -0.9 } })));

// --- The home is the dock: four glass buttons and nothing else.
await lookAtPanel('compact-dock', 300, 0.1);
await rest();
await pause(2000);

// --- Recent: point along the notes, open one (a toast: writing is next).
await rec.tap('dock-recent');
await rest();
await lookAtPanel('compact-dock', 700, 0.2);
await pause(800);
for (const card of ['dock-recent-card-0', 'dock-recent-card-1', 'dock-recent-card-2']) {
  await rec.point(card);
  await pause(600);
}
await rec.tap('dock-recent-card-1');
await rest();
await pause(2400);

// --- Templates: start a grid page (a toast confirms it).
await rec.tap('dock-templates');
await rest();
await pause(1200);
for (const paper of ['dock-template-lined', 'dock-template-grid']) {
  await rec.point(paper);
  await pause(600);
}
const before = await page.evaluate(() => window.__metaNotes.session.summaries.length);
await rec.tap('dock-template-grid');
await until((n) => window.__metaNotes.session.summaries.length > n, before);
await rest();
await pause(2600);

await lookAtPanel('compact-dock', 700, 0.1);

// --- Settings: switch stick mode off and back on, try Connect (a toast:
// coming soon), then close it.
await rec.tap('dock-settings');
await rest();
await lookAtPanel('compact-dock', 700, 0.28);
await pause(1400);
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
// Close it with a pinch anywhere outside the panel: the buttons come back.
const outside = await panelAt('compact-dock', 0.25);
outside.x += 0.9;
await rec.rayDrag(outside, outside, 150);
await rest();
await lookAtPanel('compact-dock', 700, 0.1);
await pause(1000);

// --- Move the dock by its grab bar (the eyes follow it).
const dockBar = await rec.objectCenter('dock-grab-bar');
await rec.rayDrag(dockBar, { x: dockBar.x + 0.25, y: dockBar.y + 0.04, z: dockBar.z + 0.04 }, 1800);
await pause(600);
const yaw = await lookAtPanel('compact-dock', 1000, 0.1);
await pause(1200);

// --- Stick mode is on: turn away and the dock comes along; turn back.
await turnHead(yaw + 70, 4, 2800);
await pause(2800);
await turnHead(yaw - 50, 6, 3600);
await pause(2800);
await turnHead(yaw, -10, 2400);
await pause(2000);

const docked = await visible('dock-root');
const errors = await rec.finish('tour');
console.log(`${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; dock shown ${docked}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
