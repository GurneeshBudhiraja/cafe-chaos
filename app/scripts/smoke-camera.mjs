/**
 * Camera capture smoke test (desktop, fake camera).
 *
 * Launches Chromium with a fake camera device and auto-granted permission,
 * opens the running dev server, presses "Start camera" and then "Capture" on
 * the tools panel, and waits for the app's capture log line.
 *
 * This proves the shared capture flow (permission -> stream -> still image).
 * It does NOT prove Quest outward-camera access; that needs a headset test.
 *
 * Usage: start the dev server (`npm run dev`), then `npm run smoke:camera`.
 * Optional: APP_URL=https://localhost:8081/ CHROMIUM_PATH=/path/to/chrome
 *
 * Buttons are located by projecting their 3D position (UIKit element names
 * set by the app) through the desktop camera, so layout changes are safe.
 */

import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL ?? 'https://localhost:8081/';
const VIEWPORT = { width: 780, height: 493 };
const TIMEOUT_MS = 20000;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--ignore-certificate-errors',
  ],
});

let failed = false;
let page;
const appLines = [];
try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
    permissions: ['camera'],
  });
  page = await context.newPage();
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[MetaNotes') || message.type() === 'error') {
      appLines.push(`${message.type()}: ${text}`);
    }
  });

  await page.goto(APP_URL, { waitUntil: 'load' });
  // Allow the level and UIKit panels to load.
  await page.waitForTimeout(6000);

  await pressAt(page, await screenPointOf(page, 'camera-start-button'));
  // Wait for the stream to start before pressing Capture.
  await page.waitForTimeout(3000);
  await pressAt(page, await screenPointOf(page, 'camera-capture-button'));

  const deadline = Date.now() + TIMEOUT_MS;
  while (!appLines.some((l) => l.includes('[MetaNotes:camera] captured'))) {
    if (Date.now() > deadline) throw new Error('No capture log line seen.');
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: 'artifacts/smoke-camera.png' });
  console.log(appLines.filter((l) => l.includes('MetaNotes')).join('\n'));
  console.log('PASS camera capture produced a still image');
} catch (error) {
  failed = true;
  console.error('FAIL', error instanceof Error ? error.message : error);
  console.error(appLines.join('\n'));
  await page?.screenshot({ path: 'artifacts/smoke-camera-failure.png' });
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);

/** Project a named 3D UI element's world position to viewport pixels. */
async function screenPointOf(target, objectName) {
  const point = await target.evaluate((name) => {
    const { world } = window.__metaNotes;
    const object = world.scene.getObjectByName(name);
    if (!object) return null;
    const p = object.getWorldPosition(object.position.clone()).project(world.camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  }, objectName);
  if (!point) throw new Error(`UI element "${objectName}" not found.`);
  return point;
}

/** Hover first so the 3D pointer has an intersection, then press and release. */
async function pressAt(target, point) {
  await target.mouse.move(point.x, point.y);
  await target.waitForTimeout(150);
  await target.mouse.down();
  await target.waitForTimeout(80);
  await target.mouse.up();
}
