/**
 * Checks the infinite canvas in the headset view (IWER, Quest 3 field of
 * view) and saves screenshots of each step in artifacts/canvas/.
 *
 * Seated at the classroom desk with a new grid-paper note:
 * - handwrite a heading; zoom in on it: the ink and the grid grow, clipped
 *   at the page's edges; write while zoomed: the new ink lands in the right
 *   canvas spot, as thick on the page as ever;
 * - zoom out: the heading is small and the grid goes on past the first page;
 * - pan far to the right and write there: the canvas goes on;
 * - the view is saved with the note.
 *
 * Usage: dev server running, then `npm run check:canvas`.
 */

import { mkdirSync } from 'node:fs';
import { layoutLine } from './lib/handwriting.mjs';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

const SHOTS = 'artifacts/canvas';
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
  await r.pause(1500);
}

const rec = await startHeadsetRecording({ size: { width: 1032, height: 800 }, fovDeg: 96, captions: false, prepare });
const { page, pause } = rec;

const worldOf = (name) =>
  page.evaluate((n) => {
    const object = window.__metaNotes.world.scene.getObjectByName(n);
    const p = object.getWorldPosition(new object.position.constructor());
    return { x: p.x, y: p.y, z: p.z };
  }, name);
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
const setView = (view, save = false) => page.evaluate(([v, s]) => window.__metaNotes.session.setView(v, s), [view, save]);
const strokes = () =>
  page.evaluate(() =>
    window.__metaNotes.session.active.pages[0].strokes.map((s) => {
      const xs = s.points.filter((_, i) => i % 2 === 0);
      const ys = s.points.filter((_, i) => i % 2 === 1);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), width: s.width };
    }),
  );

// --- A grid-paper note on the desk; handwrite a heading.
await page.evaluate(async () => {
  await window.__metaNotes.session.createNote('Canvas', 'grid');
  window.__metaNotes.world.globals['metaNotes.noteView'].open();
});
await page.waitForFunction(() => window.__metaNotes.world.getSceneObject('tablet').position.y < 1.2, null, { timeout: 60000 });
const tablet = await worldOf('Tablet');
await rec.moveHead(LEANING_IN);
await rec.lookAt({ ...tablet, y: tablet.y - 0.1 }, 400);
await rec.pickUpPen(1000);
await rec.penWrite(layoutLine('Biology', { u: 0.08, v: 0.15, size: 0.0034, seed: 2 }).strokes);
await shot('1-home-view');
const before = await strokes();

// --- Zoom in on the heading: ink and grid grow; clipped at the page's edges.
await setView({ x: 0.22, y: 0.2, zoom: 2.5 });
await pause(300);
const layer = await page.evaluate(() => {
  const canvas = window.__metaNotes.world.scene.getObjectByName('InkCanvas');
  return { scale: +canvas.scale.x.toFixed(2) };
});
expect(layer.scale === 2.5, 'zooming in scales the ink with the canvas', layer);
await shot('2-zoomed-in');

// --- Write while zoomed in: the stroke lands in canvas coordinates, its width as on the page.
await rec.penWrite([[[0.2, 0.75], [0.8, 0.75]]], 0.07);
let all = await strokes();
const zoomedLine = all.at(-1);
expect(Math.abs(zoomedLine.minX - (0.22 + (0.2 - 0.5) / 2.5)) < 0.02 && Math.abs(zoomedLine.maxX - (0.22 + 0.3 / 2.5)) < 0.02,
  'ink written zoomed in lands where it shows on the canvas', zoomedLine);
expect(Math.abs(zoomedLine.width - before[0].width / 2.5) < 1e-6, 'and is as thick on the page as ever (thinner on the canvas)', { zoomed: zoomedLine.width, home: before[0].width });

// --- Zoom out: the heading is small; the grid goes on past the first page.
await setView({ x: 0.5, y: 0.5, zoom: 0.4 });
await shot('3-zoomed-out');

// --- Pan far to the right and write there.
await setView({ x: 3.2, y: 0.5, zoom: 1 });
await rec.penWrite(layoutLine('far away', { u: 0.2, v: 0.4, size: 0.0034, seed: 4 }).strokes);
all = await strokes();
expect(all.at(-1).minX > 2.5, 'the canvas goes on: ink written after a pan lands far from the first page', all.at(-1));
await shot('4-panned-right');

// --- Back home; the view is saved with the note.
await setView({ x: 0.5, y: 0.5, zoom: 0.6 }, true);
await pause(800);
const saved = await page.evaluate(async () => {
  const id = window.__metaNotes.session.active.id;
  const stored = await window.__metaNotes.store.get(id);
  return stored.pages[0].view;
});
expect(saved && saved.zoom === 0.6, 'the view is saved with the note', saved);
await shot('5-everything');

