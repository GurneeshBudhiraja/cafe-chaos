/**
 * Records the note page landing on a classroom desk, as the headset shows
 * it: Quest 3 field of view, no captions, UI animations at their true speed
 * (see lib/headset-recorder.mjs).
 *
 * IWER only emulates a living room, so the app's 3D classroom stands in for
 * the real room (demo.showClassroom): the student's own desk is lined up
 * with one of the emulated tables, the surface Quest would detect, so the
 * tablet visibly lands on a classroom desk. On a headset the real desk and
 * passthrough take their place.
 *
 * Flow: seated at the desk, looking ahead, only the dock shows; New note:
 * the dock fades and the tablet lands flat on the desk, the pen beside it;
 * look down, pinch the pen up and write two lines with its nib, then let it
 * go (it goes back beside the tablet); close the page with the bar's X (the
 * dock comes back); open a note from Recent: it lands on the desk with its
 * ink.
 *
 * Usage: start the dev server (`npm run dev`), then npm run record:desk
 * Output: artifacts/desk.mp4
 */

import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

const lines = (rows, size, seed) =>
  rows.flatMap((t, i) => layoutLine(t, { u: 0.07, v: 0.16 + i * 0.13, size, seed: seed + i }).strokes);
const notes = [
  { title: 'Lab notes', paper: 'lined', strokes: lines(['Titration Thu', 'pH 7.2 at 3 pm', 'add 2 ml buffer'], 0.0032, 11) },
  { title: 'Reading list', paper: 'cornell', strokes: lines(['Dune', 'The Overstory'], 0.004, 51) },
  { title: 'Physics ch. 4', paper: 'grid', strokes: lines(['F = ma', 'p = mv'], 0.0045, 21) },
];
/** The emulated living room's desk-height table (0.79 m) is to the viewer's left (-X); the student sits facing it. */
const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
/** Facing -X: the head's yaw, and the classroom's (its chalkboard ahead). */
const FACING_DEG = 90;
/** The right hand at rest: low, in front of the body and to the right. */
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
/** Where the classroom's origin (the student's chair) goes: the desk then sits on the table. */
const CLASSROOM_ORIGIN = { x: -1.045, z: 0.28 };

async function prepare(r) {
  await r.page.evaluate(
    ([origin, yaw, height]) => window.__metaNotes.demo.showClassroom(origin, yaw, height),
    [CLASSROOM_ORIGIN, FACING_DEG, TABLE_HEIGHT_M],
  );
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
  // Seated at the desk, the hand resting low; the home comes in front.
  await r.moveHead(SEAT);
  await r.moveHand(HAND_REST);
  await r.turnHead(FACING_DEG, 0, 100);
  await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
  await r.pause(800);
}

const rec = await startHeadsetRecording({ size: { width: 1032, height: 800 }, fovDeg: 96, captions: false, prepare });
const { page, fps, speedUp, pause } = rec;
/** The resting hand points down, out of the way of the panels. */
const rest = () =>
  page.evaluate(([x, z]) => window.IWER_DEVICE.remote.dispatch('look_at', { device: 'hand-right', target: { x, y: 0, z } }), [
    SEAT.x - 0.2,
    SEAT.z + 0.3,
  ]);
const noteOpen = () => page.evaluate(() => window.__metaNotes.world.globals['metaNotes.noteView'].isOpen);
const tabletAt = () =>
  page.evaluate(() => {
    const p = window.__metaNotes.world.getSceneObject('tablet').position;
    return { x: p.x, y: p.y, z: p.z };
  });

// --- Seated, looking ahead: only the dock.
await rest();
await pause(2000);

// --- New note: the dock fades and the tablet lands flat on the desk.
await rec.tap('dock-new');
await rest();
await pause(1600);
const tablet = await tabletAt();
await rec.lookAt({ ...tablet, x: tablet.x - 0.02 }, 1400);
await pause(1200);
// Pinch the pen up and write with its nib, then let it go.
await rec.pickUpPen(1400);
await pause(500);
await rec.penWrite(layoutLine('Hello class', { u: 0.1, v: 0.28, size: 0.011, seed: 5 }).strokes, 90);
await rec.penWrite(layoutLine('ch. 5 notes', { u: 0.1, v: 0.46, size: 0.011, seed: 9 }).strokes, 90);
await pause(500);
await rec.putDownPen();
// Draw the hand back from the page (close up it would touch, not point).
await rec.moveHand(HAND_REST);
await rest();
await pause(1400);

// --- Close it with the bar's X: the dock comes back.
await rec.point('note-bar-close');
await pause(500);
await rec.tap('note-bar-close');
// The emulated pinch can miss a small button at low frame rates: tap again if needed.
if (await noteOpen()) {
  await pause(400);
  await rec.tap('note-bar-close');
}
await rest();
await rec.turnHead(FACING_DEG, 0, 1200);
await pause(1400);

// --- Open a note from Recent: it lands on the desk with its ink.
await rec.tap('dock-recent');
await rest();
await pause(1400);
await rec.point('dock-recent-card-1');
await pause(500);
await rec.tap('dock-recent-card-1');
await rest();
await pause(1400);
await rec.lookAt({ ...(await tabletAt()), x: tablet.x - 0.02 }, 1400);
await pause(2600);

const errors = await rec.finish('desk');
console.log(`${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
