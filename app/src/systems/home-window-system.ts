/**
 * HomeWindowSystem: connects the home window (UIKitML) to the NoteSession.
 *
 * The first screen, laid out like a document app's home: a top bar (app
 * name, clock, settings, compact toggle), "Start a new note" paper templates
 * and "Recent notes" cards that preview each note's real ink, with a sort
 * toggle and chevrons (or a drag) for more. Compact mode collapses the
 * window to a pill with expand, New note and settings.
 *
 * All note changes go through NoteSession commands; this system only reads
 * session state and renders it.
 */

import { createSystem, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { PAPER_STYLES, type PaperStyle } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import type { NoteSummary } from '../notes/note-store.js';
import { formatRelativeTime, noteTitleFor, truncate } from '../ui/format.js';
import { attachLiquidGlass } from '../ui/liquid-glass.js';
import {
  PanelBinding,
  setText,
  setVisible,
  type PanelElement,
} from '../ui/panel-helpers.js';
import { PaperPreview } from '../ui/paper-preview.js';

const HOME_WINDOW_NODE = 'home-window';
/** Square corners; must match .window border-radius in home-window.uikitml. */
const WINDOW_RADIUS_PX = 0;
/** Frosted, mostly opaque glass so dark text reads over any room. */
const WINDOW_FROST_ALPHA = 0.84;
/** Must match the number of `recent-card-N` elements in home-window.uikitml. */
const CARD_SLOTS = 8;
const CARD_TITLE_MAX_CHARS = 18;
/** One chevron press scrolls by one card plus the gap (UIKit units). */
const CARD_STEP = 206;
const CARDS_PER_PAGE = 4;
/** Canvas widths for previews (about 2x their size on the window). */
const TEMPLATE_PREVIEW_PX = 272;
const THUMB_PREVIEW_PX = 376;

const ICON_COLOR = '#1f1c19';
const ICON_HIDDEN = 'rgba(31, 28, 25, 0)';

/**
 * Background per state, from the theme: a target reacts when pointed at
 * (hover) so a ray or hand shows what a pinch will hit, and darkens a
 * little more while pinched.
 */
interface StateColors {
  rest: string;
  hover: string;
  pressed: string;
}
const NEUTRAL: StateColors = {
  rest: 'rgba(255, 253, 249, 0)',
  hover: 'rgba(31, 28, 25, 0.08)',
  pressed: 'rgba(31, 28, 25, 0.14)',
};
const SECONDARY: StateColors = {
  rest: 'rgba(255, 253, 249, 0.75)',
  hover: '#fffdf9',
  pressed: '#efe9e1',
};
const PRIMARY: StateColors = { rest: '#b5553a', hover: '#a24a31', pressed: '#8f402a' };

type SortMode = 'recent' | 'title';
const SORT_LABELS: Record<SortMode, string> = { recent: 'Recent', title: 'A-Z' };

interface NoteCard {
  root: PanelElement;
  title: UIKit.Text;
  meta: UIKit.Text;
  preview: PaperPreview;
  noteId: string | null;
  /** id + updatedAt of the ink last drawn, to skip needless redraws. */
  drawnKey: string;
}

/** The scrollable strip; UIKit exposes its scroll offset as a signal. */
interface ScrollContainer {
  scrollPosition: { value: [number, number]; peek(): [number, number] };
  maxScrollPosition: { peek(): [number | undefined, number | undefined] };
}

export class HomeWindowSystem extends createSystem({}) {
  private session!: NoteSession;
  private cards: NoteCard[] = [];
  private compact = false;
  private settingsOpen = false;
  private sort: SortMode = 'recent';
  private shownMinute = '';

  private clockTime!: UIKit.Text;
  private strip: ScrollContainer | null = null;
  private prevChevron!: PanelElement;
  private nextChevron!: PanelElement;
  private sortLabel!: UIKit.Text;
  private emptyState!: PanelElement;
  private saveStatus!: UIKit.Text;
  private statusRow!: PanelElement;
  private settingsSheet!: PanelElement;
  /** Shown only in full mode / only in compact mode. */
  private fullOnly: PanelElement[] = [];
  private compactOnly: PanelElement[] = [];

  init(): void {
    this.session = getNoteSession(this.world);
    const panel = this.world.getSceneObject<UIKitMLAsset>(HOME_WINDOW_NODE);
    if (!panel) {
      console.warn('[HomeWindowSystem] Home window missing from the scene.');
      return;
    }
    const ui = new PanelBinding(panel, this.cleanupFuncs);
    // The window surface is a shader-drawn frosted glass slab.
    attachLiquidGlass(ui.element('home-root'), this.cleanupFuncs, {
      radiusPx: WINDOW_RADIUS_PX,
      edgeHighlights: false,
      frostAlpha: WINDOW_FROST_ALPHA,
    });

    this.clockTime = ui.text('clock-time');
    this.saveStatus = ui.text('save-status');
    this.statusRow = ui.element('status-row');
    this.settingsSheet = ui.element('settings-sheet');
    this.sortLabel = ui.text('sort-label');
    this.emptyState = ui.element('recent-empty');
    ui.onClick('save-retry-button', () => void this.session.flush());
    ui.onClick('sort-button', () => this.toggleSort());

    const hoverable: PanelElement[] = [];
    this.addStates(ui.element('sort-button'), SECONDARY);
    this.addStates(ui.element('save-retry-button'), SECONDARY);
    this.addStates(ui.element('compact-new-button'), PRIMARY);
    this.fullOnly = [
      ui.element('app-title'),
      ui.element('top-actions'),
      ui.element('templates-section'),
      ui.element('section-divider'),
      ui.element('recent-section'),
    ];
    const expand = ui.onClick('expand-toggle', () => this.setCompact(false));
    // Settings from the pill opens the full window with the sheet showing.
    const compactSettings = ui.onClick('compact-settings-button', () =>
      this.openSettingsFromCompact(),
    );
    this.compactOnly = [
      expand,
      ui.onClick('compact-new-button', () => this.newNote('blank')),
      compactSettings,
    ];
    hoverable.push(
      expand,
      compactSettings,
      ui.onClick('settings-button', () => this.toggleSettings()),
      ui.onClick('compact-toggle', () => this.setCompact(true)),
    );

    // Templates: Blank is the main New note action; the others draw their paper.
    hoverable.push(ui.onClick('note-new-button', () => this.newNote('blank')));
    for (const paper of PAPER_STYLES) {
      if (paper === 'blank') continue;
      const preview = new PaperPreview(TEMPLATE_PREVIEW_PX);
      preview.draw(paper);
      ui.element(`template-img-${paper}`).setProperties({ src: preview.texture });
      hoverable.push(ui.onClick(`template-${paper}`, () => this.newNote(paper)));
      this.cleanupFuncs.push(() => preview.dispose());
    }

    this.prevChevron = ui.onClick('recent-prev', () => this.page(-1));
    this.nextChevron = ui.onClick('recent-next', () => this.page(1));
    hoverable.push(this.prevChevron, this.nextChevron);

    for (let i = 0; i < CARD_SLOTS; i++) {
      const preview = new PaperPreview(THUMB_PREVIEW_PX);
      preview.draw('blank');
      ui.element(`recent-thumb-${i}`).setProperties({ src: preview.texture });
      const card: NoteCard = {
        root: ui.onClick(`recent-card-${i}`, () => {
          if (card.noteId) void this.session.openNote(card.noteId);
        }),
        title: ui.text(`recent-title-${i}`),
        meta: ui.text(`recent-meta-${i}`),
        preview,
        noteId: null,
        drawnKey: '',
      };
      this.cards.push(card);
      hoverable.push(card.root);
      this.cleanupFuncs.push(() => preview.dispose());
    }
    this.strip = findScrollContainer(this.cards[0]?.root);

    // State feedback on everything a pinch can hit (Meta guidance: targets
    // must react to the pointer before they are selected).
    for (const element of hoverable) this.addStates(element, NEUTRAL);

    // The clock only needs to change when the minute does.
    const clockTimer = setInterval(() => {
      this.renderClock();
      this.renderChevrons();
    }, 1000);
    this.cleanupFuncs.push(
      () => clearInterval(clockTimer),
      this.session.subscribe(() => {
        this.renderStatus();
        this.renderCards();
        // A failed save must stay visible: leave compact mode to show it.
        if (this.compact && this.session.saveStatus === 'failed') this.setCompact(false);
      }),
    );

    this.renderClock();
    this.renderStatus();
    this.renderCards();
    this.applyMode();
  }

  // -------------------------------------------------------------- commands

  private newNote(paper: PaperStyle): void {
    void this.session.createNote(noteTitleFor(), paper);
  }

  private toggleSort(): void {
    this.sort = this.sort === 'recent' ? 'title' : 'recent';
    setText(this.sortLabel, SORT_LABELS[this.sort]);
    if (this.strip) this.strip.scrollPosition.value = [0, 0];
    this.renderCards();
  }

  // ------------------------------------------------------------- rendering

  private renderClock(): void {
    const time = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (time === this.shownMinute) return;
    this.shownMinute = time;
    setText(this.clockTime, time);
  }

  /** Saving is silent; only a failed save shows a line, with a retry. */
  private renderStatus(): void {
    const failed = this.session.saveStatus === 'failed';
    setText(this.saveStatus, failed ? "Couldn't save. Your changes are kept." : '');
    setVisible(this.statusRow, failed);
  }

  /** Cards in the chosen order; unused slots are hidden. The strip scrolls. */
  private renderCards(): void {
    const summaries = this.sortedSummaries();
    setVisible(this.emptyState, summaries.length === 0);
    this.cards.forEach((card, i) => {
      const summary = summaries[i];
      card.noteId = summary?.id ?? null;
      setVisible(card.root, summary !== undefined);
      if (!summary) return;
      setText(card.title, truncate(summary.title || 'Untitled note', CARD_TITLE_MAX_CHARS));
      setText(card.meta, `Edited ${formatRelativeTime(summary.updatedAt)}`);
      void this.drawThumbnail(card, summary);
    });
    this.renderChevrons();
  }

  private sortedSummaries(): NoteSummary[] {
    const summaries = this.session.summaries;
    if (this.sort === 'recent') return summaries;
    return [...summaries].sort((a, b) =>
      (a.title || 'Untitled note').localeCompare(b.title || 'Untitled note'),
    );
  }

  /** Draw the note's paper and ink into the card, only when it changed. */
  private async drawThumbnail(card: NoteCard, summary: NoteSummary): Promise<void> {
    const key = `${summary.id}:${summary.updatedAt}`;
    if (card.drawnKey === key) return;
    card.drawnKey = key;
    const note = await this.session.getNote(summary.id);
    // The slot may show another note by the time the read finishes.
    if (card.drawnKey !== key) return;
    card.preview.draw(note?.paper ?? 'blank', note ?? undefined);
  }

  /** Chevrons show only when there is more to see in that direction. */
  private renderChevrons(): void {
    const x = this.strip?.scrollPosition.peek()[0] ?? 0;
    const max = this.strip?.maxScrollPosition.peek()[0] ?? 0;
    // Hidden chevrons stay in the layout (transparent) so cards never shift.
    this.prevChevron.setProperties({ color: x > 1 ? ICON_COLOR : ICON_HIDDEN });
    this.nextChevron.setProperties({ color: x < max - 1 ? ICON_COLOR : ICON_HIDDEN });
  }

  /** Scroll the strip one page (four cards) back or forward. */
  private page(direction: -1 | 1): void {
    if (!this.strip) return;
    const [x, y] = this.strip.scrollPosition.peek();
    const max = this.strip.maxScrollPosition.peek()[0] ?? 0;
    const next = Math.min(max, Math.max(0, x + direction * CARD_STEP * CARDS_PER_PAGE));
    this.strip.scrollPosition.value = [next, y];
    this.renderChevrons();
  }

  private addStates(element: PanelElement, colors: StateColors): void {
    const set = (backgroundColor: string) => () => element.setProperties({ backgroundColor });
    const handlers = [
      ['pointerenter', set(colors.hover)],
      ['pointerleave', set(colors.rest)],
      ['pointerdown', set(colors.pressed)],
      ['pointerup', set(colors.hover)],
    ] as const;
    for (const [type, handler] of handlers) element.addEventListener(type, handler);
    this.cleanupFuncs.push(() => {
      for (const [type, handler] of handlers) element.removeEventListener(type, handler);
    });
  }

  // ----------------------------------------------------------------- modes

  private setCompact(compact: boolean): void {
    this.compact = compact;
    if (compact) this.settingsOpen = false;
    this.applyMode();
  }

  private openSettingsFromCompact(): void {
    this.compact = false;
    this.settingsOpen = true;
    this.applyMode();
  }

  private toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    this.applyMode();
  }

  private applyMode(): void {
    for (const el of this.fullOnly) setVisible(el, !this.compact);
    for (const el of this.compactOnly) setVisible(el, this.compact);
    setVisible(this.settingsSheet, this.settingsOpen && !this.compact);
  }
}

/** The nearest ancestor UIKit marks as scrollable (the recent strip). */
function findScrollContainer(element: PanelElement | undefined): ScrollContainer | null {
  let node = (element as unknown as { parent?: unknown } | undefined)?.parent;
  while (node && typeof node === 'object') {
    if ('scrollPosition' in node && 'maxScrollPosition' in node) return node as ScrollContainer;
    node = (node as { parent?: unknown }).parent;
  }
  return null;
}