// --- Phase 2: by hand. Pen down; back to the first page's area.
await rec.putDownPen();
await rec.moveHand(HAND_REST);
await setView({ x: 0.5, y: 0.5, zoom: 1 });
const pagePoint = (u, v) => page.evaluate(([a, b]) => window.__metaNotes.demo.pagePoint(a, b), [u, v]);
const view = () => page.evaluate(() => window.__metaNotes.session.getView());
await page.evaluate(() => {
  const device = window.IWER_DEVICE;
  const { world } = window.__metaNotes;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => world.renderer.info.render.frame;
  const nextFrame = async () => {
    const f = frame();
    while (frame() === f) await sleep(8);
  };
  const call = (method, params) => device.remote.dispatch(method, params);
  const offsets = {};
  /** Pinch (or let go with) `hand` with its pinch closing at a world point; or move it there, pinched. */
  window.__grab = {
    async measure(hand) {
      const id = `hand-${hand}`;
      await call('set_select_value', { device: id, value: 1 });
      for (let i = 0; i < 3; i++) await nextFrame();
      const at = (await call('get_transform', { device: id })).position;
      const p = await window.__rec.pinchPoint(hand);
      offsets[hand] = { x: p.x - at.x, y: p.y - at.y, z: p.z - at.z };
      await call('set_select_value', { device: id, value: 0 });
      for (let i = 0; i < 3; i++) await nextFrame();
    },
    async move(hand, to, ms, speedUp) {
      const id = `hand-${hand}`;
      const from = (await call('get_transform', { device: id })).position;
      const o = offsets[hand];
      const target = { x: to.x - o.x, y: to.y - o.y, z: to.z - o.z };
      const t0 = performance.now();
      for (;;) {
        const t = Math.min(1, (performance.now() - t0) / (ms * speedUp));
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        await call('set_transform', {
          device: id,
          position: { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e },
        });
        if (t >= 1) break;
        await nextFrame();
      }
      await nextFrame();
    },
    async pinch(hand, value) {
      await call('set_select_value', { device: `hand-${hand}`, value });
      for (let i = 0; i < 3; i++) await nextFrame();
    },
  };
});
const grab = {
  measure: (hand) => page.evaluate((h) => window.__grab.measure(h), hand),
  move: (hand, to, ms = 600) => page.evaluate(([h, t, m, s]) => window.__grab.move(h, t, m, s), [hand, to, ms, rec.speedUp]),
  pinch: (hand, value) => page.evaluate(([h, v]) => window.__grab.pinch(h, v), [hand, value]),
};
// Each hand's pinch point, measured away from the page (a pinch there takes nothing).
await grab.measure('left');
await grab.measure('right');
const inkBefore = (await strokes()).length;

// One hand: pinch the page and slide it left; the canvas follows.
await grab.move('left', await pagePoint(0.65, 0.5));
await grab.pinch('left', 1);
await grab.move('left', await pagePoint(0.35, 0.5), 900);
let v = await view();
await shot('6-one-hand-pan');
await grab.pinch('left', 0);
expect(Math.abs(v.x - 0.8) < 0.04 && Math.abs(v.zoom - 1) < 0.01, 'one hand pinching the page pans the canvas with it', v);
await grab.move('left', LEFT_REST);

// Two hands: pinch the page with both and pull them apart: it zooms in around the point between them.
await grab.move('left', await pagePoint(0.38, 0.5));
await grab.move('right', await pagePoint(0.62, 0.5));
await grab.pinch('left', 1);
await grab.pinch('right', 1);
const leftTo = await pagePoint(0.26, 0.5);
const rightTo = await pagePoint(0.74, 0.5);
await Promise.all([grab.move('left', leftTo, 900), grab.move('right', rightTo, 900)]);
v = await view();
await shot('7-two-hand-zoom');
await grab.pinch('left', 0);
await grab.pinch('right', 0);
expect(Math.abs(v.zoom - 2) < 0.2, 'two hands pulled apart zoom in (twice as far apart: twice as close)', v);
expect((await strokes()).length === inkBefore, 'pinching the page draws no ink', { before: inkBefore, after: (await strokes()).length });
await pause(800);
const saved2 = await page.evaluate(async () => (await window.__metaNotes.store.get(window.__metaNotes.session.active.id)).pages[0].view);
expect(saved2 && Math.abs(saved2.zoom - v.zoom) < 0.01, 'letting go keeps the view and saves it', { saved2, v });
await grab.move('left', LEFT_REST);
await rec.moveHand(HAND_REST);

// The zoom readout: a tap goes back to the first page's area.
await rec.tap('note-bar-zoom');
await pause(900);
v = await view();
expect(Math.abs(v.zoom - 1) < 0.01 && Math.abs(v.x - 0.5) < 0.01, "a tap on the zoom readout goes back home", v);
await rec.moveHand(HAND_REST);

// With the pen in hand, the free hand pans (and does not open the tool wheel).
await rec.pickUpPen(1000);
await grab.move('left', await pagePoint(0.5, 0.6));
await grab.pinch('left', 1);
await grab.move('left', await pagePoint(0.5, 0.35), 900);
await grab.pinch('left', 0);
v = await view();
const wheel = await page.evaluate(() => window.__metaNotes.world.globals['metaNotes.tools'].wheelOpen);
expect(Math.abs(v.y - 0.75) < 0.04 && !wheel, 'with the pen in hand, the free hand pans; the tool wheel stays shut', { v, wheel });
await grab.move('left', LEFT_REST);
await shot('8-pan-with-pen');
await rec.putDownPen();

const errors = await rec.finish('canvas-check');
console.log(`errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
