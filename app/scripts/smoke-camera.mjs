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

import {
  createChecklist,
  launchBrowser,
  openApp,
  pressAt,
  screenPointOf,
  VIEWPORT,
} from './lib/app-driver.mjs';

const TIMEOUT_MS = 20000;
const browser = await launchBrowser([
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
]);
const checks = createChecklist();
let logs = [];

try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
    permissions: ['camera'],
  });
  const app = await openApp(context);
  const { page } = app;
  logs = app.logs;

  await pressAt(page, await screenPointOf(page, 'camera-start-button'));
  // Wait for the stream to start before pressing Capture.
  await page.waitForFunction(
    () => window.__metaNotes.world.scene.getObjectByName('camera-capture-button')?.properties?.peek?.()?.display !== 'none',
    undefined,
    { timeout: TIMEOUT_MS },
  ).catch(() => {});
  await page.waitForTimeout(1500);
  await pressAt(page, await screenPointOf(page, 'camera-capture-button'));

  const deadline = Date.now() + TIMEOUT_MS;
  while (!logs.some((l) => l.includes('[MetaNotes:camera] captured'))) {
    if (Date.now() > deadline) throw new Error('No capture log line seen.');
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: 'artifacts/smoke-camera.png' });
  const captured = logs.find((l) => l.includes('[MetaNotes:camera] captured'));
  checks.check('camera capture produced a still image', true, captured);
} catch (error) {
  checks.check('camera capture produced a still image', false, error instanceof Error ? error.message : String(error));
  console.error(logs.join('\n'));
} finally {
  await browser.close();
}
process.exit(checks.failed ? 1 : 0);
