/**
 * The note commands the home surfaces offer (the dock and the parked home
 * window), each with its confirmation toast, so both behave the same.
 */

import type { PaperStyle } from '../notes/note-model.js';
import type { NoteSession } from '../notes/note-session.js';
import { noteTitleFor, truncate } from './format.js';
import { newNoteToast, openedNoteToast, type ToastService } from './toasts.js';

/** Longest note title shown in a toast. */
const TOAST_TITLE_MAX_CHARS = 24;

/** Start a note on `paper`, titled with the current date and time. */
export function startNote(session: NoteSession, toasts: ToastService, paper: PaperStyle): void {
  void session.createNote(noteTitleFor(), paper);
  toasts.show(newNoteToast(paper));
}

/** Open a note; the toast only confirms it once it is actually open. */
export async function openNoteFromHome(
  session: NoteSession,
  toasts: ToastService,
  noteId: string,
): Promise<void> {
  await session.openNote(noteId);
  const opened = session.active;
  if (opened?.id !== noteId) return;
  toasts.show(openedNoteToast(truncate(opened.title || 'Untitled note', TOAST_TITLE_MAX_CHARS)));
}
