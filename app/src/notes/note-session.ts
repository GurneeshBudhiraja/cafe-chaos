/**
 * NoteSession: the editing layer between input systems and storage.
 *
 * It owns the note library list, the active note, and autosave. Every edit
 * (stroke, rename, text) goes through a command here, so desktop and XR input
 * share one editor instead of two.
 *
 * Saving rules:
 * - Edits mark the note dirty and save after a short delay (autosave).
 * - A dirty note stays in memory until a write succeeds. A failed save never
 *   discards work; it shows "Save failed" and retries on the next edit or on
 *   an explicit retry.
 * - A revision counter detects edits made while a write was in flight, so
 *   those edits are saved by the next cycle instead of being marked clean.
 *
 * Ink edits (writing, erasing, moving strokes) go into the open note's
 * undo history (stroke-history.ts); opening another note starts afresh.
 */

import {
  createNote,
  type Note,
  type Page,
  type PaperStyle,
  type Stroke,
} from './note-model.js';
import { summarize, type NoteStore, type NoteSummary } from './note-store.js';
import { removeStrokes, replaceStrokes, StrokeHistory } from './stroke-history.js';
import { devLog } from '../util/dev-log.js';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * What changed; listeners re-read the session state they care about.
 * 'strokes' is the open page's ink changing by an edit other than a new
 * stroke (erase, move, undo, redo).
 */
export type NoteSessionChange = 'library' | 'active' | 'save' | 'strokes';

/** The surface the ink system needs; keeps InkSystem independent of storage. */
export interface InkDocument {
  getActivePage(): Page | null;
  commitStroke(stroke: Stroke): void;
  /** Remove strokes from the open page, as one undoable edit. */
  eraseStrokes(ids: ReadonlySet<string>): void;
  /** Swap strokes for changed copies with the same ids (a move), as one undoable edit. */
  replaceStrokes(strokes: readonly Stroke[]): void;
  /** Reverse the open page's newest ink edit; false when there is none. */
  undo(): boolean;
  /** Re-apply the most recently undone ink edit; false when there is none. */
  redo(): boolean;
  subscribe(listener: (change: NoteSessionChange) => void): () => void;
}

export const MAX_TITLE_LENGTH = 60;
export const MAX_TEXT_LENGTH = 2000;

interface DirtyEntry {
  note: Note;
  revision: number;
}

export class NoteSession implements InkDocument {
  summaries: NoteSummary[] = [];
  active: Note | null = null;
  saveStatus: SaveStatus = 'idle';
  /** Plain-language description of the last failure, for the UI. */
  lastError: string | null = null;
  loaded = false;

  private readonly dirty = new Map<string, DirtyEntry>();
  /** Undo and redo for the open note's ink. */
  private readonly history = new StrokeHistory();
  private readonly listeners = new Set<(change: NoteSessionChange) => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<boolean> | null = null;

  constructor(
    private readonly store: NoteStore,
    private readonly autosaveDelayMs = 400,
  ) {}

  // ---------------------------------------------------------------- loading

  /**
   * Load the library and open the most recent note. A first launch opens
   * nothing: the home window shows its empty state until the user starts
   * a note.
   */
  async load(): Promise<void> {
    try {
      this.summaries = await this.store.list();
    } catch (error) {
      this.lastError = `Saved notes could not be read: ${describe(error)}`;
      this.summaries = [];
    }
    this.loaded = true;
    this.emit('library');
    if (this.summaries.length > 0) await this.openNote(this.summaries[0].id);
  }

  // --------------------------------------------------------------- commands

  async createNote(title?: string, paper?: PaperStyle): Promise<Note> {
    const note = createNote(title, Date.now(), paper);
    this.active = note;
    this.history.clear();
    this.markDirty(note);
    this.emit('active');
    // Save right away so a brand-new note survives an immediate reload.
    await this.flush();
    return note;
  }

  async openNote(id: string): Promise<void> {
    if (this.active?.id === id) return;
    // Try to save the current note first; on failure it stays in `dirty`.
    await this.flush();
    const unsaved = this.dirty.get(id)?.note;
    let note: Note | null = unsaved ?? null;
    if (!note) {
      try {
        note = await this.store.get(id);
      } catch (error) {
        this.lastError = `That note could not be opened: ${describe(error)}`;
        this.emit('save');
        return;
      }
    }
    if (!note) {
      // Listed but missing (for example deleted in another tab).
      this.summaries = this.summaries.filter((s) => s.id !== id);
      this.emit('library');
      return;
    }
    this.active = note;
    this.history.clear();
    this.emit('active');
  }

  /**
   * Read a note without opening it (for previews): the open or unsaved copy
   * when there is one, else the stored note. Null if it cannot be read.
   */
  async getNote(id: string): Promise<Note | null> {
    if (this.active?.id === id) return this.active;
    const unsaved = this.dirty.get(id)?.note;
    if (unsaved) return unsaved;
    try {
      return await this.store.get(id);
    } catch {
      return null;
    }
  }

  renameActive(title: string): void {
    const note = this.active;
    if (!note) return;
    const next = title.slice(0, MAX_TITLE_LENGTH);
    if (next === note.title) return;
    note.title = next;
    this.markDirty(note);
  }

  setActiveText(text: string): void {
    const note = this.active;
    if (!note) return;
    const next = text.slice(0, MAX_TEXT_LENGTH);
    if (next === note.text) return;
    note.text = next;
    this.markDirty(note);
  }

