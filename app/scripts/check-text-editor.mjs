/**
 * Checks the typing editor and its layout without a browser: the word
 * processor rules (Enter, Backspace, lists, marks, Markdown shortcuts,
 * undo) and caret placement, with a fixed-width stand-in for text
 * measurement (each character is half its font size wide).
 *
 * Usage: `npm run check:text-editor`.
 */

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = `
export { TextEditor } from './src/text/text-editor.ts';
export { TextLayout, PAGE_UNITS } from './src/text/text-layout.ts';
export { blockText, parseFrames } from './src/notes/typed-text.ts';
export { createPage, parsePage } from './src/notes/note-model.ts';
`;
const out = join(mkdtempSync(join(tmpdir(), 'text-editor-')), 'bundle.mjs');
await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
globalThis.crypto ??= (await import('node:crypto')).webcrypto;
const { TextEditor, TextLayout, PAGE_UNITS, blockText, createPage, parsePage } = await import(pathToFileURL(out).href);

let failures = 0;
let step = 0;
function check(name, ok, detail = '') {
  step++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${String(step).padStart(2)} ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures++;
}

// Every character is half its size wide (monospace stand-in).
const measure = (font, text) => Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]) * 0.5 * text.length;
let clock = 0;
const layout = new TextLayout(measure);
const fresh = () => {
  const page = createPage();
  const editor = new TextEditor(layout, () => clock);
  editor.setPage(page);
  editor.typeAt(0.1, 0.5);
  return { page, editor };
};
const typeAll = (editor, text) => {
  for (const char of text) {
    clock += 50;
    if (char === '\n') editor.enter();
    else editor.type(char);
  }
};
const texts = (editor) => editor.frame.blocks.map((b) => blockText(b));
const kinds = (editor) => editor.frame.blocks.map((b) => b.kind);

{
  const { page, editor } = fresh();
  check('a tap on an empty spot starts a frame there', page.frames.length === 1 && page.frames[0].x === 0.1 && page.frames[0].y === 0.5);
  typeAll(editor, 'Hello world');
  check('typing goes in', texts(editor)[0] === 'Hello world');
  typeAll(editor, '\nSecond');
  check('Enter starts a new paragraph', texts(editor).join('|') === 'Hello world|Second');
  editor.move('line-start');
  editor.backspace();
  check('Backspace at a paragraph start joins it to the one before', texts(editor).join('|') === 'Hello worldSecond' && editor.caret.offset === 11);
}

{
  const { editor } = fresh();
  typeAll(editor, '- milk\neggs\n');
  check('"- " starts a bullet list; Enter continues it', kinds(editor).join() === 'bullet,bullet,bullet' && texts(editor).join('|') === 'milk|eggs|');
  editor.enter();
  check('Enter on an empty item leaves the list', kinds(editor).join() === 'bullet,bullet,paragraph');
  const { editor: e2 } = fresh();
  typeAll(e2, '1. one\n');
  e2.indent(1);
  typeAll(e2, 'nested');
  check('"1. " numbers; Tab nests', kinds(e2).join() === 'numbered,numbered' && e2.frame.blocks[1].indent === 1);
  const frameLayout = layout.layoutFrame(e2.frame);
  check('nested numbers go a, b', frameLayout.blocks[0].marker.text === '1.' && frameLayout.blocks[1].marker.text === 'a.');
  e2.move('line-start');
  e2.backspace();
  check('Backspace at an item start un-nests it first', e2.frame.blocks[1].indent === 0 && kinds(e2)[1] === 'numbered');
  e2.backspace();
  check('then makes it body text', kinds(e2)[1] === 'paragraph');
}

{
  const { editor } = fresh();
  typeAll(editor, '[] buy milk');
  check('"[] " starts a checklist', kinds(editor)[0] === 'checklist' && editor.frame.blocks[0].checked === false);
  editor.toggleChecked(editor.frame.id, 0);
  check('the box ticks', editor.frame.blocks[0].checked === true);
  const { editor: e2 } = fresh();
  typeAll(e2, '## Plan\nbody');
  check('"## " is a heading, and Enter after it goes back to body text', kinds(e2).join() === 'heading,paragraph');
}

