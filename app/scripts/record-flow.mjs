/**
 * Records the whole flow, seated at a classroom desk, as the headset shows
 * it: Quest 3 field of view, no captions, UI animations at their true speed
 * (see lib/headset-recorder.mjs). The head looks straight ahead, as a
 * person sitting still would, and only looks down at the desk to write.
 *
 * The app's 3D classroom stands in for the real room (see record-desk.mjs
 * for how its desk lines up with the emulated table Quest would detect).
 *
 * Flow: only the dock at launch; Recent (the latest six), Show all
 * (scroll, then this week's notes), closed with its X; Templates: start a
 * lined page, which lands on the desk with the pen beside it; take notes
 * like a student: pinch the pen up, glance at the board between lines and
 * write each line on the page's rules, then set the pen back down beside
 * the tablet; close the page (the dock returns); open a note from
 * Recent, which lands with its ink, and close it; Settings: stick mode off
 * and on, then close.
 *
 * Usage: start the dev server (`npm run dev`), then npm run record:flow
 * Output: artifacts/flow.mp4
 */

import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

const lines = (rows, size, seed) =>
  rows.flatMap((t, i) => layoutLine(t, { u: 0.07, v: 0.16 + i * 0.13, size, seed: seed + i }).strokes);
const notes = [
  { title: 'Trip ideas', paper: 'dotted', strokes: lines(['coast road', 'pack light'], 0.0038, 41) },
  { title: 'Groceries', paper: 'checklist', strokes: lines(['milk, eggs', 'oats, coffee'], 0.0034, 31) },
  { title: 'Lab notes', paper: 'lined', strokes: lines(['Titration Thu', 'pH 7.2 at 3 pm'], 0.0032, 11) },
  { title: 'Reading list', paper: 'cornell', strokes: lines(['Dune', 'The Overstory'], 0.004, 51) },
  { title: 'Spanish verbs', paper: 'lined', strokes: lines(['ser, estar', 'tener'], 0.0036, 81) },
  { title: 'Gym plan', paper: 'checklist', strokes: lines(['squats', 'rows'], 0.0036, 101) },
  { title: 'Chem quiz', paper: 'grid', strokes: lines(['NaCl', 'H2O'], 0.0045, 121) },
  { title: 'Book club', paper: 'lined', strokes: lines(['ch. 7 by Fri'], 0.0036, 91) },
  { title: 'Physics ch. 4', paper: 'grid', strokes: lines(['F = ma', 'p = mv'], 0.0045, 21) },
];
/** Days since some notes were edited, so Show all's When filter has something to narrow. */
const EDITED_DAYS_AGO = { 'Trip ideas': 30, Groceries: 3, 'Lab notes': 12, 'Reading list': 45 };
/** Seated at the desk lined up on the emulated table (see record-desk.mjs). */
const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const FACING_DEG = 90;
const CLASSROOM_ORIGIN = { x: -1.045, z: 0.28 };
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
/** The chalkboard, where a student glances between lines (the classroom's front wall). */
const BOARD = { x: CLASSROOM_ORIGIN.x - 4.55, y: 1.55, z: CLASSROOM_ORIGIN.z };
/** What the student writes: one line per rule of the lined page, the heading underlined. */
const NOTES = [
  { text: 'Mitosis - ch. 5', rule: 2, underline: true },
  { text: 'cells divide in 4 stages', rule: 3 },
  { text: 'prophase, metaphase', rule: 4 },
  { text: 'anaphase, telophase', rule: 5 },
];
/** Lined paper has a rule every twelfth of the page; letters are about 1.5 cm tall. */
const RULE_V = 1 / 12;
const LETTER_SIZE = 0.0021;
/** One note line as pen strokes, sitting on its rule. */
const noteLine = ({ text, rule, underline }, seed = rule * 7) => {
  const v = rule * RULE_V - 0.006;
  const { strokes, right } = layoutLine(text, { u: 0.07, v, size: LETTER_SIZE, seed });
  if (underline) strokes.push([[0.065, v + 0.018], [right + 0.01, v + 0.016]]);
  return strokes;
};

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
/** The emulated pinch can miss a small button at low frame rates: tap once more if needed. */
const tapUntil = async (name, done) => {
  await rec.tap(name);
  if (!(await done())) {
    await pause(400);
    await rec.tap(name);
  }
};
const lookDownAtTablet = async (ms) => {
  const t = await tabletAt();
  await rec.lookAt({ ...t, x: t.x - 0.02 }, ms);
};
const lookAhead = (ms) => rec.turnHead(FACING_DEG, 0, ms);
/** Close the open note with its bar's X, the hand drawn back first (close up it would touch, not point). */
const closeNote = async () => {
  await rec.moveHand(HAND_REST);
  await rest();
  await rec.point('note-bar-close');
  await pause(500);
  await tapUntil('note-bar-close', async () => !(await noteOpen()));
  await rest();
  await lookAhead(1200);
  await pause(1200);
};

// --- Launch: only the dock, straight ahead.
await rest();
await pause(2200);

// --- Recent: the latest six; Show all: scroll, then this week's notes.
await rec.tap('dock-recent');
await rest();
await pause(1400);
for (const card of [0, 1, 2, 4]) {
  await rec.point(`dock-recent-card-${card}`);
  await pause(450);
}
await rec.tap('recent-tab-all');
await rest();
await pause(1300);
const grid = await rec.objectCenter('dock-popover-all');
await rec.rayDrag({ x: grid.x, y: grid.y - 0.05, z: grid.z }, { x: grid.x, y: grid.y + 0.14, z: grid.z }, 1300);
await rest();
await pause(800);
await rec.rayDrag({ x: grid.x, y: grid.y + 0.05, z: grid.z }, { x: grid.x, y: grid.y - 0.18, z: grid.z }, 1100);
await rest();
await pause(600);
await rec.tap('when-week');
await rest();
await pause(1600);
await rec.point('dock-popover-close');
await pause(400);
await rec.tap('dock-popover-close');
await rest();
await pause(1200);

// --- New note: the page lands on the desk with the pen beside it, straight away.
await tapUntil('dock-new', noteOpen);
await rest();
await pause(1600);
await lookDownAtTablet(1400);
await pause(1000);

// --- Taking notes like a student: glance at the board, then write a line
// on the page's rules, small and steady, and again; then set the pen down.
await rec.pickUpPen(1400);
await pause(300);
for (const [i, line] of NOTES.entries()) {
  if (i > 0) {
    await rec.lookAt(BOARD, 700);
    await pause(900);
    await lookDownAtTablet(700);
    await pause(200);
  }
  await rec.penWrite(noteLine(line));
}
await pause(500);
await rec.putDownPen();
await pause(1000);

// --- Close the page: the dock comes back.
await closeNote();

// --- Open a note from Recent: it lands on the desk with its ink.
await rec.tap('dock-recent');
await rest();
await pause(1300);
await rec.point('dock-recent-card-1');
await pause(500);
await tapUntil('dock-recent-card-1', noteOpen);
await rest();
await pause(1300);
await lookDownAtTablet(1300);
await pause(2200);
await closeNote();

// --- Settings: stick mode off and on, then close.
await rec.tap('dock-settings');
await rest();
await pause(1400);
await rec.tap('set-stick');
await rest();
await pause(1000);
await rec.tap('set-stick');
await rest();
await pause(1000);
await rec.point('dock-popover-close');
await pause(400);
await rec.tap('dock-popover-close');
await rest();
await pause(1800);

const errors = await rec.finish('flow');
console.log(`${fps.toFixed(1)} fps; speed-up x${speedUp.toFixed(2)}; errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
