/**
 * Note persistence.
 *
 * `NoteStore` is the storage contract the editing layer depends on.
 * `IndexedDbNoteStore` keeps notes in the browser database (IndexedDB), which
 * works offline in Meta Quest Browser and desktop browsers alike.
 *
 * Browser storage is NOT a backup: it can be cleared by the user or the
 * browser. A backup export arrives in a later phase.
 */

import { parseNote, type Note, type PaperStyle } from './note-model.js';

/** What the note list needs, without loading every page of every note. */
export interface NoteSummary {
  id: string;
  title: string;
  updatedAt: number;
  /** The note's paper, so lists can filter by it without loading the note. */
  paper: PaperStyle;
}

/** The list entry for a note. */
export function summarize(note: Note): NoteSummary {
  return { id: note.id, title: note.title, updatedAt: note.updatedAt, paper: note.paper };
}

export interface NoteStore {
  /** All notes, most recently edited first. */
  list(): Promise<NoteSummary[]>;
  get(id: string): Promise<Note | null>;
  /** Insert or replace. Resolves only after the write is durable. */
  put(note: Note): Promise<void>;
  delete(id: string): Promise<void>;
}

const DB_NAME = 'meta-notes';
/** Bump with an `onupgradeneeded` migration when stores or indexes change. */
const DB_VERSION = 1;
const NOTES = 'notes';

export class IndexedDbNoteStore implements NoteStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async list(): Promise<NoteSummary[]> {
    const records = await this.request<unknown[]>('readonly', (s) => s.getAll());
    const summaries: NoteSummary[] = [];
    for (const record of records) {
      const note = parseNote(record);
      if (note) {
        summaries.push(summarize(note));
      } else {
        console.warn('[NoteStore] Skipping an unreadable note record.');
      }
    }
    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Note | null> {
    const record = await this.request<unknown>('readonly', (s) => s.get(id));
    return record === undefined ? null : parseNote(record);
  }

  async put(note: Note): Promise<void> {
    // IndexedDB stores a structured clone, so later edits to `note` in memory
    // never change what was saved.
    await this.request('readwrite', (s) => s.put(note));
  }

  async delete(id: string): Promise<void> {
    await this.request('readwrite', (s) => s.delete(id));
  }

  /** Run one request in its own transaction and wait for the commit. */
  private async request<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(NOTES, mode);
      const req = run(tx.objectStore(NOTES));
      // Resolve on transaction completion, so writes are committed.
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error ?? req.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  }

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(NOTES)) {
          db.createObjectStore(NOTES, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Note database is blocked by another tab.'));
    }).catch((error) => {
      // Allow a later retry instead of caching the failure forever.
      this.dbPromise = null;
      throw error;
    });
    return this.dbPromise;
  }
}

/**
 * Decorator that can make writes fail on purpose. Used to prove the app keeps
 * unsaved work and reports the failure (roadmap check for 18 October).
 * Reads are never affected.
 */
export class SimulatedFailureStore implements NoteStore {
  failWrites = false;

  constructor(private readonly inner: NoteStore) {}

  list(): Promise<NoteSummary[]> {
    return this.inner.list();
  }

  get(id: string): Promise<Note | null> {
    return this.inner.get(id);
  }

  put(note: Note): Promise<void> {
    if (this.failWrites) return Promise.reject(new Error('Simulated save failure'));
    return this.inner.put(note);
  }

  delete(id: string): Promise<void> {
    if (this.failWrites) return Promise.reject(new Error('Simulated delete failure'));
    return this.inner.delete(id);
  }
}
