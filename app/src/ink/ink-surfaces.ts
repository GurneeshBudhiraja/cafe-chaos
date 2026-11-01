/**
 * Which page each writable surface shows and edits.
 *
 * Every entity with a `WritingSurface` takes ink (InkSystem). The tablet
 * shows the open note (NoteSession, the default); other surfaces, such as
 * sticky notes, register their own InkDocument here before they get their
 * WritingSurface component, so each has its own page and undo history.
 * Lives in `world.globals` like the other shared state.
 */

import type { Entity, World } from '@iwsdk/core';
import type { InkDocument } from '../notes/note-session.js';

export class InkSurfaces {
  private readonly documents = new Map<Entity, InkDocument>();

  /** Give `entity`'s writing surface its own page. Call before adding its WritingSurface. */
  register(entity: Entity, document: InkDocument): void {
    this.documents.set(entity, document);
  }

  unregister(entity: Entity): void {
    this.documents.delete(entity);
  }

  /** The page `entity` shows, or undefined to use the open note. */
  documentFor(entity: Entity): InkDocument | undefined {
    return this.documents.get(entity);
  }
}

const KEY = 'metaNotes.inkSurfaces';

/** The shared registry, created on first use. */
export function getInkSurfaces(world: World): InkSurfaces {
  let surfaces = world.globals[KEY];
  if (!(surfaces instanceof InkSurfaces)) {
    surfaces = new InkSurfaces();
    world.globals[KEY] = surfaces;
  }
  return surfaces as InkSurfaces;
}