{
  const { editor } = fresh();
  typeAll(editor, 'make this **bold** now');
  const runs = editor.frame.blocks[0].runs;
  check('**bold** becomes bold', blockText(editor.frame.blocks[0]) === 'make this bold now' && runs.some((r) => r.bold && r.text === 'bold') && runs.some((r) => !r.bold && r.text === ' now'));
  const { editor: e2 } = fresh();
  typeAll(e2, 'an *italic* word');
  check('*italic* becomes italic', e2.frame.blocks[0].runs.some((r) => r.italic && r.text === 'italic'));
  const { editor: e3 } = fresh();
  e3.toggleMark('bold');
  typeAll(e3, 'Bold');
  e3.toggleMark('bold');
  typeAll(e3, ' plain');
  const r3 = e3.frame.blocks[0].runs;
  check('Bold on, type, Bold off, type', r3.length === 2 && r3[0].bold && r3[0].text === 'Bold' && !r3[1].bold);
  e3.selectAll();
  e3.toggleMark('underline');
  check('a mark over a selection', e3.frame.blocks[0].runs.every((r) => r.underline));
  check('the toolbar state reads it', e3.format().marks.underline === true && e3.format().marks.bold === false);
}

{
  const { editor } = fresh();
  typeAll(editor, 'one two');
  clock += 5000;
  typeAll(editor, ' three');
  editor.undo();
  check('undo takes back the last words typed', texts(editor)[0] === 'one two', texts(editor)[0]);
  editor.redo();
  check('redo puts them back', texts(editor)[0] === 'one two three');
  const { editor: e2 } = fresh();
  typeAll(e2, '- ');
  e2.undo();
  check('undo right after a shortcut brings back what was typed', texts(e2)[0] === '- ' && kinds(e2)[0] === 'paragraph');
}

{
  // Wrapping: a frame 0.3 page wide = 300 units, body text 12 units a character: 25 characters a line.
  const page = createPage();
  const editor = new TextEditor(layout, () => clock);
  editor.setPage(page);
  editor.newFrame(0.1, 0.1, 0.3);
  typeAll(editor, 'the quick brown fox jumps over the lazy dog again and again');
  const lines = layout.layoutFrame(editor.frame).blocks[0].lines;
  check('long text wraps at spaces', lines.length > 1 && lines.every((l) => l.carets[l.carets.length - 1] - l.carets[0] <= 300 + 12));
  editor.move('start');
  editor.move('down');
  check('Down goes to the next line', editor.caret.offset === lines[1].start, `${editor.caret.offset} vs ${lines[1].start}`);
  const at = layout.positionAt(editor.frame, 0.1 + (12 * 4) / PAGE_UNITS, 0.1 + 0.005);
  check('a tap finds the character under it', at.block === 0 && at.offset === 4, JSON.stringify(at));
  const hit = layout.frameAt(page.frames, 0.15, 0.11);
  const miss = layout.frameAt(page.frames, 0.8, 0.8);
  check('a tap inside a frame lands in it; elsewhere not', hit === editor.frame && miss === null);
  editor.blur();
  editor.typeAt(0.7, 0.8);
  editor.typeAt(0.2, 0.9);
  check('an empty frame left behind is removed', page.frames.length === 2, String(page.frames.length));
}

{
  const { page, editor } = fresh();
  typeAll(editor, '# Title\n- **item**');
  const stored = JSON.parse(JSON.stringify(page));
  const back = parsePage(stored);
  check('frames survive saving and loading', back.frames.length === 1 && back.frames[0].blocks[1].runs[0].bold === true && back.frames[0].blocks[0].kind === 'title');
  check('bad frames are dropped, not thrown', parsePage({ id: 'p', strokes: [], frames: [{ id: 1 }, null] }).frames === undefined);
}

console.log(failures === 0 ? `\nall ${step} passed` : `\n${failures} of ${step} failed`);
process.exit(failures === 0 ? 0 : 1);
