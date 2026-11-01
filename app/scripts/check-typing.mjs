/**
 * Checks typing mode in the headset view (IWER, Quest 3 field of view) and
 * saves screenshots of each step in artifacts/typing/.
 *
 * Seated at the classroom desk with a new note:
 * - handwrite a heading with the pen, then switch to Type on the note bar:
 *   the page floats ahead, the headset's keyboard comes up (its hidden text
 *   field takes focus), and the caret waits just below the handwriting;
 * - type through that field as Meta's keyboard does (input events: text,
 *   line breaks, backspace); close it and bring it back with the toolbar;
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
// --- Staging: the page floats ahead, larger; the tablet's body goes; the headset's keyboard is asked for.
await pause(900);
const staged = () =>
  page.evaluate(() => {
    const scene = window.__metaNotes.world.scene;
    const tablet = window.__metaNotes.world.getSceneObject('tablet');
    const V = tablet.position.constructor;
    const face = new V(0, 0, 1).transformDirection(tablet.matrixWorld);
    // Any mesh shown that is not the page (or on it) is the tablet's body.
    let bodyShown = false;
    tablet.traverse((o) => {
      if (o.isMesh && o.visible && o.parent && o.parent.name !== 'WritingSurface' && o.name !== 'WritingSurface') {
        let p = o;
        let underPage = false;
        while (p) { if (p.name === 'WritingSurface') underPage = true; p = p.parent; }
        if (!underPage) bodyShown = true;
      }
    });
    return {
      scale: +tablet.scale.x.toFixed(2),
      faceUp: +face.y.toFixed(2),
      y: +tablet.position.y.toFixed(2),
      bodyShown,
      keyboardUp: document.activeElement?.tagName === 'TEXTAREA',
    };
  });
let stage = await staged();
expect(stage.scale > 1.2 && stage.faceUp < 0.5 && stage.y > 1.0, 'Type mode: the page floats ahead of the eyes, larger, upright', stage);
expect(!stage.bodyShown, "the tablet's body (bezel, pen, pad) is put away", stage);
expect(stage.keyboardUp, "the headset's keyboard is asked for (its text field has focus)", stage);
const pageCentre = () => page.evaluate(() => window.__metaNotes.demo.pagePoint(0.5, 0.5));
await rec.moveHead(SEAT);
await rec.lookAt(await pageCentre(), 500);
await shot('2-type-mode-floating');

// --- Meta's keyboard: what it types arrives as input events on the focused field (no key events).
/** One input event on the keyboard's field, as the system keyboard sends it. */
const systemInput = (inputType, data = null) =>
  page.evaluate(([type, d]) => {
    const field = document.activeElement;
    field.dispatchEvent(new InputEvent('input', { inputType: type, data: d, bubbles: true }));
  }, [inputType, data]);
for (const char of 'Hi therr') await systemInput('insertText', char);
await systemInput('deleteContentBackward');
await systemInput('insertText', 'e');
await systemInput('insertLineBreak');
await pause(200);
text = await typed();
expect(text[0].blocks[0].text === 'Hi there' && text[0].blocks.length === 2, "the headset keyboard types: letters, backspace, return", text[0].blocks);
// A suggestion being composed shows as it changes, and settles on the final word.
await systemInput('insertCompositionText', 'cel');
await systemInput('insertCompositionText', 'cells');
await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent('compositionend', { data: 'cells' })));
await systemInput('insertText', ' ');
text = await typed();
expect(text[0].blocks[1].text === 'cells ', 'composed text (suggestions) lands once, in its final form', text[0].blocks);
for (let i = 0; i < 6; i++) await systemInput('deleteContentBackward');
await shot('2b-typed-with-system-keyboard');
// Closing the keyboard (Done, or a tap outside) blurs the field; the toolbar's keyboard button brings it back.
await page.evaluate(() => document.activeElement.blur());
expect(!(await staged()).keyboardUp, 'closing the keyboard', {});
await rec.tap('tool-keyboard');
expect((await staged()).keyboardUp, "the toolbar's keyboard button brings it back", await staged());
await rec.lookAt(await pageCentre(), 500);

// --- A study note, with Markdown shortcuts.
await keys('# Cell cycle\n');
await keys('- **Interphase**: the cell grows\n');
await keys('Mitosis: it divides\n\n');
await keys('1. Prophase\nMetaphase\n\n');
await keys('[] review *chapter 5*');
text = await typed();
const blocks = text[0].blocks;
// Enter after the heading gives body text, which "- " makes a bullet; two Enters leave a list.
expect(blocks.map((b) => b.kind).join() === 'paragraph,title,bullet,bullet,numbered,numbered,checklist',
  'Markdown makes a heading, bullets, numbers and a checklist', blocks.map((b) => b.kind));
expect(blocks[2].bold.join() === 'Interphase', '**bold** is bold', blocks[2]);
await shot('3-typed-study-note');

