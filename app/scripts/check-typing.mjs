/**
 * Checks typing mode in the headset view (IWER, Quest 3 field of view) and
 * saves screenshots of each step in artifacts/typing/.
 *
 * Seated at the classroom desk with a new note:
 * - handwrite a heading with the pen, then switch to Type on the note bar:
 *   the caret waits just below the handwriting;
 * - type a short study note with a real keyboard (Markdown shortcuts make a
 *   heading, bullets, bold, a numbered list and a checklist);
 * - tap elsewhere on the page: a new text box starts there;
 * - switch back to Write: the caret goes, the text stays.
 *
 * Each step asserts the app's state; a failure stops the check with a
 * reason. Usage: dev server running, then `npm run check:typing`.
 */

import { mkdirSync } from 'node:fs';
import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

const SHOTS = 'artifacts/typing';
const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LEANING_IN = { x: -1.1, y: 1.17, z: 0.3 };
const FACING_DEG = 90;
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
const LEFT_REST = { x: -0.95, y: 0.8, z: 0.55 };
const CLASSROOM_ORIGIN = { x: -1.045, z: 0.28 };

mkdirSync(SHOTS, { recursive: true });

async function prepare(r) {
  await r.page.evaluate(
    ([origin, yaw, height]) => window.__metaNotes.demo.showClassroom(origin, yaw, height),
    [CLASSROOM_ORIGIN, FACING_DEG, TABLE_HEIGHT_M],
  );
  await r.moveHead(SEAT);
  await r.moveHand(HAND_REST);
  await r.moveLeftHand(LEFT_REST);
  await r.turnHead(FACING_DEG, 0, 100);
  await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
  await r.pause(600);
}

const rec = await startHeadsetRecording({ size: { width: 1032, height: 800 }, fovDeg: 96, captions: false, prepare });
const { page, pause } = rec;

const worldOf = (name) =>
  page.evaluate((n) => {
    const object = window.__metaNotes.world.scene.getObjectByName(n);
    const p = object.getWorldPosition(new object.position.constructor());
    return { x: p.x, y: p.y, z: p.z };
  }, name);
/** The open page's typed text: each frame's blocks as kind, text and marks. */
const typed = () =>
  page.evaluate(() =>
    (window.__metaNotes.session.active.pages[0].frames ?? []).map((frame) => ({
      x: +frame.x.toFixed(3),
      y: +frame.y.toFixed(3),
      blocks: frame.blocks.map((b) => ({
        kind: b.kind,
        text: b.runs.map((r) => r.text).join(''),
        bold: b.runs.filter((r) => r.bold).map((r) => r.text),
        checked: b.checked,
        indent: b.indent,
      })),
    })),
  );
const typingState = () =>
  page.evaluate(() => {
    const typing = window.__metaNotes.world.globals['metaNotes.typing'];
    return { mode: typing.mode, frame: typing.editor.frame?.id ?? null, caret: typing.editor.caret };
  });
const shot = async (name) => {
  await pause(300);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
function expect(condition, message, state) {
  if (!condition) {
    console.log(rec.logs.filter((l) => l.includes('MetaNotes') || l.includes('rror')).slice(-12).join('\n'));
    throw new Error(`${message}: ${JSON.stringify(state)}`);
  }
  console.log(`ok - ${message}`);
}
/** Type on the real keyboard, a key at a time ('\n' is Enter). */
async function keys(text) {
  for (const char of text) {
    if (char === '\n') await page.keyboard.press('Enter');
    else await page.keyboard.type(char);
  }
  await pause(150);
}

// --- A new note on the desk; handwrite a heading. (The dock settles after its recenter first.)
await pause(1500);
await rec.tap('dock-new');
await page.waitForFunction(() => window.__metaNotes.world.getSceneObject('tablet').position.y < 1.2, null, { timeout: 60000 });
const tablet = await worldOf('Tablet');
await rec.moveHead(LEANING_IN);
await rec.lookAt({ ...tablet, y: tablet.y - 0.1 }, 400);
await rec.pickUpPen(1000);
await rec.penWrite(layoutLine('Biology', { u: 0.07, v: 0.12, size: 0.0032, seed: 2 }).strokes);
await rec.putDownPen();
await rec.moveHand(HAND_REST);
await shot('1-handwriting');

// --- Type mode: the caret waits below the handwriting.
await rec.tap('note-bar-mode-type');
await pause(400);
let state = await typingState();
let text = await typed();
expect(state.mode === 'type', 'the Type toggle switches to typing', state);
expect(text.length === 1 && text[0].y > 0.12 && text[0].y < 0.3, 'typing starts just below the handwriting', text);
await shot('2-type-mode-caret');

// --- A study note, with Markdown shortcuts.
await keys('# Cell cycle\n');
await keys('- **Interphase**: the cell grows\n');
await keys('Mitosis: it divides\n\n');
await keys('1. Prophase\nMetaphase\n\n');
await keys('[] review *chapter 5*');
text = await typed();
const blocks = text[0].blocks;
// Enter after the heading gives body text, which "- " makes a bullet; two Enters leave a list.
expect(blocks.map((b) => b.kind).join() === 'title,bullet,bullet,numbered,numbered,checklist',
  'Markdown makes a heading, bullets, numbers and a checklist', blocks.map((b) => b.kind));
expect(blocks[1].bold.join() === 'Interphase', '**bold** is bold', blocks[1]);
await rec.lookAt({ ...tablet, y: tablet.y - 0.05 }, 400);
await shot('3-typed-study-note');

// --- Undo the last word and redo it.
await page.keyboard.press('Control+z');
text = await typed();
const last = text[0].blocks.at(-1).text;
await page.keyboard.press('Control+y');
const back = (await typed())[0].blocks.at(-1).text;
expect(last !== back && back === 'review chapter 5', 'Ctrl+Z undoes, Ctrl+Y redoes', { last, back });

// --- Tap elsewhere: a new text box there.
const tapAt = async (u, v) => {
  const point = await page.evaluate(([pu, pv]) => window.__metaNotes.demo.pagePoint(pu, pv), [u, v]);
  await page.evaluate((p) => window.IWER_DEVICE.remote.dispatch('look_at', { device: 'hand-right', target: p }), point);
  await pause(350);
  await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_select_value', { device: 'hand-right', value: 1 }));
  await pause(200);
  await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_select_value', { device: 'hand-right', value: 0 }));
  await pause(250);
};
await tapAt(0.6, 0.15);
await keys('Quiz on Friday');
text = await typed();
expect(text.length === 2 && Math.abs(text[1].x - 0.6) < 0.02 && text[1].blocks[0].text === 'Quiz on Friday', 'a tap on the page starts a text box there', text);
await shot('4-second-text-box');

// --- Back to Write: the caret goes, the text stays.
await rec.tap('note-bar-mode-write');
state = await typingState();
text = await typed();
expect(state.mode === 'write' && state.frame === null && text.length === 2, 'Write mode: no caret; the text stays on the page', { state, n: text.length });
await shot('5-back-to-write');

const errors = await rec.finish('typing-check');
console.log(`errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
