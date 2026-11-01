/**
 * Filters for the "Show all" view: when a note was edited, and the order.
 * Pure functions over note summaries, so the dock only keeps the chosen
 * options and renders the result.
 */

import type { NoteSummary } from '../notes/note-store.js';

/** Edited today, in the last 7 days (today included), or before that. */
export type WhenFilter = 'all' | 'today' | 'week' | 'older';
export type NoteSort = 'recent' | 'title';

export interface NoteFilters {
  when: WhenFilter;
  sort: NoteSort;
}

export const DEFAULT_FILTERS: Readonly<NoteFilters> = { when: 'all', sort: 'recent' };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Whether any filter narrows the list (sorting alone does not). */
export function isFiltering(filters: NoteFilters): boolean {
  return filters.when !== 'all';
}

/** The notes that match, in the chosen order. Summaries arrive newest first. */
export function applyNoteFilters(
  summaries: readonly NoteSummary[],
  filters: NoteFilters,
  now = Date.now(),
): NoteSummary[] {
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const weekAgo = now - WEEK_MS;
  const matches = summaries.filter((note) => {
    switch (filters.when) {
      case 'today':
        return note.updatedAt >= midnight;
      case 'week':
        return note.updatedAt >= weekAgo;
      case 'older':
        return note.updatedAt < weekAgo;
      default:
        return true;
    }
  });
  if (filters.sort === 'title') {
    matches.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }
  return matches;
}
