/**
 * Shared helpers for the smoke scripts: launch Chromium against the running
 * dev server and drive the app through real pointer and keyboard input.
 *
 * UI elements are found by projecting their 3D position through the desktop
 * camera (via the dev-only `window.__metaNotes` hook), so the scripts do not
 * depend on hard-coded pixel positions.
 */

import { chromium } from 'playwright';

export const APP_URL = process.env.APP_URL ?? 'https://localhost:8081/';
export const VIEWPORT = { width: 780, height: 493 };

/** Launch Chromium with optional extra flags (for example a fake camera). */
export async function launchBrowser(extraArgs = []) {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--ignore-certificate-errors', ...extraArgs],
  });
}

/** Open the app in a page and collect app log lines and errors. */
export async function openApp(context, url = APP_URL) {
  const page = await context.newPage();
  const logs = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[MetaNotes') || message.type() === 'error') {
      logs.push(`${message.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await waitForApp(page);
  return { page, logs };
}

/** Wait until the world, panels, and note session are ready. */
export async function waitForApp(page) {
  await page.waitForFunction(
    () => {
      const hooks = window.__metaNotes;
      return (
        hooks?.session?.loaded === true &&
        hooks.world.scene.getObjectByName('note-new-button') !== undefined
      );
    },
    undefined,
    { timeout: 20000 },
  );
  // Give UIKit one more moment to lay out text and inputs.
  await page.waitForTimeout(500);
  // Warm up the pointer: the first press after a page load is dropped while
  // IWSDK creates the pointer. Press once on empty background in the top-left
  // corner (no listeners there, away from the Enter XR button at top center)
  // so the first real click is not lost.
  await page.mouse.move(12, 12);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

/** Project a named 3D object's world position to viewport pixels. */
export async function screenPointOf(page, objectName) {
  const point = await page.evaluate((name) => {
    const { world, demo } = window.__metaNotes;
    // The app's own helper knows where nested UIKit elements really are.
    const center = demo.objectCenter(name);
    if (!center) return null;
    const p = world.camera.position.clone().set(center.x, center.y, center.z).project(world.camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  }, objectName);
  if (!point) throw new Error(`3D object "${objectName}" not found.`);
  return point;
}

/** Viewport pixels for a page coordinate (u, v in 0..1) on the tablet. */
export async function tabletPoint(page, u, v) {
  return page.evaluate(
    ([pu, pv]) => {
      const { world } = window.__metaNotes;
      const surface = world.scene.getObjectByName('WritingSurface');
      const params = surface.geometry.parameters;
      const p = surface.position.clone().set(
        (pu - 0.5) * params.width,
        (0.5 - pv) * params.height,
        0,
      );
      surface.localToWorld(p).project(world.camera);
      return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
    },
    [u, v],
  );
}

let pressHoldMs = 200;
/** Hold presses longer on slow renderers (for example while recording video). */
export function setPressHoldMs(ms) {
  pressHoldMs = ms;
}

/** Hover first so the 3D pointer has an intersection, then press and release. */
export async function pressAt(page, point) {
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  // Hold across several frames: IWSDK processes pointer input once per frame,
  // so a press shorter than one frame can be missed on a slow renderer.
  await page.waitForTimeout(pressHoldMs);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

export async function clickObject(page, objectName) {
  await pressAt(page, await screenPointOf(page, objectName));
}

/** How many verified clicks needed more than one press (reported by scripts). */
export const clickStats = { retries: 0 };

/**
 * Click a 3D UI control and wait for `effect` (a page predicate) to hold.
 * Under the slow software renderer a press is occasionally dropped, so press
 * again at most twice, counting each retry. A control that truly does not
 * work still fails after three presses.
 */
export async function clickUntil(page, objectName, effect, timeoutMs = 4000) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await clickObject(page, objectName);
    try {
      await page.waitForFunction(effect, undefined, { timeout: timeoutMs });
      return;
    } catch {
      if (attempt < 3) clickStats.retries++;
    }
  }
  throw new Error(`Clicking ${objectName} had no effect after 3 presses.`);
}

/** Draw a straight stroke on the tablet between two page coordinates. */
export async function drawStroke(page, from, to, steps = 24) {
  const a = await tabletPoint(page, from[0], from[1]);
  const b = await tabletPoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  await page.waitForTimeout(100);
}

/**
 * Draw one stroke through several page coordinates ([u, v] pairs, 0..1),
 * moving in small steps like a real pointer. `stepDelayMs` sets the pace.
 */
export async function drawPath(page, points, stepDelayMs = 8, stepsPerSegment = 12) {
  const pixels = [];
  for (const [u, v] of points) pixels.push(await tabletPoint(page, u, v));
  await page.mouse.move(pixels[0].x, pixels[0].y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  for (let i = 1; i < pixels.length; i++) {
    const a = pixels[i - 1];
    const b = pixels[i];
    for (let s = 1; s <= stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      await page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      await page.waitForTimeout(stepDelayMs);
    }
  }
  await page.mouse.up();
  await page.waitForTimeout(100);
}

/** Click a UIKit input, replace its content, and type new text. */
export async function typeInto(page, inputName, text, delayMs = 15) {
  await clickObject(page, inputName);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text, { delay: delayMs });
  await page.waitForTimeout(150);
}

/** Wait until autosave has written everything. */
export async function waitForSaved(page) {
  await page.waitForFunction(
    () => {
      const { session } = window.__metaNotes;
      return session.saveStatus === 'saved' && !session.hasUnsavedChanges;
    },
    undefined,
    { timeout: 10000 },
  );
}

/** A comparable snapshot of the active note and what the tablet renders. */
export async function activeNoteSnapshot(page) {
  return page.evaluate(() => {
    const { session, world } = window.__metaNotes;
    const note = session.active;
    const page0 = note.pages[0];
    const inkLayer = world.scene.getObjectByName('InkLayer');
    return {
      id: note.id,
      title: note.title,
      text: note.text,
      strokes: page0.strokes.length,
      points: page0.strokes.reduce((n, s) => n + s.points.length / 2, 0),
      renderedStrokes: inkLayer ? inkLayer.children.length : -1,
      notes: session.summaries.length,
    };
  });
}

/** Run named checks, print PASS/FAIL lines, and exit non-zero on failure. */
export function createChecklist() {
  const results = [];
  return {
    check(name, ok, detail = '') {
      results.push({ name, ok });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
    },
    get failed() {
      return results.some((r) => !r.ok);
    },
  };
}