  /**
   * The open page's typed text was edited (TextEditor changes the page's
   * frames in place, with its own undo history): save it.
   */
  textEdited(): void {
    if (this.active) this.markDirty(this.active);
  }

  getActivePage(): Page | null {
    return this.active?.pages[0] ?? null;
  }

  commitStroke(stroke: Stroke): void {
    const note = this.active;
    const page = this.getActivePage();
    if (!note || !page) return;
    page.strokes.push(stroke);
    this.history.record({ kind: 'add', stroke });
    this.markDirty(note);
  }

  eraseStrokes(ids: ReadonlySet<string>): void {
    const note = this.active;
    const page = this.getActivePage();
    if (!note || !page || ids.size === 0) return;
    const removed = removeStrokes(page, ids);
    if (removed.length === 0) return;
    this.history.record({ kind: 'remove', removed });
    this.inkChanged(note);
  }

  replaceStrokes(strokes: readonly Stroke[]): void {
    const note = this.active;
    const page = this.getActivePage();
    if (!note || !page || strokes.length === 0) return;
    const ids = new Set(strokes.map((stroke) => stroke.id));
    const before = page.strokes.filter((stroke) => ids.has(stroke.id));
    replaceStrokes(page, strokes);
    this.history.record({ kind: 'replace', before, after: [...strokes] });
    this.inkChanged(note);
  }

  undo(): boolean {
    const note = this.active;
    const page = this.getActivePage();
    if (!note || !page || !this.history.undo(page)) return false;
    this.inkChanged(note);
    return true;
  }

  redo(): boolean {
    const note = this.active;
    const page = this.getActivePage();
    if (!note || !page || !this.history.redo(page)) return false;
    this.inkChanged(note);
    return true;
  }

  /** Permanently delete a note. The UI must confirm before calling this. */
  async deleteNote(id: string): Promise<boolean> {
    // Stop autosave from writing this note again, and let an in-flight write
    // finish first; otherwise a late write could bring the note back.
    const unsaved = this.dirty.get(id);
    this.dirty.delete(id);
    if (this.saving) await this.saving;
    try {
      await this.store.delete(id);
    } catch (error) {
      if (unsaved) this.dirty.set(id, unsaved); // Keep the work if delete fails.
      this.lastError = `The note could not be deleted: ${describe(error)}`;
      this.saveStatus = 'failed';
      this.emit('save');
      return false;
    }
    this.dirty.delete(id);
    this.summaries = this.summaries.filter((s) => s.id !== id);
    this.emit('library');
    if (this.active?.id === id) {
      this.active = null;
      this.history.clear();
      const next = this.summaries[0];
      if (next) await this.openNote(next.id);
      else this.emit('active');
    }
    return true;
  }

  // ----------------------------------------------------------------- saving

  get hasUnsavedChanges(): boolean {
    return this.dirty.size > 0;
  }

  /**
   * Save every dirty note now. Resolves to true when everything is saved.
   * Concurrent calls share the in-flight save, then save any newer edits.
   */
  async flush(): Promise<boolean> {
    this.clearTimer();
    if (this.saving) await this.saving;
    if (this.dirty.size === 0) return true;

    this.saving = this.writeDirty();
    const ok = await this.saving;
    this.saving = null;
    // Edits that arrived during the write get their own cycle.
    if (ok && this.dirty.size > 0) this.scheduleSave();
    return ok;
  }

  /** Save on tab hide and warn before leaving with unsaved work. */
  attachLifecycle(): () => void {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void this.flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!this.hasUnsavedChanges) return;
      void this.flush();
      event.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }

  subscribe(listener: (change: NoteSessionChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------- private

  /** The open page's ink changed by an edit: save it and let the ink re-render. */
  private inkChanged(note: Note): void {
    this.markDirty(note);
    this.emit('strokes');
  }

  private markDirty(note: Note): void {
    note.updatedAt = Date.now();
    const entry = this.dirty.get(note.id);
    this.dirty.set(note.id, { note, revision: (entry?.revision ?? 0) + 1 });
    this.upsertSummary(note);
    this.scheduleSave();
  }

  private async writeDirty(): Promise<boolean> {
    this.setStatus('saving');
    let ok = true;
    for (const [id, entry] of [...this.dirty]) {
      const revision = entry.revision;
      try {
        await this.store.put(entry.note);
        // Only mark clean if nothing changed while the write was in flight.
        if (this.dirty.get(id)?.revision === revision) this.dirty.delete(id);
      } catch (error) {
        ok = false;
        this.lastError = `Changes are kept on screen but not saved yet: ${describe(error)}`;
      }
    }
    if (ok) this.lastError = null;
    this.setStatus(ok ? 'saved' : 'failed');
    return ok;
  }

  private upsertSummary(note: Note): void {
    this.summaries = [summarize(note), ...this.summaries.filter((s) => s.id !== note.id)];
    this.emit('library');
  }

  private scheduleSave(): void {
    this.clearTimer();
    this.saveTimer = setTimeout(() => void this.flush(), this.autosaveDelayMs);
  }

  private clearTimer(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private setStatus(status: SaveStatus): void {
    devLog('save', `${status}${status === 'failed' ? `: ${this.lastError}` : ''} (${this.dirty.size} unsaved)`);
    this.saveStatus = status;
    this.emit('save');
  }

  private emit(change: NoteSessionChange): void {
    for (const listener of this.listeners) listener(change);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
