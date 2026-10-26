/**
 * CompactDockSystem: the home, a row of floating glass buttons. It is the
 * only screen at launch (no big window in front of you: see home-mode.ts).
 *
 * Recent | New note | Templates, Settings, with nothing between them but
 * passthrough. Recent and Templates open a small pop-up just above the
 * row; Recent scrolls sideways through up to eight notes. Picking an item
 * closes it. A grab bar under the row moves the dock (pinch and drag); on
 * release it turns to face the viewer, and the pin beside it turns stick
 * mode on and off. The dock fades in with a small pop and a shine across
 * its glass, so the eye finds it. On a first launch a one-line hint above
 * the buttons points at New note, which pulses gently, until the first
 * note exists.
 *
 * Mode changes go through the shared HomeModeState; note changes go through
 * NoteSession commands.
 */

import { createSystem, Vector3, type Object3D, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { PAPER_STYLES, type PaperStyle } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import { noteTitleFor, truncate } from '../ui/format.js';
import { getHomeMode, type HomeModeState } from '../ui/home-mode.js';
import { makeDraggable } from '../ui/drag.js';
import { attachLiquidGlass, type LiquidGlass } from '../ui/liquid-glass.js';
import {
  addStateColors,
  addToggleStateColors,
  NEUTRAL_STATES,
  PanelBinding,
  PRIMARY_STATES,
  setText,
  setVisible,
  type PanelElement,
} from '../ui/panel-helpers.js';
import { NoteThumbnail, PaperPreview } from '../ui/paper-preview.js';
import { addPressMotion } from '../ui/press-motion.js';
import { getToasts, newNoteToast, openedNoteToast, SETTINGS_TOAST, type ToastService } from '../ui/toasts.js';
import { easeInCubic, easeOutBack, easeOutCubic, getTweens, pulse, type Tweens } from '../ui/tweens.js';

const DOCK_NODE = 'compact-dock';
const WINDOW_NODE = 'home-window';
/** Must match the number of `dock-recent-card-N` elements. */
const RECENT_SLOTS = 8;
/** The first-launch hint's capsule radius (UIKit pixels); matches .hint. */
const HINT_RADIUS_PX = 22;
/** New note's first-launch pulse: two gentle beats after the dock appears. */
const PULSE_MS = 1400;
const PULSE_DELAY_MS = 900;
const TITLE_MAX_CHARS = 12;
const PREVIEW_PX = 224;
/** Half the round buttons' size: their corner radius in UIKit pixels. */
const BUTTON_RADIUS_PX = 28;
const GLASS_FROST_ALPHA = 0.8;
/** Must match .popover border-radius in compact-dock.uikitml. */
const POPOVER_RADIUS_PX = 28;
/**
 * Where the full window sits relative to the dock, in the dock's own frame
 * (metres): a little higher and further away, so the dock appears about
 * where the eyes were on the window (its lower middle), not below it.
 */
const WINDOW_OFFSET = new Vector3(0, 0.1, -0.04);
/** Transition timings (ms): the dock appears after the window has faded. */
const HIDE_MS = 180;
const SHOW_MS = 360;
const SHOW_DELAY_MS = 160;
const SHINE_MS = 900;

type Popover = 'recent' | 'templates' | null;

interface RecentCard {
  root: PanelElement;
  title: UIKit.Text;
  thumbnail: NoteThumbnail;
  noteId: string | null;
}

export class CompactDockSystem extends createSystem({}) {
  private session!: NoteSession;
  private toasts!: ToastService;
  private homeMode!: HomeModeState;
  private tweens!: Tweens;
  private dock!: Object3D;
  private baseScale = 1;
  private glassSlabs: LiquidGlass[] = [];
  /** Pop-up thumbnails and paper previews (faded with the dock). */
  private readonly images: PanelElement[] = [];
  /** Whether the dock is (or is becoming) visible. */
  private shown = false;
  private window: Object3D | null = null;
  private root!: PanelElement;
  private popover: Popover = null;
  private popoverPanel!: PanelElement;
  private popoverTitle!: UIKit.Text;
  private popoverRecent!: PanelElement;
  private popoverTemplates!: PanelElement;
  private recentEmpty!: PanelElement;
  private hint!: PanelElement;
  private newNoteButton!: PanelElement;
  private recentCards: RecentCard[] = [];
  private readonly scratch = new Vector3();

  init(): void {
    this.session = getNoteSession(this.world);
    this.toasts = getToasts(this.world);
    this.homeMode = getHomeMode(this.world);
    const panel = this.world.getSceneObject<UIKitMLAsset>(DOCK_NODE);
    if (!panel) {
      console.warn('[CompactDockSystem] Compact dock missing from the scene.');
      return;
    }
    this.tweens = getTweens(this.world);
    this.dock = panel;
    this.baseScale = panel.scale.x;
    this.window = this.world.getSceneObject(WINDOW_NODE) ?? null;
    const ui = new PanelBinding(panel, this.cleanupFuncs);
    this.root = ui.element('dock-root');
    // Anchor at the bottom so the pop-up grows upwards and the row stays put.
    this.root.setProperties({ anchorY: 'bottom' } as Record<string, unknown>);

    // Each round button and the pop-up get their own glass, with edge light.
    const glass = (el: PanelElement, radiusPx: number) => {
      const slab = attachLiquidGlass(el, this.cleanupFuncs, {
        radiusPx,
        bevelPx: 10,
        frostAlpha: GLASS_FROST_ALPHA,
        host: panel,
      });
      this.glassSlabs.push(slab);
      return slab;
    };

    const round = [
      ui.onClick('dock-recent', () => this.togglePopover('recent')),
      ui.onClick('dock-templates', () => this.togglePopover('templates')),
      ui.onClick('dock-settings', () => {
        // The toast shows where the pop-up would be; one thing at a time.
        this.closePopover();
        this.toasts.show(SETTINGS_TOAST);
      }),
    ];
    for (const el of round) {
      glass(el, BUTTON_RADIUS_PX);
      addStateColors(el, NEUTRAL_STATES, this.cleanupFuncs);
      addPressMotion(el, this.tweens, this.cleanupFuncs, { hover: 1.08, pressed: 0.92 });
    }
    const newNote = ui.onClick('dock-new', () => this.newNote('blank'));
    this.newNoteButton = newNote;
    addStateColors(newNote, PRIMARY_STATES, this.cleanupFuncs);
    addPressMotion(newNote, this.tweens, this.cleanupFuncs);

    this.popoverPanel = ui.element('dock-popover');
    glass(this.popoverPanel, POPOVER_RADIUS_PX);
    this.popoverTitle = ui.text('dock-popover-title');
    this.popoverRecent = ui.element('dock-popover-recent');
    this.popoverTemplates = ui.element('dock-popover-templates');
    this.recentEmpty = ui.element('dock-recent-empty');
    this.hint = ui.element('dock-hint');
    glass(this.hint, HINT_RADIUS_PX);

    for (let i = 0; i < RECENT_SLOTS; i++) {
      const thumbnail = new NoteThumbnail(PREVIEW_PX);
      const image = ui.element(`dock-recent-thumb-${i}`);
      image.setProperties({ src: thumbnail.texture });
      this.images.push(image);
      const card: RecentCard = {
        root: ui.onClick(`dock-recent-card-${i}`, () => {
          if (!card.noteId) return;
          void this.session.openNote(card.noteId);
          const title = this.session.summaries.find((s) => s.id === card.noteId)?.title || 'Untitled note';
          this.toasts.show(openedNoteToast(truncate(title, 24)));
          this.closePopover();
        }),
        title: ui.text(`dock-recent-title-${i}`),
        thumbnail,
        noteId: null,
      };
      addStateColors(card.root, NEUTRAL_STATES, this.cleanupFuncs);
      addPressMotion(card.root, this.tweens, this.cleanupFuncs);
      this.recentCards.push(card);
      this.cleanupFuncs.push(() => thumbnail.dispose());
    }

    for (const paper of PAPER_STYLES) {
      const card = ui.onClick(`dock-template-${paper}`, () => this.newNote(paper));
      addStateColors(card, NEUTRAL_STATES, this.cleanupFuncs);
      addPressMotion(card, this.tweens, this.cleanupFuncs);
      if (paper === 'blank') continue;
      const preview = new PaperPreview(PREVIEW_PX);
      preview.draw(paper);
      const image = ui.element(`dock-template-img-${paper}`);
      image.setProperties({ src: preview.texture });
      this.images.push(image);
      this.cleanupFuncs.push(() => preview.dispose());
    }

    makeDraggable(ui.element('dock-grab'), ui.element('dock-grab-bar'), panel, this.world, this.cleanupFuncs, {
      onStart: () => this.homeMode.setDragging(true),
      onEnd: () => this.homeMode.setDragging(false),
    });
    const pin = ui.onClick('dock-pin', () => this.homeMode.setPinned(!this.homeMode.pinned));
    glass(pin, 20);
    const paintPin = addToggleStateColors(pin, () => this.homeMode.pinned, this.cleanupFuncs);
    this.cleanupFuncs.push(this.homeMode.subscribePlacement(paintPin));

    this.cleanupFuncs.push(
      this.session.subscribe(() => this.renderRecent()),
      this.homeMode.subscribe((mode) => this.applyMode(mode)),
    );
    this.renderRecent();
    setVisible(this.root, false);
    this.applyMode(this.homeMode.mode);
  }

  // -------------------------------------------------------------- commands

  private newNote(paper: PaperStyle): void {
    void this.session.createNote(noteTitleFor(), paper);
    this.toasts.show(newNoteToast(paper));
    this.closePopover();
  }

  private togglePopover(which: Exclude<Popover, null>): void {
    this.popover = this.popover === which ? null : which;
    // A pop-up opens where toasts show: one thing at a time.
    if (this.popover) this.toasts.dismiss();
    this.renderPopover();
  }

  /** First launch: the hint shows (unless a pop-up is open) until a note exists. */
  private renderHint(): void {
    setVisible(this.hint, this.session.summaries.length === 0 && this.popover === null);
  }

  /** Two gentle beats of New note, so a first-time eye lands on it. */
  private pulseNewNote(): void {
    this.tweens.play(
      PULSE_MS,
      (t) => {
        const beat = Math.sin(Math.PI * ((t * 2) % 1)) * 0.07;
        const scale = 1 + beat;
        this.newNoteButton.setProperties({ transformScaleX: scale, transformScaleY: scale } as Record<string, unknown>);
      },
      { delayMs: PULSE_DELAY_MS, key: 'dock-new-pulse' },
    );
  }

  private closePopover(): void {
    this.popover = null;
    this.renderPopover();
  }

  // ------------------------------------------------------------- rendering

  private applyMode(mode: 'full' | 'compact'): void {
    const compact = mode === 'compact';
    if (compact === this.shown) return;
    this.shown = compact;
    if (compact) {
      this.placeRelativeToWindow();
      this.showDock();
    } else {
      this.placeWindowAtDock();
      this.popover = null;
      this.renderPopover();
      this.hideDock();
    }
  }

  // ----------------------------------------------------------- transitions

  /** Fade in with a small pop past full size, then a shine on the glass. */
  private showDock(): void {
    this.popover = null;
    this.renderPopover();
    setVisible(this.root, true);
    this.setFade(0, 0.85);
    if (this.session.summaries.length === 0) this.pulseNewNote();
    this.tweens.play(
      SHOW_MS,
      (t) => this.setFade(easeOutCubic(t), 0.85 + 0.15 * easeOutBack(t)),
      { delayMs: SHOW_DELAY_MS, key: 'compact-dock' },
    );
    this.tweens.play(
      SHINE_MS,
      (t) => {
        const glow = pulse(t) * 0.9;
        for (const slab of this.glassSlabs) slab.setGlow(glow);
      },
      { delayMs: SHOW_DELAY_MS + SHOW_MS * 0.5, key: 'compact-dock-shine' },
    );
  }

  private hideDock(): void {
    this.tweens.play(
      HIDE_MS,
      (t) => {
        const e = easeInCubic(t);
        this.setFade(1 - e, 1 - 0.08 * e);
      },
      {
        key: 'compact-dock',
        done: () => {
          setVisible(this.root, false);
          this.setFade(1, 1);
        },
      },
    );
  }

  private setFade(opacity: number, scale: number): void {
    const fade = { opacity } as Record<string, unknown>;
    this.root.setProperties(fade);
    // UIKit images do not inherit opacity; fade them directly.
    for (const image of this.images) image.setProperties(fade);
    for (const slab of this.glassSlabs) slab.setOpacity(opacity);
    this.dock.scale.setScalar(this.baseScale * scale);
  }

  private renderPopover(): void {
    setVisible(this.popoverPanel, this.popover !== null);
    setVisible(this.popoverRecent, this.popover === 'recent');
    setVisible(this.popoverTemplates, this.popover === 'templates');
    setText(this.popoverTitle, this.popover === 'templates' ? 'Start a new note' : 'Recent notes');
    this.renderHint();
  }

  private renderRecent(): void {
    const summaries = this.session.summaries;
    setVisible(this.recentEmpty, summaries.length === 0);
    this.renderHint();
    this.recentCards.forEach((card, i) => {
      const summary = summaries[i];
      card.noteId = summary?.id ?? null;
      setVisible(card.root, summary !== undefined);
      if (!summary) return;
      setText(card.title, truncate(summary.title || 'Untitled note', TITLE_MAX_CHARS));
      void card.thumbnail.show(summary, (id) => this.session.getNote(id));
    });
  }

  // ------------------------------------------------------------- placement

  /** Put the dock where it sits relative to the window (keeps them in step). */
  private placeRelativeToWindow(): void {
    if (!this.window) return;
    this.dock.quaternion.copy(this.window.quaternion);
    this.scratch.copy(WINDOW_OFFSET).applyQuaternion(this.window.quaternion);
    this.dock.position.copy(this.window.position).sub(this.scratch);
  }

  /** Open the full window where the dock is, facing the same way. */
  private placeWindowAtDock(): void {
    if (!this.window) return;
    this.window.quaternion.copy(this.dock.quaternion);
    this.scratch.copy(WINDOW_OFFSET).applyQuaternion(this.dock.quaternion);
    this.window.position.copy(this.dock.position).add(this.scratch);
  }
}
