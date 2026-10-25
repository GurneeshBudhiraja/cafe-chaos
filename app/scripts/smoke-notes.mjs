/**
 * Notes acceptance smoke test (roadmap checks for 18 October).
 *
 * Runs in a fresh browser profile (empty IndexedDB) against the dev server:
 *  1. Add two strokes to the first note, wait for "Saved". The tablet is out
 *     of the launch view for now, so strokes go in through the note session
 *     (the same command the tablet uses).
 *  2. Reload five times; the note's title and strokes must match.
 *  3. Make writes fail, add a stroke: the app must show "Save failed", keep
 *     the stroke, and save it after "Try saving again".
 *  4. Home window: New note adds a recent card; tapping the older card
 *     reopens that note; minimising shows the floating dock, whose pop-ups
 *     open notes and templates and whose grab bar moves it;
 *     with more notes than fit, the strip scrolls.
 *
 * Usage: start the dev server (`npm run dev`), then `npm run smoke:notes`.
 */

import {
  activeNoteSnapshot,
  clickStats,
  clickUntil,
  createChecklist,
  launchBrowser,
  openApp,
  screenPointOf,
  VIEWPORT,
  waitForApp,
  waitForSaved,
} from './lib/app-driver.mjs';

/** Commit a 25-point straight stroke (page coordinates) to the active note. */
function addStroke(page, from, to) {
  return page.evaluate(
    ([a, b]) => {
      const points = [];
      for (let i = 0; i <= 24; i++) {
        points.push(a[0] + ((b[0] - a[0]) * i) / 24, a[1] + ((b[1] - a[1]) * i) / 24);
      }
      window.__metaNotes.session.commitStroke({
        id: crypto.randomUUID(),
        tool: 'pen',
        color: '#1d4ed8',
        width: 0.004,
        points,
      });
    },
    [from, to],
  );
}

const RELOADS = 5;
const browser = await launchBrowser();
const checks = createChecklist();
let logs = [];

try {
  const context = await browser.newContext({ viewport: VIEWPORT, ignoreHTTPSErrors: true });
  const app = await openApp(context);
  const { page } = app;
  logs = app.logs;

  // 1. Create content.
  await addStroke(page, [0.15, 0.3], [0.8, 0.4]);
  await addStroke(page, [0.2, 0.7], [0.6, 0.55]);
  await waitForSaved(page);
  const original = await activeNoteSnapshot(page);
  checks.check(
    'note content is created',
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
      after.points === original.points;
    if (same) survived++;
    else console.log(`  reload ${i} mismatch: ${JSON.stringify(after)}`);
  }
  checks.check(`note survives ${RELOADS} reloads`, survived === RELOADS, `${survived}/${RELOADS}`);

  // 3. Simulated save failure keeps the work.
  await page.evaluate(() => (window.__metaNotes.store.failWrites = true));
  await addStroke(page, [0.3, 0.15], [0.7, 0.2]);
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
    second.notes === 2 && second.id !== original.id && reopened.id === original.id && reopened.strokes === 3,
    `notes=${second.notes}, reopened strokes=${reopened.strokes}`,
  );

  // UIKit's isVisible signal shows whether an element is displayed.
  // Predicates run inside the page, so the helper is installed there.
  await page.evaluate(() => {
    window.__shown = (name) =>
      window.__metaNotes.world.scene.getObjectByName(name)?.isVisible.peek() === true;
  });
  const windowShown = () => window.__shown('home-root');
  const dockShown = () => window.__shown('dock-root') && !window.__shown('home-root');
  await clickUntil(page, 'compact-toggle', dockShown);
  await clickUntil(page, 'dock-expand', windowShown);
  checks.check('minimise shows the floating dock; expand restores the window', true);

  // Dock pop-ups: Recent opens a note, Templates creates one; both close.
  await clickUntil(page, 'compact-toggle', dockShown);
  await clickUntil(page, 'dock-recent', () => window.__shown('dock-popover-recent'));
  await page.evaluate(() => (window.__target = window.__metaNotes.session.summaries[1].id));
  await clickUntil(
    page,
    'dock-recent-card-1',
    () => window.__metaNotes.session.active?.id === window.__target && !window.__shown('dock-popover'),
  );
  await clickUntil(page, 'dock-templates', () => window.__shown('dock-popover-templates'));
  await clickUntil(
    page,
    'dock-template-dotted',
    () => window.__metaNotes.session.active?.paper === 'dotted' && !window.__shown('dock-popover'),
  );
  checks.check('dock pop-ups open a recent note and create from a template', true);

  // The grab bar moves the dock.
  const before = await page.evaluate(() => window.__metaNotes.world.getSceneObject('compact-dock').position.x);
  const grab = await screenPointOf(page, 'dock-grab');
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(grab.x + i * 12, grab.y);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__metaNotes.world.getSceneObject('compact-dock').position.x);
  checks.check('dragging the grab bar moves the dock', after - before > 0.05, `x ${before.toFixed(3)} -> ${after.toFixed(3)}`);
  // Put the dock back so the window reopens in front of the test camera
  // (expanding opens the window wherever the dock is).
  await page.evaluate(() => {
    const dock = window.__metaNotes.world.getSceneObject('compact-dock');
    dock.position.set(0, 1.25, -1.0);
    dock.quaternion.identity();
  });
  await page.waitForTimeout(200);

  // Settings on the dock opens the full window with the sheet shown.
  await clickUntil(page, 'dock-settings', () => window.__shown('home-root') && window.__shown('settings-sheet'));
  await clickUntil(page, 'settings-button', () => !window.__shown('settings-sheet'));
  checks.check('settings on the dock opens the full window', true);

  // A paper template creates a note with that paper.
  await clickUntil(page, 'template-grid', () => window.__metaNotes.session.active?.paper === 'grid');
  checks.check('a paper template creates a note with that paper', true);

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

  // The left chevron pages back to the start of the strip.
  await clickUntil(page, 'recent-prev', () => {
    let node = window.__metaNotes.world.scene.getObjectByName('recent-card-0').parent;
    while (node && !node.scrollPosition) node = node.parent;
    return node?.scrollPosition.peek()[0] === 0;
  });
  checks.check('chevron pages the strip back', true);

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
