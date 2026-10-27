/**
 * User preferences, kept on this device next to the notes (which live in
 * IndexedDB). They are small and read at start-up, so localStorage is
 * enough; every access is guarded because storage can be unavailable
 * (private mode, blocked site data) and the app must still start with the
 * defaults.
 */

export interface Preferences {
  /** Stick mode: the dock follows your view (on by default). */
  stickMode: boolean;
}

const KEY = 'metaNotes.preferences';
const DEFAULTS: Preferences = { stickMode: true };

export function loadPreferences(): Preferences {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(preferences));
  } catch {
    // Not saved this time; the choice still applies for this session.
  }
}
