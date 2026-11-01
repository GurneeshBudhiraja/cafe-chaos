/**
 * Sticky notes: small handwritten notes stuck around the room.
 *
 * They belong to the room, not to any note: they stay where they were put
 * and show whether or not a note is open. Each has its own page of strokes
 * (the same Stroke data as a note's page) and its place in the room.
 *
 * Pure data, like note-model.ts: no IWSDK, DOM or storage.
 */

import { createId, createPage, parsePage, type Page } from '../notes/note-model.js';

/** The five kinds, after the sticky-note models (sticky-notes.scene-asset.ts). */
export type StickyKind = 'classic' | 'mint' | 'blush' | 'sky' | 'formal';
export const STICKY_KINDS: readonly StickyKind[] = ['classic', 'mint', 'blush', 'sky', 'formal'];

/**
 * Where a sticky note is: its position and rotation, either relative to the
 * room's anchor (`anchor`: stays put across sessions on a headset) or to the
 * scene (`world`: when the session has no anchor, e.g. on a desktop).
 */
export interface StickyPlacement {
  frame: 'anchor' | 'world';
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface StickyNote {
  id: string;
  kind: StickyKind;
  page: Page;
  /** Null until the note has been put somewhere. */
  placement: StickyPlacement | null;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
}

export function createSticky(kind: StickyKind, now = Date.now()): StickyNote {
  return { id: createId(), kind, page: createPage(), placement: null, createdAt: now, updatedAt: now };
}

/** Validate a stored sticky note; null when it cannot be trusted. Never throws. */
export function parseSticky(value: unknown): StickyNote | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !STICKY_KINDS.includes(raw.kind as StickyKind)) return null;
  const page = parsePage(raw.page);
  if (!page) return null;
  return {
    id: raw.id,
    kind: raw.kind as StickyKind,
    page,
    placement: parsePlacement(raw.placement),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

function parsePlacement(value: unknown): StickyPlacement | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const numbers = (v: unknown, length: number): v is number[] =>
    Array.isArray(v) && v.length === length && v.every((n) => typeof n === 'number' && Number.isFinite(n));
  if ((raw.frame !== 'anchor' && raw.frame !== 'world') || !numbers(raw.position, 3) || !numbers(raw.quaternion, 4)) {
    return null;
  }
  return {
    frame: raw.frame,
    position: raw.position as StickyPlacement['position'],
    quaternion: raw.quaternion as StickyPlacement['quaternion'],
  };
}
