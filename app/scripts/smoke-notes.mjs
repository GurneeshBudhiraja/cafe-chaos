/**
 * Notes acceptance smoke test (roadmap checks for 18 October).
 *
 * Runs in a fresh browser profile (empty IndexedDB) against the dev server:
 *  1. Draw two strokes on the first note, wait for "Saved".
 *  2. Reload five times; the note's title and strokes must match and the
 *     tablet must render every stroke.
 *  3. Make writes fail, draw a stroke: the app must show "Save failed", keep
 *     the stroke on screen, and save it after "Try saving again".
 *  4. Home window: New note adds a recent card; tapping the older card
 *     reopens that note; compact mode hides the full window and restores it;
 *     with more notes than fit, the strip scrolls.
 *
 * Usage: start the dev server (`npm run dev`), then `npm run smoke:notes`.
 */

import {
  activeNoteSnapshot,
  clickStats,
  clickUntil,
  createChecklist,
  drawStroke,
  launchBrowser,
  openApp,
  screenPointOf,
  VIEWPORT,
  waitForApp,
  waitForSaved,
} from './lib/app-driver.mjs';

const RELOADS = 5;
const browser = await launchBrowser();
const checks = createChecklist();
let logs = [];

try {
  const context = await browser.newContext({ viewport: VIEWPORT, ignoreHTTPSErrors: true });
  const app = await openApp(context);
  const { page } = app;
  logs = app.logs;

  // 1. Create content through the real UI.
  await drawStroke(page, [0.15, 0.3], [0.8, 0.4]);
  await drawStroke(page, [0.2, 0.7], [0.6, 0.55]);
  await waitForSaved(page);
  const original = await activeNoteSnapshot(page);
  checks.check(
    'content created through the UI',
    original.title.length > 0 && original.strokes === 2,
    JSON.stringify(original),
  );

  // 2. Five reloads.
  let survived = 0;
  for (let i = 1; i <= RELOADS; i++) {
    await page.reload({ waitUntil: 'load' });
    await waitForApp(page);
    const after = await activeNoteSnapshot(page);
    const same =
      after.id === original.id &&
      after.title === original.title &&
      after.text === original.text &&
      after.strokes === original.strokes &&
      after.points === original.points &&
      after.renderedStrokes === original.strokes;
    if (same) survived++;
    else console.log(`  reload ${i} mismatch: ${JSON.stringify(after)}`);
  }
  checks.check(`note survives ${RELOADS} reloads`, survived === RELOADS, `${survived}/${RELOADS}`);

  // 3. Simulated save failure keeps the work.
  await page.evaluate(() => (window.__metaNotes.store.failWrites = true));
  await drawStroke(page, [0.3, 0.15], [0.7, 0.2]);
  await page.waitForFunction(() => window.__metaNotes.session.saveStatus === 'failed', undefined, {
    timeout: 10000,
  });
  const failedState = await page.evaluate(() => {
    const { session, world } = window.__metaNotes;
    const retry = world.scene.getObjectByName('save-retry-button');
    return {
      status: session.saveStatus,
      unsaved: session.hasUnsavedChanges,
      strokes: session.active.pages[0].strokes.length,
      retryShown: retry?.isVisible.peek() === true,
      error: session.lastError,
    };
  });
  checks.check(
    'save failure is reported and the stroke is kept',
    failedState.status === 'failed' &&
      failedState.unsaved &&
      failedState.strokes === 3 &&
      failedState.retryShown,
    JSON.stringify(failedState),
  );

  await page.evaluate(() => (window.__metaNotes.store.failWrites = false));
  await clickUntil(page, 'save-retry-button', () => {
    const { session } = window.__metaNotes;
    return session.saveStatus === 'saved' && !session.hasUnsavedChanges;
  });
  await page.reload({ waitUntil: 'load' });
  await waitForApp(page);
  const recovered = await activeNoteSnapshot(page);
  checks.check('retry saves the kept stroke', recovered.strokes === 3, `strokes=${recovered.strokes}`);

  // 4. Home window: new note, recent cards, compact mode.
  await clickUntil(page, 'note-new-button', () => window.__metaNotes.session.summaries.length === 2);
  await waitForSaved(page);
  const second = await activeNoteSnapshot(page);
  // Cards are most recent first, so the original note is now card 1.
  await clickUntil(page, 'recent-card-1', () => window.__metaNotes.session.active?.pages[0].strokes.length === 3);
  const reopened = await activeNoteSnapshot(page);
  checks.check(
    'new note adds a card; tapping the older card reopens it',
    second.notes === 2 && second.id !== original.id && reopened.id === original.id && reopened.renderedStrokes === 3,
    `notes=${second.notes}, reopened strokes=${reopened.renderedStrokes}`,
  );

  // UIKit's isVisible signal shows whether an element is displayed.
  const recentShown = () =>
    window.__metaNotes.world.scene.getObjectByName('recent-section').isVisible.peek() === true;
  const recentHidden = () =>
    window.__metaNotes.world.scene.getObjectByName('recent-section').isVisible.peek() === false;
  await clickUntil(page, 'compact-toggle', recentHidden);
  await clickUntil(page, 'expand-toggle', recentShown);
  checks.check('compact mode collapses and expands the home window', true);

  // With more notes than fit, the recent strip scrolls. On desktop a mouse
  // scrolls UIKit with the wheel; XR rays and hands scroll by dragging.
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await window.__metaNotes.session.createNote(`Extra ${i + 1}`);
  });
  await waitForSaved(page);
  const strip = await screenPointOf(page, 'recent-card-1');
  await page.mouse.move(strip.x, strip.y);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(80, 0);
    await page.waitForTimeout(150);
  }
  const scrollX = await page.waitForFunction(() => {
    // The strip has no bound id, so find the scroll container above a card.
    let node = window.__metaNotes.world.scene.getObjectByName('recent-card-0').parent;
    while (node && !node.scrollPosition) node = node.parent;
    const x = node?.scrollPosition.peek()[0] ?? 0;
    return x > 0 ? x : false;
  }, undefined, { timeout: 5000 }).then((h) => h.jsonValue(), () => 0);
  checks.check('recent notes strip scrolls', scrollX > 0, `scrollX=${scrollX}`);

  console.log(`  (click retries for dropped presses: ${clickStats.retries})`);
  const pageErrors = logs.filter((l) => l.startsWith('pageerror') || l.startsWith('error'));
  checks.check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (error) {
  checks.check('smoke run completed', false, error instanceof Error ? error.message : String(error));
  console.error(logs.slice(-15).join('\n'));
} finally {
  await browser.close();
}
process.exit(checks.failed ? 1 : 0);
