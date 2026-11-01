/**
 * Local check for the pen's feel (not part of the app):
 * - steadiness: holds the pen still while shaking the tracked hand by
 *   +-1.5 mm every frame (like real hand tracking), and compares how far the
 *   raw pinch point and the pen's nib wander;
 * - lag: moves the hand at a steady 10 cm/s and measures how far the nib
 *   trails the raw pinch point;
 * - the touch-down tick: counts sounds played while writing;
 * - ink weight: writes slowly, then quickly, and reads the stored widths;
 * - old notes: adds a stroke with no widths and checks it still draws.
 *
 * Usage: dev server running, then node scripts/check-pen-feel.mjs
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { startHeadsetRecording } from './lib/headset-recorder.mjs';

// Screenshots only: drop the recorder's video, which needs Playwright's ffmpeg.
const launch = chromium.launch.bind(chromium);
chromium.launch = async (options) => {
  const browser = await launch(options);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = ({ recordVideo, ...rest } = {}) => newContext(rest);
  return browser;
};

const OUT = 'artifacts/pen-feel';
mkdirSync(OUT, { recursive: true });
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };

const rec = await startHeadsetRecording({
  size: { width: 1032, height: 800 },
  fovDeg: 96,
  captions: false,
  async prepare(r) {
    await r.page.evaluate(() => window.__metaNotes.demo.showClassroom({ x: -1.045, z: 0.28 }, 90, 0.79));
    await r.moveHead(SEAT);
    await r.moveHand(HAND_REST);
    await r.turnHead(90, 0, 100);
    await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
    await r.pause(800);
  },
});
const { page, pause } = rec;

// Count every sound the app makes (each tick or chime starts at least one oscillator).
await page.evaluate(() => {
  window.__sounds = 0;
  const original = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (...args) {
    window.__sounds++;
    return original.apply(this, args);
  };
});

await rec.tap('dock-new');
await pause(1600);
const tablet = await page.evaluate(() => {
  const p = window.__metaNotes.world.getSceneObject('tablet').position;
  return { x: p.x, y: p.y, z: p.z };
});
await rec.lookAt({ ...tablet, x: tablet.x - 0.02 }, 800);
await rec.pickUpPen(1200);
// Lift clear of the page and hold.
await page.evaluate(async () => {
  const h = await window.__rec.handPosition();
  await window.__rec.moveHandTo(h.add(new h.constructor(0, 0.06, 0)), 400, window.__rec.grip);
});

/** Shake the hand around a fixed point for `frames` frames; returns raw and nib spreads (mm). */
const shake = () =>
  page.evaluate(async () => {
    const { world } = window.__metaNotes;
    const pens = world.getSystems().find((s) => s.constructor.name === 'PenSystem');
    const centre = await window.__rec.handPosition();
    const raw = [];
    const nib = [];
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    for (let i = 0; i < 60; i++) {
      const j = () => (Math.random() * 2 - 1) * 0.0015;
      const p = centre.clone().add(new centre.constructor(j(), j(), j()));
      await window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: { x: p.x, y: p.y, z: p.z }, orientation: window.__rec.grip });
      await frame();
      await frame();
      if (i >= 10) {
        raw.push(pens.readings[pens.holder].point.clone());
        nib.push(world.globals['metaNotes.pen'].nib.clone());
      }
    }
    // Average frame-to-frame movement, in millimetres.
    const wander = (list) => {
      let sum = 0;
      for (let i = 1; i < list.length; i++) sum += list[i].distanceTo(list[i - 1]);
      return +((sum / (list.length - 1)) * 1000).toFixed(2);
    };
    return { rawMovePerFrameMm: wander(raw), nibMovePerFrameMm: wander(nib) };
  });

/** Move the hand steadily at 10 cm/s and measure how far the steadied point trails the raw one (mm). */
const lag = () =>
  page.evaluate(async () => {
    const { world } = window.__metaNotes;
    const pens = world.getSystems().find((s) => s.constructor.name === 'PenSystem');
    const start = await window.__rec.handPosition();
    const t0 = performance.now();
    const gaps = [];
    for (;;) {
      const t = (performance.now() - t0) / 1000;
      if (t > 1.2) break;
      const p = start.clone().add(new start.constructor(0.1 * t, 0, 0));
      await window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: { x: p.x, y: p.y, z: p.z }, orientation: window.__rec.grip });
      await new Promise((r) => requestAnimationFrame(() => r()));
      if (t > 0.5) gaps.push(pens.readings[pens.holder].point.distanceTo(pens.steady.point));
    }
    return { trailAt10cmPerSecMm: +((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 1000).toFixed(2) };
  });

const steadiness = await shake();
const trail = await lag();

// Ink weight: one slow stroke, then one fast one.
const soundsBefore = await page.evaluate(() => window.__sounds);
await rec.penWrite([[[0.2, 0.3], [0.3, 0.3]]], 0.02);
await rec.penWrite([[[0.2, 0.4], [0.5, 0.4]]], 0.25);
await rec.penWrite([[[0.2, 0.5], [0.25, 0.52]], [[0.3, 0.5], [0.35, 0.52]], [[0.4, 0.5], [0.45, 0.52]]]);
const soundsAfter = await page.evaluate(() => window.__sounds);
const weights = await page.evaluate(() => {
  const strokes = window.__metaNotes.session.active.pages[0].strokes;
  const avg = (s) => (s.widths ? +(s.widths.slice(2).reduce((a, b) => a + b, 0) / Math.max(1, s.widths.length - 2)).toFixed(2) : null);
  return { strokes: strokes.length, slowAvg: avg(strokes[0]), fastAvg: avg(strokes[1]), widthsMatchPoints: strokes.every((s) => !s.widths || s.widths.length === s.points.length / 2) };
});
await page.screenshot({ path: `${OUT}/ink-weight.png` });

// An old-style stroke (no widths) still draws.
const oldStroke = await page.evaluate(() => {
  const { session, world } = window.__metaNotes;
  session.commitStroke({ id: 'old-style', tool: 'pen', color: '#1f1c19', width: 0.004, points: [0.6, 0.6, 0.7, 0.62, 0.8, 0.6] });
  // Reopen the page so it is drawn from the saved data.
  const ink = world.getSystems().find((s) => s.constructor.name === 'InkSystem');
  for (const t of ink.tablets.values()) ink.renderPage(t, session.active.pages[0]);
  const mesh = world.scene.getObjectByName('Stroke:old-style');
  return { drawn: !!mesh, vertices: mesh?.geometry.drawRange.count ?? 0 };
});

console.log(JSON.stringify({ ...steadiness, ...trail, ticksWhileWriting: soundsAfter - soundsBefore, ...weights, oldStroke }, null, 1));
const errors = rec.logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror'));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await page.context().close();
await page.context().browser()?.close();
process.exit(0);
