/**
 * The note commands the home surfaces offer (the dock and the parked home
 * window), so both behave the same: the note opens on the page in front
 * of the viewer.
 */

import type { PaperStyle } from '../notes/note-model.js';
import type { NoteSession } from '../notes/note-session.js';
import { noteTitleFor } from './format.js';
import type { NoteViewState } from './note-view.js';

/** Start a note on `paper`, titled with the current date and time, and open it. */
export async function startNote(session: NoteSession, noteView: NoteViewState, paper: PaperStyle): Promise<void> {
  await session.createNote(noteTitleFor(), paper);
  noteView.open();
}

/** Open a note; the page only comes up once the note is actually open. */
export async function openNoteFromHome(
  session: NoteSession,
  noteView: NoteViewState,
  noteId: string,
): Promise<void> {
  await session.openNote(noteId);
  if (session.active?.id !== noteId) return;
  noteView.open();
}
