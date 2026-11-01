/**
 * StickyBoard: every sticky note in the room, kept and saved.
 *
 * The board loads the sticky notes when the app starts, creates new ones,
 * saves each a moment after it changes (its ink or its place), and removes
 * ones thrown away (keeping the last one, so it can be brought back).
 *
 * Each sticky note's page has its own InkDocument (StickyInk), so the pen,
 * eraser, lasso and undo work on it just as on the tablet. Lives in
 * `world.globals` like the other shared services.
 */

import type { World } from '@iwsdk/core';
import type { Page, Stroke } from '../notes/note-model.js';
import type { InkDocument, NoteSessionChange } from '../notes/note-session.js';
import { removeStrokes, replaceStrokes, StrokeHistory } from '../notes/stroke-history.js';
import { devLog } from '../util/dev-log.js';
import { createSticky, type StickyKind, type StickyNote, type StickyPlacement } from './sticky-model.js';
import { StickyStore } from './sticky-store.js';

/** Wait this long after a change before saving (ms): a burst of strokes saves once. */
const SAVE_DELAY_MS = 400;

export type StickyBoardEvent =
  | { kind: 'added'; sticky: StickyNote }
  | { kind: 'removed'; sticky: StickyNote };

export class StickyBoard {
  private readonly stickies = new Map<string, StickyNote>();
  private readonly inks = new Map<string, StickyInk>();
  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly listeners = new Set<(event: StickyBoardEvent) => void>();
  /** The sticky note thrown away last, so it can be brought back. */
  private lastRemoved: StickyNote | null = null;
  loaded = false;

  constructor(private readonly store = new StickyStore()) {}

  /** Read the saved sticky notes; each is announced as added. */
  async load(): Promise<void> {
    try {
      for (const sticky of await this.store.list()) this.add(sticky);
    } catch (error) {
      console.warn('[StickyBoard] Saved sticky notes could not be read.', error);
    }
    this.loaded = true;
  }

  all(): StickyNote[] {
    return [...this.stickies.values()];
  }

  get(id: string): StickyNote | undefined {
    return this.stickies.get(id);
  }

  /** A new, blank sticky note of `kind`. */
  create(kind: StickyKind): StickyNote {
    const sticky = createSticky(kind);
    this.add(sticky);
    this.scheduleSave(sticky);
    return sticky;
  }

  /** The ink document for a sticky note's page. */
  inkFor(id: string): StickyInk | undefined {
    return this.inks.get(id);
  }

  /** Record where a sticky note now is. */
  place(id: string, placement: StickyPlacement): void {
    const sticky = this.stickies.get(id);
    if (!sticky) return;
    sticky.placement = placement;
    this.touch(sticky);
  }

  /** Throw a sticky note away (bringBack restores it). */
  remove(id: string): void {
    const sticky = this.stickies.get(id);
    if (!sticky) return;
    this.stickies.delete(id);
    this.inks.delete(id);
    this.cancelSave(id);
    this.lastRemoved = sticky;
    void this.store.delete(id).catch((error) => console.warn('[StickyBoard] A sticky note could not be deleted.', error));
    this.emit({ kind: 'removed', sticky });
  }

  /** Bring back the sticky note thrown away last; false when there is none. */
  bringBack(): boolean {
    const sticky = this.lastRemoved;
    if (!sticky) return false;
    this.lastRemoved = null;
    this.add(sticky);
    this.scheduleSave(sticky);
    return true;
  }

  subscribe(listener: (event: StickyBoardEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The sticky note changed: note when, and save it shortly. */
  touch(sticky: StickyNote): void {
    sticky.updatedAt = Date.now();
    this.scheduleSave(sticky);
  }

  private add(sticky: StickyNote): void {
    this.stickies.set(sticky.id, sticky);
    this.inks.set(sticky.id, new StickyInk(sticky, () => this.touch(sticky)));
    this.emit({ kind: 'added', sticky });
  }

  private scheduleSave(sticky: StickyNote): void {
    this.cancelSave(sticky.id);
    this.saveTimers.set(
      sticky.id,
      setTimeout(() => {
        this.saveTimers.delete(sticky.id);
        if (!this.stickies.has(sticky.id)) return;
        this.store.put(sticky).then(
          () => devLog('stickies', `saved ${sticky.id.slice(0, 8)} (${sticky.page.strokes.length} strokes)`),
          (error) => console.warn('[StickyBoard] A sticky note could not be saved.', error),
        );
      }, SAVE_DELAY_MS),
    );
  }

  private cancelSave(id: string): void {
    const timer = this.saveTimers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.saveTimers.delete(id);
  }

  private emit(event: StickyBoardEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/**
 * One sticky note's page as an InkDocument: the same edits as a note's
 * page (write, erase, move, undo, redo), saved through the board.
 */
export class StickyInk implements InkDocument {
  private readonly history = new StrokeHistory();
  private readonly listeners = new Set<(change: NoteSessionChange) => void>();

  constructor(
    private readonly sticky: StickyNote,
    private readonly changed: () => void,
  ) {}

  getActivePage(): Page {
    return this.sticky.page;
  }

  commitStroke(stroke: Stroke): void {
    this.sticky.page.strokes.push(stroke);
    this.history.record({ kind: 'add', stroke });
    this.changed();
  }

  eraseStrokes(ids: ReadonlySet<string>): void {
    const removed = removeStrokes(this.sticky.page, ids);
    if (removed.length === 0) return;
    this.history.record({ kind: 'remove', removed });
    this.edited();
  }

  replaceStrokes(strokes: readonly Stroke[]): void {
    if (strokes.length === 0) return;
    const ids = new Set(strokes.map((stroke) => stroke.id));
    const before = this.sticky.page.strokes.filter((stroke) => ids.has(stroke.id));
    replaceStrokes(this.sticky.page, strokes);
    this.history.record({ kind: 'replace', before, after: [...strokes] });
    this.edited();
  }

  undo(): boolean {
    if (!this.history.undo(this.sticky.page)) return false;
    this.edited();
    return true;
  }

  redo(): boolean {
    if (!this.history.redo(this.sticky.page)) return false;
    this.edited();
    return true;
  }

  subscribe(listener: (change: NoteSessionChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The page's ink changed by an edit: save, and let the ink re-render. */
  private edited(): void {
    this.changed();
    for (const listener of this.listeners) listener('strokes');
  }
}

const KEY = 'metaNotes.stickies';

/** The shared board, created on first use. */
export function getStickyBoard(world: World): StickyBoard {
  let board = world.globals[KEY];
  if (!(board instanceof StickyBoard)) {
    board = new StickyBoard();
    world.globals[KEY] = board;
  }
  return board as StickyBoard;
}
