/**
 * Local check for the nib shadow (not part of the app): opens a note on the
 * classroom desk, picks up the pen, holds the nib at set heights over the
 * page and screenshots each, writes a short stroke, then checks the spot is
 * gone off the page and once the pen is put down.
 *
 * Usage: dev server running, then node scripts/check-nib-shadow.mjs
 * Output: artifacts/nib-shadow/*.png and a table of the spot's state.
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

const MACRO = process.env.MACRO === '1';
const OUT = MACRO ? 'artifacts/nib-shadow-macro' : 'artifacts/nib-shadow';
mkdirSync(OUT, { recursive: true });
const TABLE_HEIGHT_M = 0.79;
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const FACING_DEG = 90;
const HAND_REST = { x: SEAT.x - 0.15, y: 0.98, z: SEAT.z + 0.15 };
const CLASSROOM_ORIGIN = { x: -1.045, z: 0.28 };

const rec = await startHeadsetRecording({
  size: { width: 1032, height: 800 },
  fovDeg: 96,
  captions: false,
  async prepare(r) {
    await r.page.evaluate(
      ([o, y, h]) => window.__metaNotes.demo.showClassroom(o, y, h),
      [CLASSROOM_ORIGIN, FACING_DEG, TABLE_HEIGHT_M],
    );
    await r.moveHead(SEAT);
    await r.moveHand(HAND_REST);
    await r.turnHead(FACING_DEG, 0, 100);
    await r.page.evaluate(() => window.__metaNotes.demo.recenterHome());
    await r.pause(800);
  },
});
const { page, pause } = rec;

/** Move the hand so the nib sits `height` metres above page point (u, v), then let a few frames render. */
const holdNib = (u, v, height) =>
  page.evaluate(
    async ([u, v, h]) => {
      const { world } = window.__metaNotes;
      const V = world.camera.position.constructor;
      const surface = world.scene.getObjectByName('WritingSurface');
      const pen = world.globals['metaNotes.pen'];
      const target = surface.localToWorld(new V((u - 0.5) * 0.36, (0.5 - v) * 0.27, h));
      for (let i = 0; i < 4; i++) {
        const hand = await window.__rec.handPosition();
        const goal = hand.add(target.clone().sub(pen.nib));
        await window.__rec.moveHandTo(goal, 250, window.__rec.grip);
        await new Promise((r) => setTimeout(r, 250));
      }
      return surface.worldToLocal(pen.nib.clone()).z;
    },
    [u, v, height],
  );

/** The spot's state as the app sees it. */
const spotState = () =>
  page.evaluate(() => {
    const spot = window.__metaNotes.world.scene.getObjectByName('NibShadow');
    if (!spot) return { found: false };
    const m = spot.material;
    const body = window.__metaNotes.world.scene.getObjectByName('PenBodyShadow');
    return {
      found: true,
      body: body ? `${body.visible ? 'on' : 'off'} ${(body.scale.x * 100).toFixed(1)}cm a${body.material.opacity.toFixed(2)}` : 'none',
      visible: spot.visible,
      diameterMm: +(spot.scale.x * 10).toFixed(2),
      opacity: +m.opacity.toFixed(3),
      renderOrder: spot.renderOrder,
      inkOrder: window.__metaNotes.world.scene.getObjectByName('InkLayer')?.renderOrder,
    };
  });

const results = [];
/** Where the nib is on screen (CSS pixels), for a close crop around it. */
const nibOnScreen = () =>
  page.evaluate(() => {
    const { world } = window.__metaNotes;
    const p = world.globals['metaNotes.pen'].nib.clone().project(world.camera);
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
  });
const shot = async (name, info) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const n = await nibOnScreen();
  const clip = { x: Math.max(0, Math.min(1032 - 240, n.x - 120)), y: Math.max(0, Math.min(800 - 180, n.y - 90)), width: 240, height: 180 };
  await page.screenshot({ path: `${OUT}/${name}-close.png`, clip });
  const state = await spotState();
  results.push({ name, ...info, ...state });
};

if (MACRO) await page.evaluate(() => (window.__macro = true));
// The classroom's demo lights don't exist on a headset (only the environment lights the models): off, as on a headset.
await page.evaluate(() => window.__metaNotes.world.scene.getObjectByName('DemoClassroom')?.traverse((o) => { if (o.isLight) o.visible = false; }));
await rec.tap('dock-new');
await pause(1600);
const tablet = await page.evaluate(() => {
  const p = window.__metaNotes.world.getSceneObject('tablet').position;
  return { x: p.x, y: p.y, z: p.z };
});
await rec.lookAt({ ...tablet, x: tablet.x - 0.02 }, 1000);
await pause(800);
await shot('0-pen-down-before', {});
await rec.pickUpPen(1400);
await pause(400);

// Lift clear of the page first (the pen starts beside the tablet, below the page).
await holdNib(0.45, 0.4, 0.06);
// Sit closer and look down at the page, the way one writes at a desk.
await page.evaluate(async () => {
  const { world } = window.__metaNotes;
  const V = world.camera.position.constructor;
  const s = world.scene.getObjectByName('WritingSurface');
  const writing = s.localToWorld(new V(-0.02, 0.03, 0));
  const head = world.camera.getWorldPosition(new V());
  const toward = writing.clone().sub(head).setY(0).normalize();
  const [back, up] = window.__macro ? [0.07, 0.14] : [0.3, 0.42];
  const seat = writing.clone().addScaledVector(toward, -back).setY(writing.y + up);
  await window.__rec.moveHead({ x: seat.x, y: seat.y, z: seat.z });
});
await rec.lookAt(await page.evaluate(() => {
  const { world } = window.__metaNotes;
  const p = world.scene.getObjectByName('WritingSurface').localToWorld(new (world.camera.position.constructor)(-0.02, 0.03, 0));
  return { x: p.x, y: p.y, z: p.z };
}), 600);
await pause(400);
await shot('1-above-6cm', { heightCm: 6 });
for (const [name, h] of [['2-at-2.7cm', 0.027], ['3-at-2cm', 0.02], ['4-at-1cm', 0.01], ['5-at-5mm', 0.005], ['6-touching', 0.001]]) {
  const real = await holdNib(0.45, 0.4, h);
  await pause(300);
  await shot(name, { heightCm: +(real * 100).toFixed(2) });
}
// A short stroke while touching: ink must draw over the spot.
await rec.penWrite([[[0.45, 0.4], [0.5, 0.41], [0.55, 0.4]]]);
await holdNib(0.55, 0.4, 0.001);
await pause(300);
await shot('7-inking-end-of-stroke', { heightCm: 0.1 });
await holdNib(0.55, 0.4, 0.0045);
await pause(300);
await shot('8-still-inking-at-4.5mm', { heightCm: 0.45 });
// Off the page (over the right bezel) and on the edge.
await holdNib(1.03, 0.4, 0.01);
await pause(300);
await shot('9-over-bezel', { heightCm: 1 });
await holdNib(0.995, 0.4, 0.003);
await pause(300);
await shot('10-at-page-edge', { heightCm: 0.3 });
await rec.putDownPen();
await rec.moveHand(HAND_REST);
await pause(600);
await shot('11-pen-put-down', {});

console.table(results);
const errors = rec.logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror'));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await page.context().close();
await page.context().browser()?.close();
process.exit(0);
