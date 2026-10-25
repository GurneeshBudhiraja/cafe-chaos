/**
 * HomeWindowSystem: connects the home window (UIKitML) to the NoteSession.
 *
 * The window shows a live clock with the save status under it, recent notes
 * as glass cards (tap to open on the tablet; chevrons or a drag page through
 * them), a New note button, a settings sheet (placeholder for now), and a
 * compact toggle that collapses the window to a pill with the expand toggle,
 * a centred New note and settings.
 *
 * All note changes go through NoteSession commands; this system only reads
 * session state and renders it.
 */

import { AssetManager, createSystem, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import { formatRelativeTime, noteTitleFor, truncate } from '../ui/format.js';
import { attachLiquidGlass, type LiquidGlass } from '../ui/liquid-glass.js';
import {
  PanelBinding,
  setText,
  setVisible,
  type PanelElement,
} from '../ui/panel-helpers.js';

const HOME_WINDOW_NODE = 'home-window';
/** Square corners; must match .window border-radius in home-window.uikitml. */
const WINDOW_RADIUS_PX = 0;
const WALLPAPER_ASSET = 'home-wallpaper';
/** Must match the number of `recent-card-N` elements in home-window.uikitml. */
const CARD_SLOTS = 8;
const CARD_TITLE_MAX_CHARS = 14;
/** One chevron press scrolls by one card plus the gap (UIKit units). */
const CARD_STEP = 137;
const CARDS_PER_PAGE = 4;

const LIME = '#d4f86b';
const LIME_HIDDEN = 'rgba(212, 248, 107, 0)';
const CARD_COLOR = 'rgba(255, 255, 255, 0.16)';
const PILL_COLOR = 'rgba(255, 255, 255, 0.12)';
/** Pointer-over feedback, so a ray or hand shows what a pinch will hit. */
const CARD_HOVER_COLOR = 'rgba(255, 255, 255, 0.3)';
const BUTTON_HOVER_COLOR = 'rgba(255, 255, 255, 0.22)';
const BUTTON_COLOR = 'rgba(255, 255, 255, 0)';

interface NoteCard {
  root: PanelElement;
  title: UIKit.Text;
  meta: UIKit.Text;
  noteId: string | null;
}

/** The scrollable strip; UIKit exposes its scroll offset as a signal. */
interface ScrollContainer {
  scrollPosition: { value: [number, number]; peek(): [number, number] };
  maxScrollPosition: { peek(): [number | undefined, number | undefined] };
}

export class HomeWindowSystem extends createSystem({}) {
  private session!: NoteSession;
  private cards: NoteCard[] = [];
  private compact = false;
  private settingsOpen = false;
  private shownMinute = '';

  private glass: LiquidGlass | null = null;
  private wallpaperReady = false;
  private clockTime!: UIKit.Text;
  private clockDate!: UIKit.Text;
  private strip: ScrollContainer | null = null;
  private prevChevron!: PanelElement;
  private nextChevron!: PanelElement;
  private saveStatus!: UIKit.Text;
  private retryButton!: PanelElement;
  private statusRow!: PanelElement;
  private settingsSheet!: PanelElement;
  /** Shown only in full mode / only in compact mode. */
  private fullOnly: PanelElement[] = [];
  private compactOnly: PanelElement[] = [];

  init(): void {
    this.session = getNoteSession(this.world);
    const panel = this.world.getSceneObject<UIKitMLAsset>(HOME_WINDOW_NODE);
    if (!panel) {
      console.warn('[HomeWindowSystem] Home window missing from the scene.');
      return;
    }
    const ui = new PanelBinding(panel, this.cleanupFuncs);
    // The window surface is a shader-drawn glass slab (see liquid-glass.ts);
    // its radius matches .window's border-radius in home-window.uikitml.
    this.glass = attachLiquidGlass(ui.element('home-root'), this.cleanupFuncs, {
      radiusPx: WINDOW_RADIUS_PX,
      edgeHighlights: false, // no outline around the window
    });
    // Lock-screen wallpaper; frosted glass shows until it has loaded.
    AssetManager.loadTextureById(WALLPAPER_ASSET)
      .then((texture) => {
        this.glass?.setImage(texture);
        this.wallpaperReady = true;
        this.applyMode();
      })
      .catch((error) => console.warn('[HomeWindowSystem] Wallpaper failed to load.', error));

    this.clockTime = ui.text('clock-time');
    this.clockDate = ui.text('clock-date');
    this.saveStatus = ui.text('save-status');
    this.statusRow = ui.element('status-row');
    this.settingsSheet = ui.element('settings-sheet');
    this.retryButton = ui.onClick('save-retry-button', () => void this.session.flush());

    const newNote = () => void this.session.createNote(noteTitleFor());
    this.fullOnly = [
      ui.onClick('compact-toggle', () => this.setCompact(true)),
      ui.onClick('settings-button', () => this.toggleSettings()),
      ui.element('clock'),
      ui.element('recent-section'),
      ui.element('bottom-row'),
    ];
    this.compactOnly = [
      ui.onClick('expand-toggle', () => this.setCompact(false)),
      ui.onClick('compact-new-button', newNote),
      // Settings from the pill opens the full window with the sheet showing.
      ui.onClick('compact-settings-button', () => this.openSettingsFromCompact()),
    ];
    ui.onClick('note-new-button', newNote);

    this.prevChevron = ui.onClick('recent-prev', () => this.page(-1));
    this.nextChevron = ui.onClick('recent-next', () => this.page(1));

    for (let i = 0; i < CARD_SLOTS; i++) {
      const card: NoteCard = {
        root: ui.onClick(`recent-card-${i}`, () => {
          if (card.noteId) void this.session.openNote(card.noteId);
        }),
        title: ui.text(`recent-title-${i}`),
        meta: ui.text(`recent-meta-${i}`),
        noteId: null,
      };
      this.cards.push(card);
    }
    this.strip = findScrollContainer(this.cards[0]?.root);

    // Hover feedback on everything a pinch can hit (Meta guidance: targets
    // must react to the pointer before they are selected).
    for (const card of this.cards) this.addHover(card.root, CARD_COLOR, CARD_HOVER_COLOR);
    for (const id of [
      'settings-button',
      'compact-toggle',
      'expand-toggle',
      'compact-new-button',
      'compact-settings-button',
      'recent-prev',
      'recent-next',
    ]) {
      this.addHover(ui.element(id), BUTTON_COLOR, BUTTON_HOVER_COLOR);
    }
    this.addHover(ui.element('note-new-button'), PILL_COLOR, BUTTON_HOVER_COLOR);

    // The clock only needs to change when the minute does.
    const clockTimer = setInterval(() => {
      this.renderClock();
      this.renderChevrons();
    }, 1000);
    this.cleanupFuncs.push(
      () => clearInterval(clockTimer),
      this.session.subscribe(() => {
        this.renderStatus();
        this.renderCards();
        // A failed save must stay visible: leave compact mode to show it.
        if (this.compact && this.session.saveStatus === 'failed') this.setCompact(false);
      }),
    );

    this.renderClock();
    this.renderStatus();
    this.renderCards();
    this.applyMode();
  }

  // ------------------------------------------------------------- rendering

  private renderClock(): void {
    const now = new Date();
    const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (time === this.shownMinute) return;
    this.shownMinute = time;
    setText(this.clockTime, time);
    setText(
      this.clockDate,
      now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    );
  }

  /** Saving is silent; only a failed save shows a line, with a retry. */
  private renderStatus(): void {
    const failed = this.session.saveStatus === 'failed';
    setText(this.saveStatus, failed ? "Couldn't save. Your changes are kept." : '');
    setVisible(this.statusRow, failed);
    setVisible(this.retryButton, failed);
  }

  /** Most recent notes first; unused slots are hidden. The strip scrolls. */
  private renderCards(): void {
    const summaries = this.session.summaries;
    this.cards.forEach((card, i) => {
      const summary = summaries[i];
      card.noteId = summary?.id ?? null;
      setVisible(card.root, summary !== undefined);
      if (!summary) return;
      setText(card.title, truncate(summary.title || 'Untitled note', CARD_TITLE_MAX_CHARS));
      setText(card.meta, `Edited ${formatRelativeTime(summary.updatedAt)}`);
    });
    this.renderChevrons();
  }

  /** Chevrons show only when there is more to see in that direction. */
  private renderChevrons(): void {
    const x = this.strip?.scrollPosition.peek()[0] ?? 0;
    const max = this.strip?.maxScrollPosition.peek()[0] ?? 0;
    // Hidden chevrons stay in the layout (transparent) so cards never shift.
    this.prevChevron.setProperties({ color: x > 1 ? LIME : LIME_HIDDEN });
    this.nextChevron.setProperties({ color: x < max - 1 ? LIME : LIME_HIDDEN });
  }

  /** Scroll the strip one page (four cards) back or forward. */
  private page(direction: -1 | 1): void {
    if (!this.strip) return;
    const [x, y] = this.strip.scrollPosition.peek();
    const max = this.strip.maxScrollPosition.peek()[0] ?? 0;
    const next = Math.min(max, Math.max(0, x + direction * CARD_STEP * CARDS_PER_PAGE));
    this.strip.scrollPosition.value = [next, y];
    this.renderChevrons();
  }

  private addHover(element: PanelElement, color: string, hoverColor: string): void {
    const enter = () => element.setProperties({ backgroundColor: hoverColor });
    const leave = () => element.setProperties({ backgroundColor: color });
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    this.cleanupFuncs.push(() => {
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
    });
  }

  // ----------------------------------------------------------------- modes

  private setCompact(compact: boolean): void {
    this.compact = compact;
    if (compact) this.settingsOpen = false;
    this.applyMode();
  }

  private openSettingsFromCompact(): void {
    this.compact = false;
    this.settingsOpen = true;
    this.applyMode();
  }

  private toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    this.applyMode();
  }

  private applyMode(): void {
    for (const el of this.fullOnly) setVisible(el, !this.compact);
    for (const el of this.compactOnly) setVisible(el, this.compact);
    setVisible(this.settingsSheet, this.settingsOpen && !this.compact);
    // The full window shows the wallpaper; the compact pill is frosted glass.
    this.glass?.setImageMix(this.wallpaperReady && !this.compact ? 1 : 0);
  }
}

/** The nearest ancestor UIKit marks as scrollable (the recent strip). */
function findScrollContainer(element: PanelElement | undefined): ScrollContainer | null {
  let node = (element as unknown as { parent?: unknown } | undefined)?.parent;
  while (node && typeof node === 'object') {
    if ('scrollPosition' in node && 'maxScrollPosition' in node) return node as ScrollContainer;
    node = (node as { parent?: unknown }).parent;
  }
  return null;
}
