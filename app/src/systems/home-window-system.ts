/**
 * HomeWindowSystem: connects the home window (UIKitML) to the NoteSession.
 *
 * The window shows a live clock, the save status, recent notes as
 * scrollable cards (tap to open on the tablet), a New note button, a
 * settings sheet (placeholder for now), and a compact toggle that collapses
 * the window to a small pill with only the clock and New note.
 *
 * All note changes go through NoteSession commands; this system only reads
 * session state and renders it.
 */

import { createSystem, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import { formatRelativeTime, noteTitleFor, truncate } from '../ui/format.js';
import {
  PanelBinding,
  setText,
  setVisible,
  type PanelElement,
} from '../ui/panel-helpers.js';

const HOME_WINDOW_NODE = 'home-window';
/** Must match the number of `recent-card-N` elements in home-window.uikitml. */
const CARD_SLOTS = 8;
const CARD_TITLE_MAX_CHARS = 16;

const CARD_COLOR = 'rgba(255, 255, 255, 0.85)';
const CARD_ACTIVE_COLOR = 'rgba(47, 111, 235, 0.2)';
const STATUS_COLOR = '#3e4552';
const STATUS_FAILED_COLOR = '#b42318';

interface NoteCard {
  root: PanelElement;
  title: UIKit.Text;
  meta: UIKit.Text;
  noteId: string | null;
}

export class HomeWindowSystem extends createSystem({}) {
  private session!: NoteSession;
  private cards: NoteCard[] = [];
  private compact = false;
  private settingsOpen = false;
  private shownMinute = '';

  private clockTime!: UIKit.Text;
  private clockDate!: UIKit.Text;
  private saveStatus!: UIKit.Text;
  private retryButton!: PanelElement;
  private recentCount!: UIKit.Text;
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

    this.clockTime = ui.text('clock-time');
    this.clockDate = ui.text('clock-date');
    this.saveStatus = ui.text('save-status');
    this.recentCount = ui.text('recent-count');
    this.settingsSheet = ui.element('settings-sheet');
    this.retryButton = ui.onClick('save-retry-button', () => void this.session.flush());

    const newNote = () => void this.session.createNote(noteTitleFor());
    this.fullOnly = [
      ui.onClick('compact-toggle', () => this.setCompact(true)),
      ui.onClick('settings-button', () => this.toggleSettings()),
      ui.element('status-row'),
      ui.element('recent-section'),
      ui.element('bottom-row'),
    ];
    this.compactOnly = [
      ui.onClick('expand-toggle', () => this.setCompact(false)),
      ui.onClick('compact-new-button', newNote),
    ];
    ui.onClick('note-new-button', newNote);

    for (let i = 0; i < CARD_SLOTS; i++) {
      const card: NoteCard = {
        root: ui.onClick(`recent-card-${i}`, () => {
          if (card.noteId) void this.session.openNote(card.noteId);
        }),
        title: ui.text(`recent-title-${i}`),
        meta: ui.text(`recent-meta-${i}`),
        noteId: null,
      };
      this.cards.push(card);
    }

    // The clock only needs to change when the minute does.
    const clockTimer = setInterval(() => this.renderClock(), 1000);
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

  // ------------------------------------------------------------- rendering

  private renderClock(): void {
    const now = new Date();
    const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (time === this.shownMinute) return;
    this.shownMinute = time;
    setText(this.clockTime, time);
    setText(
      this.clockDate,
      now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
    );
  }

  private renderStatus(): void {
    const { saveStatus, loaded } = this.session;
    const failed = saveStatus === 'failed';
    const label = !loaded
      ? 'Loading'
      : saveStatus === 'saving'
        ? 'Saving...'
        : failed
          ? 'Save failed. Your changes are kept.'
          : saveStatus === 'saved'
            ? 'Saved'
            : '';
    setText(this.saveStatus, label);
    this.saveStatus.setProperties({ color: failed ? STATUS_FAILED_COLOR : STATUS_COLOR });
    setVisible(this.retryButton, failed);
  }

  /** Most recent notes first; unused slots are hidden. The strip scrolls. */
  private renderCards(): void {
    const summaries = this.session.summaries;
    const activeId = this.session.active?.id;
    this.cards.forEach((card, i) => {
      const summary = summaries[i];
      card.noteId = summary?.id ?? null;
      setVisible(card.root, summary !== undefined);
      if (!summary) return;
      setText(card.title, truncate(summary.title || 'Untitled note', CARD_TITLE_MAX_CHARS));
      setText(card.meta, formatRelativeTime(summary.updatedAt));
      card.root.setProperties({
        backgroundColor: summary.id === activeId ? CARD_ACTIVE_COLOR : CARD_COLOR,
      });
    });
    const count = summaries.length;
    const shown = Math.min(count, CARD_SLOTS);
    setText(
      this.recentCount,
      count > CARD_SLOTS ? `${shown} of ${count} notes` : `${count} ${count === 1 ? 'note' : 'notes'}`,
    );
  }

  // ----------------------------------------------------------------- modes

  private setCompact(compact: boolean): void {
    this.compact = compact;
    if (compact) this.settingsOpen = false;
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
