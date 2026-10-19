/**
 * NotesPanelSystem: connects the notes panel (UIKitML) to the NoteSession.
 *
 * The panel shows the note library, the active note's title and text, the
 * save status, and a two-step delete. All changes go through NoteSession
 * commands; this system only reads session state and renders it.
 *
 * Text fields use UIKit's Input element, which focuses a hidden DOM input.
 * On desktop that takes a physical keyboard; in Meta Quest Browser the same
 * focus is expected to open the system keyboard (unverified on a headset).
 */

import { createSystem, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import type { NoteSummary } from '../notes/note-store.js';
import {
  PanelBinding,
  setText,
  setVisible,
  type PanelElement,
} from '../ui/panel-helpers.js';

const NOTES_PANEL_NODE = 'notes-panel';
/** Must match the number of `note-row-N` elements in notes-panel.uikitml. */
const ROWS_PER_PAGE = 5;
const ROW_TITLE_MAX_CHARS = 28;

const ROW_COLOR = '#f1f0ec';
const ROW_ACTIVE_COLOR = '#dbe7fb';
const STATUS_COLOR = '#3a3a3a';
const STATUS_FAILED_COLOR = '#b42318';

interface NoteRow {
  root: PanelElement;
  title: UIKit.Text;
  meta: UIKit.Text;
  noteId: string | null;
}

export class NotesPanelSystem extends createSystem({}) {
  private session!: NoteSession;
  private rows: NoteRow[] = [];
  /** Index of the first summary shown in the list. */
  private listOffset = 0;
  /** Note id awaiting delete confirmation, or null. */
  private pendingDeleteId: string | null = null;

  private saveStatus!: UIKit.Text;
  private saveAlert!: PanelElement;
  private saveAlertText!: UIKit.Text;
  private titleInput!: PanelElement;
  private textInput!: PanelElement;
  private deleteConfirm!: PanelElement;
  private deleteConfirmText!: UIKit.Text;
  private noteCount!: UIKit.Text;
  private newerButton!: PanelElement;
  private olderButton!: PanelElement;

  init(): void {
    this.session = getNoteSession(this.world);
    const panel = this.world.getSceneObject<UIKitMLAsset>(NOTES_PANEL_NODE);
    if (!panel) {
      console.warn('[NotesPanelSystem] Notes panel missing from the scene.');
      return;
    }
    const ui = new PanelBinding(panel, this.cleanupFuncs);

    this.saveStatus = ui.text('save-status');
    this.saveAlert = ui.element('save-alert');
    this.saveAlertText = ui.text('save-alert-text');
    this.deleteConfirm = ui.element('delete-confirm');
    this.deleteConfirmText = ui.text('delete-confirm-text');
    this.noteCount = ui.text('note-count');
    this.titleInput = ui.element('note-title-input');
    this.textInput = ui.element('note-text-input');

    ui.onClick('note-new-button', () => void this.session.createNote());
    ui.onClick('note-delete-button', () => this.askToDelete());
    ui.onClick('delete-confirm-button', () => void this.confirmDelete());
    ui.onClick('delete-cancel-button', () => this.cancelDelete());
    ui.onClick('save-retry-button', () => void this.session.flush());
    this.newerButton = ui.onClick('page-newer-button', () => this.page(-1));
    this.olderButton = ui.onClick('page-older-button', () => this.page(1));

    // Controlled inputs: typing reports a value, the session stores it, and
    // the field shows the stored value (trimmed to the allowed length).
    this.titleInput.setProperties({
      onValueChange: (value: string) => {
        this.session.renameActive(value);
        this.titleInput.setProperties({ value: this.session.active?.title ?? '' });
      },
    });
    this.textInput.setProperties({
      onValueChange: (value: string) => {
        this.session.setActiveText(value);
        this.textInput.setProperties({ value: this.session.active?.text ?? '' });
      },
    });

    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const row: NoteRow = {
        root: ui.onClick(`note-row-${i}`, () => {
          if (row.noteId) void this.session.openNote(row.noteId);
        }),
        title: ui.text(`note-row-title-${i}`),
        meta: ui.text(`note-row-meta-${i}`),
        noteId: null,
      };
      this.rows.push(row);
    }

    this.cleanupFuncs.push(
      this.session.subscribe((change) => {
        if (change === 'active') this.renderActiveNote();
        // Status (including "Loading") and list rows are cheap to refresh and
        // can change with any event, so always re-render them.
        this.renderSaveStatus();
        this.renderList();
      }),
    );

    this.renderActiveNote();
    this.renderSaveStatus();
    this.renderList();
  }

  // ------------------------------------------------------------- rendering

  private renderActiveNote(): void {
    const note = this.session.active;
    this.cancelDelete();
    this.titleInput.setProperties({ value: note?.title ?? '', disabled: !note });
    this.textInput.setProperties({ value: note?.text ?? '', disabled: !note });
  }

  private renderSaveStatus(): void {
    const { saveStatus, lastError, loaded } = this.session;
    const label = !loaded
      ? 'Loading'
      : saveStatus === 'saving'
        ? 'Saving...'
        : saveStatus === 'failed'
          ? 'Save failed'
          : saveStatus === 'saved'
            ? 'Saved'
            : '';
    setText(this.saveStatus, label);
    this.saveStatus.setProperties({
      color: saveStatus === 'failed' ? STATUS_FAILED_COLOR : STATUS_COLOR,
    });

    const failed = saveStatus === 'failed' || (lastError !== null && saveStatus !== 'saving');
    setVisible(this.saveAlert, failed);
    if (failed && lastError) setText(this.saveAlertText, lastError);
  }

  private renderList(): void {
    const summaries = this.session.summaries;
    const activeId = this.session.active?.id;
    // Keep the offset valid after deletes.
    const lastPageStart = Math.max(
      0,
      Math.floor((summaries.length - 1) / ROWS_PER_PAGE) * ROWS_PER_PAGE,
    );
    this.listOffset = Math.min(this.listOffset, lastPageStart);

    this.rows.forEach((row, i) => {
      const summary: NoteSummary | undefined = summaries[this.listOffset + i];
      row.noteId = summary?.id ?? null;
      setVisible(row.root, summary !== undefined);
      if (!summary) return;
      setText(row.title, truncate(summary.title || 'Untitled note', ROW_TITLE_MAX_CHARS));
      setText(row.meta, formatRelativeTime(summary.updatedAt));
      row.root.setProperties({
        backgroundColor: summary.id === activeId ? ROW_ACTIVE_COLOR : ROW_COLOR,
      });
    });

    const count = summaries.length;
    setText(this.noteCount, `${count} ${count === 1 ? 'note' : 'notes'}`);
    setVisible(this.newerButton, this.listOffset > 0);
    setVisible(this.olderButton, this.listOffset + ROWS_PER_PAGE < count);
  }

  // --------------------------------------------------------------- actions

  private page(direction: 1 | -1): void {
    this.listOffset = Math.max(0, this.listOffset + direction * ROWS_PER_PAGE);
    this.renderList();
  }

  /** Step one of delete: show what will be deleted and wait for a choice. */
  private askToDelete(): void {
    const note = this.session.active;
    if (!note) return;
    this.pendingDeleteId = note.id;
    const title = truncate(note.title || 'Untitled note', ROW_TITLE_MAX_CHARS);
    setText(this.deleteConfirmText, `Delete "${title}"? This cannot be undone.`);
    setVisible(this.deleteConfirm, true);
  }

  /** Step two: delete only the note that was confirmed. */
  private async confirmDelete(): Promise<void> {
    const id = this.pendingDeleteId;
    this.cancelDelete();
    if (id) await this.session.deleteNote(id);
  }

  private cancelDelete(): void {
    this.pendingDeleteId = null;
    setVisible(this.deleteConfirm, false);
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

/** Short, plain-ASCII relative time for list rows. */
function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const minutes = Math.floor((now - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
