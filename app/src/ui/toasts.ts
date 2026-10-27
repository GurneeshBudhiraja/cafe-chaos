/**
 * App messages as toasts: one slim glass line at the top centre of the view,
 * apart from the app, that fades away on its own. Keep them short: a title
 * of a few words and, at most, a few more words of detail.
 *
 * Any system can raise one through the shared service; ToastSystem draws
 * it. One toast shows at a time, and a newer one replaces it, so messages
 * never stack up in front of the user. Sticky toasts (a failed save) stay
 * until dismissed or replaced.
 */

import type { World } from '@iwsdk/core';

export type ToastKind = 'info' | 'done' | 'error';

export interface Toast {
  kind: ToastKind;
  title: string;
  body?: string;
  /** One optional action, shown as a pill (e.g. "Try again"). */
  action?: { label: string; run: () => void };
  /** Stay until dismissed or replaced (default: fade after a few seconds). */
  sticky?: boolean;
}

export class ToastService {
  private currentToast: Toast | null = null;
  private readonly listeners = new Set<(toast: Toast | null) => void>();

  get current(): Toast | null {
    return this.currentToast;
  }

  show(toast: Toast): void {
    this.currentToast = toast;
    for (const listener of this.listeners) listener(toast);
  }

  /** Dismiss the current toast, or only `toast` if given and still showing. */
  dismiss(toast?: Toast): void {
    if (!this.currentToast || (toast && toast !== this.currentToast)) return;
    this.currentToast = null;
    for (const listener of this.listeners) listener(null);
  }

  subscribe(listener: (toast: Toast | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const KEY = 'metaNotes.toasts';

export function getToasts(world: World): ToastService {
  let toasts = world.globals[KEY];
  if (!(toasts instanceof ToastService)) {
    toasts = new ToastService();
    world.globals[KEY] = toasts;
  }
  return toasts as ToastService;
}

/** Placeholder for the settings buttons until settings exist. */
export const SETTINGS_TOAST: Toast = {
  kind: 'info',
  title: 'Settings are coming soon',
};

/** After a new note is started (the home window and the dock). */
export function newNoteToast(paper: string): Toast {
  return {
    kind: 'done',
    title: paper === 'blank' ? 'New blank page' : `New ${paper} page`,
    body: 'Saved to Recent',
  };
}

/** After a note is opened, until the writing view exists. */
export function openedNoteToast(title: string): Toast {
  return {
    kind: 'info',
    // Plain text only: the UI font has no curly quotes (they render as boxes).
    title: `Opened ${title}`,
    body: 'Writing comes next',
  };
}
