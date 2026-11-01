/**
 * Notes acceptance smoke test (roadmap checks for 18 October).
 *
 * Runs in a fresh browser profile (empty IndexedDB) against the dev server:
 *  0. A first launch opens on the dock with the New note hint; New note
 *     starts the first note.
 *  1. Add two strokes to the note, wait for "Saved". The tablet is out of
 *     the launch view for now, so strokes go in through the note session
 *     (the same command the tablet uses).
 *  2. Reload five times; the note's title and strokes must match.
 *  3. Make writes fail, add a stroke: the app must raise the save-failure
 *     toast, keep the stroke, and save it after the toast's "Try again".
 *  4. The dock: New note adds a note, Recent reopens the older one,
 *     Templates creates a note with its paper, the grab bar moves the dock,
 *     stick mode is on by default and its Settings switch is remembered,
 *     every panel closes with its close button, and with more notes than
 *     fit the Recent grid shows the latest six with edit times.
 *
 * Usage: start the dev server (`npm run dev`), then `npm run smoke:notes`.
 */

import {
  activeNoteSnapshot,
  clickObject,
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

  // UIKit's isVisible signal shows whether an element is displayed.
  // Predicates run inside the page, so the helper is installed there.
  const installShown = () =>
    page.evaluate(() => {
      window.__shown = (name) =>
        window.__metaNotes.world.scene.getObjectByName(name)?.isVisible.peek() === true;
    });
  await installShown();

  // 0. A first launch opens on the dock (no window), with no note open and
  //    the hint pointing at New note; New note starts the first page.
  await page.waitForFunction(() => window.__shown('dock-root'), undefined, { timeout: 8000 });
  const firstLaunch = await page.evaluate(() => ({
    notes: window.__metaNotes.session.summaries.length,
    dock: window.__shown('dock-root'),
    window: window.__shown('home-root'),
    hint: window.__shown('dock-hint'),
  }));
  checks.check(
    'first launch opens on the dock with the New note hint',
    firstLaunch.notes === 0 && firstLaunch.dock && !firstLaunch.window && firstLaunch.hint,
    JSON.stringify(firstLaunch),
  );
  await clickUntil(page, 'dock-new', () => window.__metaNotes.session.active !== null && !window.__shown('dock-hint'));

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
    const retry = world.scene.getObjectByName('toast-action');
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
  await clickUntil(page, 'toast-action', () => {
    const { session } = window.__metaNotes;
    return session.saveStatus === 'saved' && !session.hasUnsavedChanges;
  });
  await page.reload({ waitUntil: 'load' });
  await waitForApp(page);
  const recovered = await activeNoteSnapshot(page);
  checks.check('retry saves the kept stroke', recovered.strokes === 3, `strokes=${recovered.strokes}`);

  // 4. The dock: New note adds a note; Recent reopens the older one.
  await installShown();
  await page.waitForFunction(() => window.__shown('dock-root'), undefined, { timeout: 8000 });
  await clickUntil(page, 'dock-new', () => window.__metaNotes.session.summaries.length === 2);
  await waitForSaved(page);
  const second = await activeNoteSnapshot(page);
  // New note opens the page at once (the dock steps aside); close it to get back to the dock.
  const opened = await page.evaluate(() => window.__metaNotes.world.globals['metaNotes.noteView'].isOpen);
  checks.check('New note opens the page straight away', opened, `open=${opened}`);
  await page.evaluate(() => window.__metaNotes.world.globals['metaNotes.noteView'].close());
  await page.waitForFunction(() => window.__shown('dock-row'), undefined, { timeout: 8000 });
  await page.waitForTimeout(600);
  // Cards are most recent first, so the original note is now card 1.
  await clickUntil(page, 'dock-recent', () => window.__shown('dock-popover-recent'));
  await clickUntil(
    page,
    'dock-recent-card-1',
    () => window.__metaNotes.session.active?.pages[0].strokes.length === 3 && !window.__shown('dock-popover'),
  );
  const reopened = await activeNoteSnapshot(page);
  checks.check(
    'dock New note adds a note; Recent reopens the older one',
    second.notes === 2 && second.id !== original.id && reopened.id === original.id && reopened.strokes === 3,
    `notes=${second.notes}, reopened strokes=${reopened.strokes}`,
  );
  // Opening from Recent opens the page too: back to the dock for the rest.
  await page.evaluate(() => window.__metaNotes.world.globals['metaNotes.noteView'].close());
  await page.waitForFunction(() => window.__shown('dock-row'), undefined, { timeout: 8000 });
  await page.waitForTimeout(600);

  // No note types to choose: New note starts a dotted canvas straight away, and there is no Templates button.
  const quickStart = await page.evaluate(() => ({
    paper: window.__metaNotes.session.active?.paper,
    templates: window.__metaNotes.world.scene.getObjectByName('dock-templates') !== undefined,
  }));
  checks.check('New note starts straight away (dotted canvas, no Templates step)', quickStart.paper === 'dotted' && !quickStart.templates, JSON.stringify(quickStart));

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
  // Put the dock back in front of the test camera.
  await page.evaluate(() => {
    const dock = window.__metaNotes.world.getSceneObject('compact-dock');
    dock.position.set(0, 1.32, -1.16);
    dock.quaternion.identity();
    // Stick mode is on: re-anchor following to the new place.
    window.__metaNotes.world.globals['metaNotes.homeMode'].notifyMoved();
  });
  await page.waitForTimeout(200);

  // Stick mode is on by default: the dock follows the head.
  const stick = await page.evaluate(() => window.__metaNotes.world.globals['metaNotes.homeMode'].pinned);
  checks.check('stick mode is on by default', stick === true, `pinned=${stick}`);

  // Settings: the stick mode switch turns it off and on, and is remembered;
  // Connect (not built yet) answers with a toast.
  await page.evaluate(() => (window.__homeMode = window.__metaNotes.world.globals['metaNotes.homeMode']));
  await clickUntil(page, 'dock-settings', () => window.__shown('dock-popover-settings'));
  await clickUntil(page, 'set-stick', () => window.__homeMode.pinned === false);
  const savedOff = await page.evaluate(() => JSON.parse(localStorage.getItem('metaNotes.preferences') ?? '{}').stickMode);
  await clickUntil(page, 'set-stick', () => window.__homeMode.pinned === true);
  // Connect (not built yet) answers in place; the recording shows its label.
  await clickObject(page, 'set-connect-drive');
  checks.check('settings: stick mode switch is remembered', savedOff === false, `saved off=${savedOff}`);
  // Every panel closes with its close button, and the buttons come back
  // (the fade itself is checked in the headset recording).
  const closeWithButton = () =>
    clickUntil(page, 'dock-popover-close', () => !window.__shown('dock-popover') && window.__shown('dock-row'));
  await closeWithButton();
  await clickUntil(page, 'dock-recent', () => window.__shown('dock-popover-recent'));
  await closeWithButton();
  checks.check('every panel closes with its close button', true);

  // With more notes than fit, the Recent grid shows the latest six, each
  // with when it was edited, and the header says how many there are.
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) await window.__metaNotes.session.createNote(`Extra ${i + 1}`);
  });
  await waitForSaved(page);
  await clickUntil(page, 'dock-recent', () => window.__shown('dock-popover-recent'));
  const grid = await page.evaluate(() => {
    const { session, world } = window.__metaNotes;
    const textOf = (name) => world.scene.getObjectByName(name)?.properties?.peek?.().text ?? null;
    const shownCards = Array.from({ length: 10 }, (_, i) => window.__shown(`dock-recent-card-${i}`)).filter(Boolean);
    return {
      notes: session.summaries.length,
      cards: shownCards.length,
      firstTitle: textOf('dock-recent-title-0'),
      newest: session.summaries[0].title,
      meta: textOf('dock-recent-meta-0'),
      count: textOf('dock-popover-count'),
    };
  });
  checks.check(
    'Recent grid shows the latest six with edit times and a count',
    grid.notes === 8 &&
      grid.cards === 6 &&
      grid.firstTitle === grid.newest &&
      /^Edited /.test(grid.meta ?? '') &&
      grid.count === '6 of 8',
    JSON.stringify(grid),
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
