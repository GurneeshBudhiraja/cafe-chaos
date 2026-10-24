/**
 * Shares the one NoteSession with ECS systems through IWSDK's `world.globals`.
 * index.ts provides it before registering systems; systems read it in init().
 */

import type { World } from '@iwsdk/core';
import { NoteSession } from './note-session.js';

const SESSION_KEY = 'metaNotes.noteSession';

export function provideNoteSession(world: World, session: NoteSession): void {
  world.globals[SESSION_KEY] = session;
}

export function getNoteSession(world: World): NoteSession {
  const session = world.globals[SESSION_KEY];
  if (!(session instanceof NoteSession)) {
    throw new Error('NoteSession missing: call provideNoteSession() before registering systems.');
  }
  return session;
}
