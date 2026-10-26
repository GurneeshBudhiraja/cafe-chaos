/**
 * HomeWindowSystem: connects the home window (UIKitML) to the NoteSession.
 *
 * The first screen: a greeting with the date and time, a capsule of
 * controls (pin, settings, minimise), paper templates to start a note, and
 * "Recent" cards that preview each note's real ink, with a sort pill and
 * round prev/next buttons (or a drag) for more. With no notes yet, an empty
 * state invites the first one. The minimise button hides the window and
 * shows the compact dock (CompactDockSystem) instead.
 *
 * Messages (coming soon, a failed save) go out as toasts (ToastSystem).
 *
 * All note changes go through NoteSession commands; this system only reads
 * session state and renders it.
 */

import { createSystem, type Object3D, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { PAPER_STYLES, type PaperStyle } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import type { NoteSummary } from '../notes/note-store.js';
import { formatRelativeTime, noteTitleFor, truncate } from '../ui/format.js';
import { getHomeMode, type HomeModeState, WINDOW_GLASS_NAME } from '../ui/home-mode.js';
import { makeDraggable } from '../ui/drag.js';
import {
  attachGlowHalo,
  attachLiquidGlass,
  type GlowHalo,
  type LiquidGlass,
} from '../ui/liquid-glass.js';
import {
  addStateColors,
  addToggleStateColors,
  NEUTRAL_STATES,
  PanelBinding,
  PRIMARY_STATES,
  SECONDARY_STATES,
  setText,
  setVisible,
  type PanelElement,
} from '../ui/panel-helpers.js';
import { NoteThumbnail, PaperPreview } from '../ui/paper-preview.js';
import { addPressMotion } from '../ui/press-motion.js';
import { getToasts, SETTINGS_TOAST, type Toast, type ToastService } from '../ui/toasts.js';
import { easeInCubic, easeOutCubic, getTweens, type Tweens } from '../ui/tweens.js';

const HOME_WINDOW_NODE = 'home-window';
/** Must match .window border-radius in home-window.uikitml. */
const WINDOW_RADIUS_PX = 44;
/** Frosted enough for dark text over any room, clear enough to feel light. */
const WINDOW_FROST_ALPHA = 0.74;
/** Must match the number of `recent-card-N` elements in home-window.uikitml. */
const CARD_SLOTS = 8;
const CARD_TITLE_MAX_CHARS = 18;
/** One chevron press scrolls by one card plus the gap (UIKit units). */
const CARD_STEP = 214;
const CARDS_PER_PAGE = 4;
/** Transition timings (ms): hide, then show after the dock has faded. */
const HIDE_MS = 220;
const SHOW_MS = 320;
const SHOW_DELAY_MS = 120;
const GLOW_MS = 1200;
const PICKER_MS = 240;
/**
 * Starting tilt toward the viewer (radians): about what faces a standing
 * viewer's eyes from the window's default place, a little below eye level.
 */
const WINDOW_TILT_RAD = (6 * Math.PI) / 180;
/** Canvas widths for previews (about 2x their size on the window). */
const TEMPLATE_PREVIEW_PX = 272;
const THUMB_PREVIEW_PX = 376;

/** Opacity of a prev/next button with nothing more in its direction. */
const DISABLED_OPACITY = 0.35;

type SortMode = 'recent' | 'title';
const SORT_LABELS: Record<SortMode, string> = { recent: 'Last edited', title: 'Name' };


interface NoteCard {
  root: PanelElement;
  title: UIKit.Text;
  meta: UIKit.Text;
  thumbnail: NoteThumbnail;
  noteId: string | null;
}

/** The scrollable strip; UIKit exposes its scroll offset as a signal. */
interface ScrollContainer {
  scrollPosition: { value: [number, number]; peek(): [number, number] };
  maxScrollPosition: { peek(): [number | undefined, number | undefined] };
}

export class HomeWindowSystem extends createSystem({}) {
  private session!: NoteSession;
  private toasts!: ToastService;
  /** The sticky save-failure toast while it is up. */
  private failureToast: Toast | null = null;
  private cards: NoteCard[] = [];
  private homeMode!: HomeModeState;
  private tweens!: Tweens;
  private panel!: Object3D;
  private baseScale = 1;
  private root!: PanelElement;
  private grab!: PanelElement;
  private glass!: LiquidGlass;
  private halo!: GlowHalo;
  /** Whether the window is (or is becoming) visible. */
  private shown = true;
  private sort: SortMode = 'recent';
  private shownMinute = '';

  private greeting!: UIKit.Text;
  private clockDate!: UIKit.Text;
  private clockTime!: UIKit.Text;
  private strip: ScrollContainer | null = null;
  private prevChevron!: PanelElement;
  private nextChevron!: PanelElement;
  private sortLabel!: UIKit.Text;
  private emptyState!: PanelElement;
  private recentSection!: PanelElement;
  private picker!: PanelElement;
  private pickerTitle!: PanelElement;
  private newNoteButton!: PanelElement;
  /** The paper choice, opened from New note (always open with no notes). */
  private pickerOpen = false;

  init(): void {
    this.session = getNoteSession(this.world);
    this.toasts = getToasts(this.world);
    const panel = this.world.getSceneObject<UIKitMLAsset>(HOME_WINDOW_NODE);
    if (!panel) {
      console.warn('[HomeWindowSystem] Home window missing from the scene.');
      return;
    }
    const ui = new PanelBinding(panel, this.cleanupFuncs);
    this.homeMode = getHomeMode(this.world);
    this.tweens = getTweens(this.world);
    this.panel = panel;
    this.baseScale = panel.scale.x;
    // Sit a little below eye level, tipped back to face the eyes: the
    // comfortable place to look (drag.ts keeps this when it is moved).
    panel.rotation.x = -WINDOW_TILT_RAD;
    this.root = ui.element('home-root');
    this.grab = ui.element('window-grab');
    // The window surface is a shader-drawn frosted glass slab, with a soft
    // glow halo behind it that lights up as the window appears.
    this.halo = attachGlowHalo(this.root, this.cleanupFuncs, { marginPx: 70, host: panel });
    this.glass = attachLiquidGlass(this.root, this.cleanupFuncs, {
      radiusPx: WINDOW_RADIUS_PX,
      edgeHighlights: false,
      frostAlpha: WINDOW_FROST_ALPHA,
      host: panel,
      name: WINDOW_GLASS_NAME,
    });
    makeDraggable(this.grab, ui.element('window-grab-bar'), panel, this.world, this.cleanupFuncs, {
      onStart: () => this.homeMode.setDragging(true),
      onEnd: () => this.homeMode.setDragging(false),
    });
    const pin = ui.onClick('window-pin', () => this.homeMode.setPinned(!this.homeMode.pinned));
    const paintPin = addToggleStateColors(pin, () => this.homeMode.pinned, this.cleanupFuncs);
    this.cleanupFuncs.push(this.homeMode.subscribePlacement(paintPin));

    addPressMotion(pin, this.tweens, this.cleanupFuncs, { hover: 1.08, pressed: 0.92 });

    this.greeting = ui.text('greeting');
    this.clockDate = ui.text('clock-date');
    this.clockTime = ui.text('clock-time');
    this.sortLabel = ui.text('sort-label');
    this.emptyState = ui.element('recent-empty');
    this.recentSection = ui.element('recent-section');
    this.picker = ui.element('templates-section');
    this.pickerTitle = ui.element('picker-title');

    // New note, the one clay button, opens the paper choice.
    this.newNoteButton = ui.onClick('new-note-button', () => this.setPickerOpen(!this.pickerOpen));
    addStateColors(this.newNoteButton, PRIMARY_STATES, this.cleanupFuncs);
    addPressMotion(this.newNoteButton, this.tweens, this.cleanupFuncs);

    // Light-filled buttons (sort, prev/next).
    const filled: PanelElement[] = [ui.onClick('sort-button', () => this.toggleSort())];

    // Clear buttons and cards: light comes up under them when pointed at.
    const hoverable: PanelElement[] = [];
    const iconButtons = [
      ui.onClick('settings-button', () => this.toasts.show(SETTINGS_TOAST)),
      ui.onClick('compact-toggle', () => this.homeMode.set('compact')),
    ];
    hoverable.push(...iconButtons);
    for (const button of iconButtons) {
      addPressMotion(button, this.tweens, this.cleanupFuncs, { hover: 1.08, pressed: 0.92 });
    }

    // Templates: Blank is the main New note action; the others draw their paper.
    hoverable.push(ui.onClick('note-new-button', () => this.newNote('blank')));
    for (const paper of PAPER_STYLES) {
      if (paper === 'blank') continue;
      const preview = new PaperPreview(TEMPLATE_PREVIEW_PX);
      preview.draw(paper);
      ui.element(`template-img-${paper}`).setProperties({ src: preview.texture });
      hoverable.push(ui.onClick(`template-${paper}`, () => this.newNote(paper)));
      this.cleanupFuncs.push(() => preview.dispose());
    }

    this.prevChevron = ui.onClick('recent-prev', () => this.page(-1));
    this.nextChevron = ui.onClick('recent-next', () => this.page(1));
    filled.push(this.prevChevron, this.nextChevron);
    for (const button of filled) {
      addStateColors(button, SECONDARY_STATES, this.cleanupFuncs);
      addPressMotion(button, this.tweens, this.cleanupFuncs, { hover: 1.06, pressed: 0.94 });
    }

    for (let i = 0; i < CARD_SLOTS; i++) {
      const thumbnail = new NoteThumbnail(THUMB_PREVIEW_PX);
      ui.element(`recent-thumb-${i}`).setProperties({ src: thumbnail.texture });
      const card: NoteCard = {
        root: ui.onClick(`recent-card-${i}`, () => this.openCard(card)),
        title: ui.text(`recent-title-${i}`),
        meta: ui.text(`recent-meta-${i}`),
        thumbnail,
        noteId: null,
      };
      this.cards.push(card);
      hoverable.push(card.root);
      this.cleanupFuncs.push(() => thumbnail.dispose());
    }
    this.strip = findScrollContainer(this.cards[0]?.root);

    // State feedback on everything a pinch can hit (Meta guidance: targets
    // must react to the pointer before they are selected).
    for (const element of hoverable) addStateColors(element, NEUTRAL_STATES, this.cleanupFuncs);
    for (const card of this.cards) addPressMotion(card.root, this.tweens, this.cleanupFuncs);

    // The clock only needs to change when the minute does.
    const clockTimer = setInterval(() => {
      this.renderClock();
      this.renderChevrons();
    }, 1000);
    this.cleanupFuncs.push(
      () => clearInterval(clockTimer),
      this.session.subscribe(() => {
        this.renderSaveState();
        this.renderCards();
      }),
      this.homeMode.subscribe(() => this.applyMode()),
    );

    this.renderClock();
    this.renderSaveState();
    this.renderCards();
    this.applyMode();
  }

  // -------------------------------------------------------------- commands

  private newNote(paper: PaperStyle): void {
    void this.session.createNote(noteTitleFor(), paper);
    this.setPickerOpen(false);
    this.toasts.show({
      kind: 'done',
      title: paper === 'blank' ? 'New blank page' : `New ${paper} page`,
      body: 'Saved to Recent.',
    });
  }

  private openCard(card: NoteCard): void {
    if (!card.noteId) return;
    void this.session.openNote(card.noteId);
    const title = this.session.summaries.find((s) => s.id === card.noteId)?.title || 'Untitled note';
    this.toasts.show({
      kind: 'info',
      title: `Opened \u201c${truncate(title, 24)}\u201d`,
      body: 'Writing on notes is coming soon.',
    });
  }

  /** Show or hide the paper choice, fading it in when it opens. */
  private setPickerOpen(open: boolean): void {
    this.pickerOpen = open;
    this.renderPicker();
    if (!open) return;
    this.tweens.play(
      PICKER_MS,
      (t) => this.picker.setProperties({ opacity: easeOutCubic(t) } as Record<string, unknown>),
      { key: 'home-picker' },
    );
  }

  private toggleSort(): void {
    this.sort = this.sort === 'recent' ? 'title' : 'recent';
    setText(this.sortLabel, SORT_LABELS[this.sort]);
    if (this.strip) this.strip.scrollPosition.value = [0, 0];
    this.renderCards();
  }

  // ------------------------------------------------------------- rendering

  /** Greeting by time of day, and the date and time under it. */
  private renderClock(): void {
    const now = new Date();
    const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (time === this.shownMinute) return;
    this.shownMinute = time;
    const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    setText(this.clockDate, date);
    setText(this.clockTime, time);
    const hour = now.getHours();
    const part = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening';
    setText(this.greeting, `Good ${part}`);
  }

  /**
   * Saving is silent. A failed save raises a sticky toast with a retry,
   * which gives way to a short "Saved" once a later save succeeds.
   */
  private renderSaveState(): void {
    const failed = this.session.saveStatus === 'failed';
    if (failed && !this.failureToast) {
      this.failureToast = {
        kind: 'error',
        title: "Couldn't save your note",
        body: 'Your changes are kept on this device.',
        sticky: true,
        action: { label: 'Try again', run: () => void this.session.flush() },
      };
      this.toasts.show(this.failureToast);
    } else if (!failed && this.failureToast && this.session.saveStatus === 'saved') {
      this.failureToast = null;
      this.toasts.show({ kind: 'done', title: 'Saved' });
    }
  }

  /** Cards in the chosen order; unused slots are hidden. The strip scrolls. */
  private renderCards(): void {
    const summaries = this.sortedSummaries();
    const empty = summaries.length === 0;
    setVisible(this.emptyState, empty);
    setVisible(this.recentSection, !empty);
    setVisible(this.newNoteButton, !empty);
    this.renderPicker();
    this.cards.forEach((card, i) => {
      const summary = summaries[i];
      card.noteId = summary?.id ?? null;
      setVisible(card.root, summary !== undefined);
      if (!summary) return;
      setText(card.title, truncate(summary.title || 'Untitled note', CARD_TITLE_MAX_CHARS));
      setText(card.meta, `Edited ${formatRelativeTime(summary.updatedAt)}`);
      void card.thumbnail.show(summary, (id) => this.session.getNote(id));
    });
    this.renderChevrons();
  }

  private sortedSummaries(): NoteSummary[] {
    const summaries = this.session.summaries;
    if (this.sort === 'recent') return summaries;
    return [...summaries].sort((a, b) =>
      (a.title || 'Untitled note').localeCompare(b.title || 'Untitled note'),
    );
  }

  /** The paper choice shows when asked for, and always while there are no notes. */
  private renderPicker(): void {
    const empty = this.session.summaries.length === 0;
    setVisible(this.picker, this.pickerOpen || empty);
    setVisible(this.pickerTitle, !empty);
  }

  /** Prev/next dim when there is nothing more in their direction. */
  private renderChevrons(): void {
    const x = this.strip?.scrollPosition.peek()[0] ?? 0;
    const max = this.strip?.maxScrollPosition.peek()[0] ?? 0;
    const dim = (on: boolean) => ({ opacity: on ? 1 : DISABLED_OPACITY }) as Record<string, unknown>;
    this.prevChevron.setProperties(dim(x > 1));
    this.nextChevron.setProperties(dim(x < max - 1));
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

  // ----------------------------------------------------------------- modes

  private applyMode(): void {
    const full = this.homeMode.mode === 'full';
    if (full === this.shown) return;
    this.shown = full;
    if (full) this.showWindow();
    else {
      this.pickerOpen = false;
      this.renderPicker();
      this.hideWindow();
    }
  }

  // ----------------------------------------------------------- transitions

  /** Fade out and shrink a little, then hide (the dock fades in after). */
  private hideWindow(): void {
    this.tweens.play(
      HIDE_MS,
      (t) => {
        const e = easeInCubic(t);
        this.setFade(1 - e, 1 - 0.06 * e);
      },
      {
        key: 'home-window',
        done: () => {
          setVisible(this.root, false);
          setVisible(this.grab, false);
          this.setFade(1, 1);
        },
      },
    );
  }

  /**
   * Fade in while growing back to full size, with a warm glow behind the
   * window that blooms and fades: "this is it".
   */
  private showWindow(): void {
    setVisible(this.root, true);
    setVisible(this.grab, true);
    this.setFade(0, 0.96);
    this.tweens.play(
      SHOW_MS,
      (t) => {
        const e = easeOutCubic(t);
        this.setFade(e, 0.96 + 0.04 * e);
      },
      { delayMs: SHOW_DELAY_MS, key: 'home-window' },
    );
    this.tweens.play(
      GLOW_MS,
      (t) => {
        const strength = t < 0.25 ? easeOutCubic(t / 0.25) : 1 - easeInCubic((t - 0.25) / 0.75);
        this.halo.setStrength(strength);
      },
      { delayMs: SHOW_DELAY_MS, key: 'home-window-glow' },
    );
  }

  private setFade(opacity: number, scale: number): void {
    const fade = { opacity } as Record<string, unknown>;
    this.root.setProperties(fade);
    this.grab.setProperties(fade);
    this.glass.setOpacity(opacity);
    this.panel.scale.setScalar(this.baseScale * scale);
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
