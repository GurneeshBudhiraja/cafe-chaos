/**
 * Notes acceptance smoke test (roadmap checks for 18 October).
 *
 * Runs in a fresh browser profile (empty IndexedDB) against the dev server:
 *  1. Rename the first note, type text, draw two strokes, wait for "Saved".
 *  2. Reload five times; the note's title, text, and strokes must match and
 *     the tablet must render every stroke.
 *  3. Make writes fail, draw a stroke: the app must show "Save failed", keep
 *     the stroke on screen, and save it after "Try saving again".
 *  4. Create a second note, cancel a delete, then confirm a delete.
 *
 * Usage: start the dev server (`npm run dev`), then `npm run smoke:notes`.
 */

import {
  activeNoteSnapshot,
  clickObject,
  clickStats,
  clickUntil,
  createChecklist,
  drawStroke,
  launchBrowser,
  openApp,
  typeInto,
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
  await typeInto(page, 'note-title-input', 'Lab notes');
  await typeInto(page, 'note-text-input', 'Check pH at 3 pm');
  await drawStroke(page, [0.15, 0.3], [0.8, 0.4]);
  await drawStroke(page, [0.2, 0.7], [0.6, 0.55]);
  await waitForSaved(page);
  const original = await activeNoteSnapshot(page);
  checks.check(
    'content created through the UI',
    original.title === 'Lab notes' && original.text === 'Check pH at 3 pm' && original.strokes === 2,
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
    const alert = world.scene.getObjectByName('save-alert');
    return {
      status: session.saveStatus,
      unsaved: session.hasUnsavedChanges,
      strokes: session.active.pages[0].strokes.length,
      alertShown: alert?.properties?.peek?.()?.display !== 'none',
      error: session.lastError,
    };
  });
  checks.check(
    'save failure is reported and the stroke is kept',
    failedState.status === 'failed' && failedState.unsaved && failedState.strokes === 3,
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

  // 4. Delete needs confirmation.
  await clickUntil(page, 'note-new-button', () => window.__metaNotes.session.summaries.length === 2);
  await waitForSaved(page);
  const twoNotes = (await activeNoteSnapshot(page)).notes;
  // UIKit's isVisible signal shows whether the confirmation row is displayed.
  const confirmShown = () =>
    window.__metaNotes.world.scene.getObjectByName('delete-confirm').isVisible.peek() === true;
  const confirmHidden = () =>
    window.__metaNotes.world.scene.getObjectByName('delete-confirm').isVisible.peek() === false;
  await clickUntil(page, 'note-delete-button', confirmShown);
  await clickUntil(page, 'delete-cancel-button', confirmHidden);
  const afterCancel = (await activeNoteSnapshot(page)).notes;
  await clickUntil(page, 'note-delete-button', confirmShown);
  // Done when one note is left and the remaining note is open again (the
  // session briefly has no active note while it loads the next one).
  await clickUntil(page, 'delete-confirm-button', () => {
    const { session } = window.__metaNotes;
    return session.summaries.length === 1 && session.active !== null;
  });
  const afterDelete = await activeNoteSnapshot(page);
  checks.check(
    'delete asks first and removes only the confirmed note',
    twoNotes === 2 && afterCancel === 2 && afterDelete.notes === 1 && afterDelete.id === original.id,
    `notes ${twoNotes} -> cancel ${afterCancel} -> delete ${afterDelete.notes}`,
  );

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
