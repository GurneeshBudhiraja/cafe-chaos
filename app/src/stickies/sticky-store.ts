/**
 * Sticky note persistence: the browser database (IndexedDB), in its own
 * database beside the notes (note-store.ts), so the two never block or
 * migrate each other.
 */

import { parseSticky, type StickyNote } from './sticky-model.js';

const DB_NAME = 'meta-notes-stickies';
/** Bump with an `onupgradeneeded` migration when stores or indexes change. */
const DB_VERSION = 1;
const STICKIES = 'stickies';

export class StickyStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /** Every readable sticky note (unreadable records are skipped, never thrown on). */
  async list(): Promise<StickyNote[]> {
    const records = await this.request<unknown[]>('readonly', (s) => s.getAll());
    const stickies: StickyNote[] = [];
    for (const record of records) {
      const sticky = parseSticky(record);
      if (sticky) stickies.push(sticky);
      else console.warn('[StickyStore] Skipping an unreadable sticky note record.');
    }
    return stickies;
  }

  /** Insert or replace. Resolves once the write is durable. */
  async put(sticky: StickyNote): Promise<void> {
    await this.request('readwrite', (s) => s.put(sticky));
  }

  async delete(id: string): Promise<void> {
    await this.request('readwrite', (s) => s.delete(id));
  }

  /** Run one request in its own transaction and wait for the commit. */
  private async request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STICKIES, mode);
      const req = run(tx.objectStore(STICKIES));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error ?? req.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  }

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STICKIES)) {
          req.result.createObjectStore(STICKIES, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((error: unknown) => {
      // Allow a later retry instead of caching the failure forever.
      this.dbPromise = null;
      throw error;
    });
    return this.dbPromise;
  }
}