// --- Undo the last word and redo it.
await page.keyboard.press('Control+z');
text = await typed();
const last = text[0].blocks.at(-1).text;
await page.keyboard.press('Control+y');
const back = (await typed())[0].blocks.at(-1).text;
expect(last !== back && back === 'review chapter 5', 'Ctrl+Z undoes, Ctrl+Y redoes', { last, back });

// --- The toolbar: lists, marks, a ray-drag selection, the checkbox, undo.
const lastBlock = async () => (await typed())[0].blocks.at(-1);
await page.keyboard.press('Enter');
await rec.tap('tool-bullet');
await keys('Spindle fibres');
expect((await lastBlock()).kind === 'bullet', 'the bullet-list button makes a list item', await lastBlock());
await rec.tap('tool-bold');
await keys(' pull apart');
expect((await lastBlock()).bold.join() === ' pull apart', 'Bold on the toolbar: what is typed next is bold', await lastBlock());
/** A page point at a block's character offset (on its line, mid-height). */
const textPoint = (block, offset) =>
  page.evaluate(([b, o]) => {
    const typing = window.__metaNotes.world.globals['metaNotes.typing'];
    const frame = typing.editor.frames[0];
    const at = typing.layout.caretAt(frame, { block: b, offset: o });
    const u = frame.x + at.x / 1000;
    const v = frame.y + (at.line.top + at.line.height / 2) / (1000 / (4 / 3));
    return window.__metaNotes.demo.pagePoint(u, v);
  }, [block, offset]);
const spindle = (await typed())[0].blocks.length - 1;
await rec.rayDrag(await textPoint(spindle, 0), await textPoint(spindle, 7), 900);
const selection = await page.evaluate(() => {
  const editor = window.__metaNotes.world.globals['metaNotes.typing'].editor;
  return { anchor: editor.anchor, caret: editor.caret };
});
expect(selection.anchor?.offset === 0 && selection.caret.offset === 7, 'a ray drag over the text selects it', selection);
await shot('5a-selection');
await rec.tap('tool-underline');
let underlined = await page.evaluate(() => window.__metaNotes.world.globals['metaNotes.typing'].editor.format().marks.underline);
expect(underlined, 'Underline applies to the selection, and the toolbar shows it on', { underlined });
await shot('5b-toolbar-state');
await rec.tap('tool-undo');
underlined = await page.evaluate(() => window.__metaNotes.world.globals['metaNotes.typing'].editor.format().marks.underline);
expect(!underlined, 'the undo button takes it back', { underlined });
const checklist = (await typed())[0].blocks.findIndex((b) => b.kind === 'checklist');
const box = await page.evaluate((b) => {
  const typing = window.__metaNotes.world.globals['metaNotes.typing'];
  const frame = typing.editor.frames[0];
  const marker = typing.layout.layoutFrame(frame).blocks[b].marker.box;
  return window.__metaNotes.demo.pagePoint(frame.x + (marker.x + marker.size / 2) / 1000, frame.y + (marker.y + marker.size / 2) / 750);
}, checklist);
await page.evaluate((p) => window.IWER_DEVICE.remote.dispatch('look_at', { device: 'hand-right', target: p }), box);
await pause(350);
await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_select_value', { device: 'hand-right', value: 1 }));
await pause(200);
await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_select_value', { device: 'hand-right', value: 0 }));
await pause(250);
expect((await typed())[0].blocks[checklist].checked === true, "a tap on a checklist item's box ticks it", (await typed())[0].blocks[checklist]);
await shot('5c-ticked');

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

// --- Resize from a corner; move by the grab bar.
const right = await worldOf('TypeResizeRight');
const centre = await pageCentre();
const outward = { x: right.x + (right.x - centre.x) * 0.25, y: right.y + (right.y - centre.y) * 0.25, z: right.z + (right.z - centre.z) * 0.25 };
await rec.rayDrag(right, outward, 900);
stage = await staged();
expect(stage.scale > 1.4, 'pulling a corner out makes the page larger', stage);
const before = await pageCentre();
const grab = await page.evaluate(() => window.__metaNotes.demo.objectCenter('type-toolbar-grab'));
await rec.rayDrag(grab, { x: grab.x, y: grab.y + 0.08, z: grab.z + 0.12 }, 900);
const after = await pageCentre();
expect(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) > 0.05, 'dragging the grab bar moves the page', { before, after });
await rec.lookAt(after, 500);
await shot('4b-resized-moved');

// --- Back to Write: the caret goes, the text stays.
await rec.tap('note-bar-mode-write');
await pause(900);
state = await typingState();
stage = await staged();
expect(stage.scale === 1 && stage.faceUp > 0.9 && stage.bodyShown && !stage.keyboardUp, 'Write mode: the page is back on the tablet, the keyboard put away', stage);
await rec.moveHead(LEANING_IN);
await rec.lookAt({ ...tablet, y: tablet.y - 0.1 }, 400);
text = await typed();
expect(state.mode === 'write' && state.frame === null && text.length === 2, 'Write mode: no caret; the text stays on the page', { state, n: text.length });
await shot('5-back-to-write');

const errors = await rec.finish('typing-check');
console.log(`errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
