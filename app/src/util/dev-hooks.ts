/**
 * Development-only hooks for automated checks (scripts/*.mjs and the IWSDK
 * CLI). Exposes app objects on `window.__metaNotes` so scripts can locate UI
 * elements in 3D and inspect or fail note storage on purpose.
 * Nothing is exposed in production builds.
 */

import type { World } from '@iwsdk/core';
import type { NoteSession } from '../notes/note-session.js';
import type { SimulatedFailureStore } from '../notes/note-store.js';

export interface DevHooks {
  world: World;
  session: NoteSession;
  store: SimulatedFailureStore;
}

export function installDevHooks(hooks: DevHooks): void {
  if (!import.meta.env.DEV) return;
  (window as unknown as { __metaNotes: DevHooks }).__metaNotes = hooks;
}
