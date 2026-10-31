/**
 * CompactDockSystem: the home, a row of floating glass buttons. It is the
 * only screen at launch (no big window in front of you: see home-mode.ts).
 *
 * Settings, Templates, Recent in one line, then New note at the right end,
 * with nothing between them but passthrough. Entering XR (or a headset
 * recenter) places it straight ahead at eye level, centred. A grab bar
 * under the row moves the dock (pinch and drag); on release it turns to
 * face the viewer.
 *
 * Settings, Templates and Recent each open a panel that takes the stage:
 * the buttons fade away and the panel takes their place, centred where the
 * eye already is; its close button brings the buttons back.
 * Recent is a grid of up to eight notes (ink, title, when it was edited),
 * Templates a grid of papers; picking an item closes the panel. Settings
 * holds stick mode (the dock follows the head; on by default and
 * remembered) and account connections (not built yet: Connect says so in
 * place).
 *
 * The dock fades in with a small pop and a shine across its glass, so the
 * eye finds it. On a first launch a one-line hint above the buttons points
 * at New note, which pulses gently, until the first note exists.
 *
 * Mode changes go through the shared HomeModeState; note changes go through
 * NoteSession commands.
 */

import {
  createSystem,
  Euler,
  Quaternion,
  Vector3,
  type Object3D,
  type UIKit,
  type UIKitMLAsset,
} from '@iwsdk/core';
import { PAPER_STYLES, type PaperStyle } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import { formatRelativeTime, truncate } from '../ui/format.js';
import { getHomeMode, type HomeModeState } from '../ui/home-mode.js';
import { faceViewer, makeDraggable } from '../ui/drag.js';
import { attachLiquidGlass, type LiquidGlass } from '../ui/liquid-glass.js';
import {
  addStateColors,
  NEUTRAL_STATES,
  PanelBinding,
  PRIMARY_STATES,
  setText,
  setVisible,
  type PanelElement,
} from '../ui/panel-helpers.js';
import { AllNotesGrid } from '../ui/all-notes-grid.js';
import {
  applyNoteFilters,
  DEFAULT_FILTERS,
  isFiltering,
  type NoteFilters,
  type NoteSort,
  type WhenFilter,
} from '../ui/note-filters.js';
import { NoteThumbnail, PaperPreview } from '../ui/paper-preview.js';
import { addPressMotion } from '../ui/press-motion.js';
import { THEME } from '../ui/theme.js';
import { openNoteFromHome, startNote } from '../ui/note-actions.js';
import { getToasts, type ToastService } from '../ui/toasts.js';
import { easeInCubic, easeOutBack, easeOutCubic, getTweens, pulse, type Tweens } from '../ui/tweens.js';

const DOCK_NODE = 'compact-dock';
const WINDOW_NODE = 'home-window';
/** Must match the number of `dock-recent-card-N` elements. */
const RECENT_SLOTS = 6;
/** Cards per row of the Recent grid; must match the markup. */
const RECENT_PER_ROW = 3;
/** The first-launch hint's capsule radius (UIKit pixels); matches .hint. */
const HINT_RADIUS_PX = 22;
/** New note's first-launch pulse: two gentle beats after the dock appears. */
const PULSE_MS = 1400;
const PULSE_DELAY_MS = 900;
/**
 * Launch placement: the button row about 85 cm out, straight ahead at eye
 * level, so the eye lands on it without looking up or down. The dock's
 * origin is its bottom edge, about 0.15 m below the row's centre (at the
 * scene's scale).
 */
const HOME_DISTANCE_M = 0.85;
const ROW_ABOVE_ORIGIN_M = 0.15;
/**
 * An open panel shrinks, if needed, to fit this much of the view's height
 * (degrees, centred on the row), so it reads without looking up or down.
 */
const PANEL_FIT_DEG = 50;
/** UIKit's default pixel size (metres per UIKit pixel before scaling); the dock does not change it. */
const UIKIT_PIXEL_M = 0.01;
/** Frames to wait after XR starts (or a recenter) for a settled head pose. */
const SETTLE_FRAMES = 12;
const TITLE_MAX_CHARS = 18;
const PREVIEW_PX = 224;
/** Half the round buttons' size: their corner radius in UIKit pixels. */
const BUTTON_RADIUS_PX = 28;
const GLASS_FROST_ALPHA = 0.8;
/** Must match .popover border-radius in compact-dock.uikitml. */
const POPOVER_RADIUS_PX = 32;
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

type Popover = 'recent' | 'templates' | 'settings' | null;
/** Recent's two views: the latest few, or every note in a scrolling grid. */
type RecentView = 'recent' | 'all';

const POPOVER_TITLES: Record<Exclude<Popover, null>, string> = {
  recent: 'Notes',
  templates: 'Start a new note',
  settings: 'Settings',
};
const FOCUS_IN_MS = 320;
const FOCUS_OUT_MS = 220;
/** Height of the button row's centre above the dock's bottom edge (UIKit pixels). */
const ROW_CENTRE_PX = 70;
/** The panels' close button: a faint fill that brightens when pointed at. */
const CLOSE_STATES = {
  rest: 'rgba(255, 250, 242, 0.1)',
  hover: 'rgba(255, 250, 242, 0.22)',
  pressed: 'rgba(255, 250, 242, 0.3)',
};
/** Connect buttons: a light fill that brightens when pointed at. */
const CONNECT_STATES = {
  rest: 'rgba(255, 250, 242, 0.12)',
  hover: 'rgba(255, 250, 242, 0.22)',
  pressed: 'rgba(255, 250, 242, 0.3)',
};
/** Settings rows: a faint fill at rest, brighter when pointed at. */
const SETTINGS_ROW_STATES = {
  rest: 'rgba(255, 250, 242, 0.06)',
  hover: 'rgba(255, 250, 242, 0.14)',
  pressed: 'rgba(255, 250, 242, 0.2)',
};

/** Knob travel (UIKit pixels) between off and on: track 48 - padding 6 - knob 22. */
const KNOB_TRAVEL_PX = 20;
const SWITCH_MS = 220;
/**
 * Until account connections exist, Connect answers in place: its label
 * reads "Coming soon" for a moment (feedback where you pinched, rather
 * than a pop-up over the panel you are looking at).
 */
const CONNECT_SOON_MS = 2200;
const CLEAR = 'rgba(255, 250, 242, 0)';

interface RecentCard {
  root: PanelElement;
  title: UIKit.Text;
  meta: UIKit.Text;
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
  /**
   * The same images by pop-up. Each is hidden with its own pop-up section:
   * a hidden section's images otherwise keep drawing at stale positions
   * once a panel glides (white sheets across the view).
   */
  private readonly recentImages: PanelElement[] = [];
  private readonly templateImages: PanelElement[] = [];
  /** Whether the dock is (or is becoming) visible. */
  private shown = false;
  private window: Object3D | null = null;
  private root!: PanelElement;
  private popover: Popover = null;
  private popoverPanel!: PanelElement;
  private popoverTitle!: UIKit.Text;
  private popoverCount!: UIKit.Text;
  private recentView: RecentView = 'recent';
  private recentToggle!: PanelElement;
  private readonly recentTabs = {} as Record<RecentView, { tab: PanelElement; label: UIKit.Text }>;
  private allView!: PanelElement;
  private allNoMatch!: PanelElement;
  private allNotes!: AllNotesGrid;
  private filters: NoteFilters = { ...DEFAULT_FILTERS };
  /** Each filter option's chip, painted clay while it is chosen. */
  private readonly filterChips: Array<{ chip: PanelElement; label: UIKit.Text; chosen: () => boolean }> = [];
  private popoverRecent!: PanelElement;
  private popoverTemplates!: PanelElement;
  private recentEmpty!: PanelElement;
  /** The grid's two rows of four cards. */
  private readonly recentRows: PanelElement[] = [];
  private popoverSettings!: PanelElement;
  private row!: PanelElement;
  private grabArea!: PanelElement;
  /** Glass behind the round buttons (faded while a panel has the stage). */
  private readonly rowSlabs: LiquidGlass[] = [];
  /** 0: the dock as usual; 1: a panel has the stage. */
  private focus = 0;
  /** The dock's own fade (show/hide), which the focus fade multiplies. */
  private dockOpacity = 1;
  private stickSwitch!: PanelElement;
  private stickKnob!: PanelElement;
  /** 0 off .. 1 on, the switch's drawn position. */
  private stickProgress = 1;
  private hint!: PanelElement;
  private newNoteButton!: PanelElement;
  private recentCards: RecentCard[] = [];
  private readonly scratch = new Vector3();
  private readonly headPosition = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  /** Counts down to placing the dock in front of the head (0 = idle). */
  private placeInFrames = 0;
  private wasPresenting = false;
  /** The reference space whose 'reset' (a headset recenter) we listen to. */
  private recenterSpace: XRReferenceSpace | null = null;
  private readonly onRecenter = () => this.homeMode.requestRecenter();

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
      ui.onClick('dock-recent', () => this.openPanel('recent')),
      ui.onClick('dock-templates', () => this.openPanel('templates')),
      ui.onClick('dock-settings', () => this.openPanel('settings')),
    ];
    for (const el of round) {
      this.rowSlabs.push(glass(el, BUTTON_RADIUS_PX));
      addStateColors(el, NEUTRAL_STATES, this.cleanupFuncs);
      addPressMotion(el, this.tweens, this.cleanupFuncs, { hover: 1.08, pressed: 0.92 });
    }
    const newNote = ui.onClick('dock-new', () => this.newNote('blank'));
    this.newNoteButton = newNote;
    addStateColors(newNote, PRIMARY_STATES, this.cleanupFuncs);
    addPressMotion(newNote, this.tweens, this.cleanupFuncs);

    this.popoverPanel = ui.element('dock-popover');
    // Re-centre an open panel when its size changes (switching Recent's views).
    this.cleanupFuncs.push(
      panelSize(this.popoverPanel).subscribe(() => {
        if (this.focus > 0) this.paintFocus();
      }),
    );
    this.row = ui.element('dock-row');
    this.grabArea = ui.element('dock-grab');
    const closeButton = ui.onClick('dock-popover-close', () => this.closePanel());
    addStateColors(closeButton, CLOSE_STATES, this.cleanupFuncs);
    addPressMotion(closeButton, this.tweens, this.cleanupFuncs, { hover: 1.08, pressed: 0.92 });
    glass(this.popoverPanel, POPOVER_RADIUS_PX);
    this.popoverTitle = ui.text('dock-popover-title');
    this.popoverCount = ui.text('dock-popover-count');
    this.popoverRecent = ui.element('dock-popover-recent');
    this.popoverTemplates = ui.element('dock-popover-templates');
    this.recentEmpty = ui.element('dock-recent-empty');
    this.recentRows.push(ui.element('dock-recent-row-0'), ui.element('dock-recent-row-1'));
    this.bindRecentToggle(ui);
    this.popoverSettings = ui.element('dock-popover-settings');
    this.bindSettings(ui);
    this.hint = ui.element('dock-hint');
    glass(this.hint, HINT_RADIUS_PX);

    for (let i = 0; i < RECENT_SLOTS; i++) {
      const thumbnail = new NoteThumbnail(PREVIEW_PX);
      const image = ui.element(`dock-recent-thumb-${i}`);
      image.setProperties({ src: thumbnail.texture });
      this.images.push(image);
      this.recentImages.push(image);
      const card: RecentCard = {
        root: ui.onClick(`dock-recent-card-${i}`, () => {
          if (!card.noteId) return;
          void openNoteFromHome(this.session, this.toasts, card.noteId);
          this.closePanel();
        }),
        title: ui.text(`dock-recent-title-${i}`),
        meta: ui.text(`dock-recent-meta-${i}`),
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
      this.templateImages.push(image);
      this.cleanupFuncs.push(() => preview.dispose());
    }

    makeDraggable(ui.element('dock-grab'), ui.element('dock-grab-bar'), panel, this.world, this.cleanupFuncs, {
      onStart: () => this.homeMode.setDragging(true),
      onEnd: () => this.homeMode.setDragging(false),
    });

    this.cleanupFuncs.push(
      this.session.subscribe(() => this.renderRecent()),
      this.homeMode.subscribe((mode) => this.applyMode(mode)),
    );
    this.cleanupFuncs.push(this.homeMode.subscribeRecenter(() => (this.placeInFrames = SETTLE_FRAMES)));
    this.cleanupFuncs.push(() => this.recenterSpace?.removeEventListener('reset', this.onRecenter));
    this.renderRecent();
    setVisible(this.root, false);
    // Outside XR the dock appears where the scene put it; entering XR
    // moves it in front of the viewer (update).
    this.applyMode(this.homeMode.mode);
  }

  update(): void {
    // Entering XR places the home in front of the viewer once the head pose
    // has settled, and so does a headset recenter.
    const presenting = this.world.renderer.xr.isPresenting;
    if (presenting && !this.wasPresenting) {
      this.placeInFrames = SETTLE_FRAMES;
      this.listenForRecenter();
    }
    this.wasPresenting = presenting;
    if (this.placeInFrames > 0 && --this.placeInFrames === 0) {
      this.placeInFrontOfHead();
      // Appear (again) in the new place, with the fade and shine.
      if (this.homeMode.mode === 'compact') this.showDock();
    }
  }

  /** The system recenter (holding the Meta button) resets the reference space. */
  private listenForRecenter(): void {
    // One listener at a time: drop the previous session's.
    this.recenterSpace?.removeEventListener('reset', this.onRecenter);
    this.recenterSpace = this.world.renderer.xr.getReferenceSpace();
    this.recenterSpace?.addEventListener('reset', this.onRecenter);
  }

  /** Bottom half of the view, centred, facing the eyes (yaw only from the head). */
  private placeInFrontOfHead(): void {
    const head = this.player.head;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    const yaw = this.euler.setFromQuaternion(this.headQuaternion, 'YXZ').y;
    this.dock.position.set(
      this.headPosition.x - Math.sin(yaw) * HOME_DISTANCE_M,
      this.headPosition.y - ROW_ABOVE_ORIGIN_M,
      this.headPosition.z - Math.cos(yaw) * HOME_DISTANCE_M,
    );
    faceViewer(this.dock, this.world);
    this.homeMode.notifyMoved();
  }

  // -------------------------------------------------------------- commands

  private newNote(paper: PaperStyle): void {
    startNote(this.session, this.toasts, paper);
    this.closePanel();
  }

  // -------------------------------------------------------------- settings

  /** Settings: the stick mode switch (remembered) and account connections. */
  private bindSettings(ui: PanelBinding): void {
    const stickRow = ui.onClick('set-stick', () => this.homeMode.setPinned(!this.homeMode.pinned));
    this.stickSwitch = ui.element('set-stick-switch');
    this.stickKnob = ui.element('set-stick-knob');
    addPressMotion(stickRow, this.tweens, this.cleanupFuncs, { hover: 1.02, pressed: 0.98 });
    addStateColors(stickRow, SETTINGS_ROW_STATES, this.cleanupFuncs);
    for (const service of ['drive', 'microsoft']) {
      const label = ui.text(`set-connect-${service}-label`);
      const button = ui.onClick(`set-connect-${service}`, () => {
        setText(label, 'Coming soon');
        this.tweens.play(CONNECT_SOON_MS, () => {}, {
          key: `connect-${service}`,
          done: () => setText(label, 'Connect'),
        });
      });
      addStateColors(button, CONNECT_STATES, this.cleanupFuncs);
      addPressMotion(button, this.tweens, this.cleanupFuncs, { hover: 1.05, pressed: 0.95 });
    }
    this.stickProgress = this.homeMode.pinned ? 1 : 0;
    this.paintStick();
    this.cleanupFuncs.push(this.homeMode.subscribePlacement(() => this.animateStick()));
  }

  /** Slide the knob and change the track colour when stick mode changes. */
  private animateStick(): void {
    const target = this.homeMode.pinned ? 1 : 0;
    if (target === this.stickProgress) return;
    const from = this.stickProgress;
    this.tweens.play(
      SWITCH_MS,
      (t) => {
        this.stickProgress = from + (target - from) * easeOutCubic(t);
        this.paintStick();
      },
      { key: 'dock-stick-switch' },
    );
  }

  private paintStick(): void {
    const p = this.stickProgress;
    this.stickKnob.setProperties({ transformTranslateX: KNOB_TRAVEL_PX * p } as Record<string, unknown>);
    this.stickSwitch.setProperties({ backgroundColor: p > 0.5 ? THEME.clay : 'rgba(255, 250, 242, 0.22)' });
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

  /**
   * A panel takes the stage: the buttons fade away and the panel glides
   * down into their place, centred where the eye already is.
   */
  private openPanel(which: Exclude<Popover, null>): void {
    this.popover = which;
    // One thing at a time: an open panel replaces any toast.
    this.toasts.dismiss();
    // Edit times ("5 min ago") move on while the dock waits.
    // Recent opens on the latest notes, the quick glance.
    if (which === 'recent') {
      this.recentView = 'recent';
      this.filters = { ...DEFAULT_FILTERS };
      this.renderRecent();
    }
    this.renderPopover();
    this.animateFocus(true);
  }

  /** Close the open panel (its close button, or after a pick). */
  private closePanel(): void {
    if (this.popover === null) return;
    this.animateFocus(false);
  }

  private animateFocus(open: boolean): void {
    const from = this.focus;
    const to = open ? 1 : 0;
    this.tweens.play(
      open ? FOCUS_IN_MS : FOCUS_OUT_MS,
      (t) => {
        this.focus = from + (to - from) * (open ? easeOutCubic(t) : easeInCubic(t));
        this.paintFocus();
      },
      {
        key: 'dock-focus',
        done: () => {
          if (open) return;
          this.popover = null;
          this.renderPopover();
          this.paintFocus();
        },
      },
    );
  }

  /** Drop the panel focus state at once (no transition). */
  private resetPanelFocus(): void {
    this.tweens.cancel('dock-focus');
    this.focus = 0;
    this.paintFocus();
  }

  /** The buttons' fade and the panel's glide for the current focus. */
  private paintFocus(): void {
    const f = this.focus;
    const buttons = this.dockOpacity * (1 - f);
    const hidden = f > 0.01;
    for (const el of [this.row, this.grabArea]) {
      el.setProperties({ opacity: buttons, pointerEvents: hidden ? 'none' : 'auto' } as Record<string, unknown>);
    }
    for (const slab of this.rowSlabs) slab.setOpacity(buttons);
    // Glide the panel down so its centre lands on the row's centre, shrunk
    // if needed to fit the view's height (its centre stays put).
    const height = panelSize(this.popoverPanel).peek()?.[1] ?? 0;
    const glide = Math.max(0, height / 2 - ROW_CENTRE_PX) * f;
    const scale = 1 + (this.fitScale(height) - 1) * f;
    this.popoverPanel.setProperties({
      // UIKit applies the translate in the panel's scaled space.
      transformTranslateY: glide / scale,
      transformScaleX: scale,
      transformScaleY: scale,
    } as Record<string, unknown>);
  }

  /** The scale (at most 1) that fits a panel this tall into PANEL_FIT_DEG at its distance. */
  private fitScale(heightPx: number): number {
    if (heightPx <= 0) return 1;
    this.player.head.getWorldPosition(this.headPosition);
    const distance = this.headPosition.distanceTo(this.dock.position);
    const fitHeightM = 2 * distance * Math.tan((PANEL_FIT_DEG * Math.PI) / 360);
    const heightM = heightPx * UIKIT_PIXEL_M * this.baseScale;
    return Math.min(1, fitHeightM / heightM);
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
    // Re-showing (after a recenter or re-entering XR) starts from the plain
    // dock: an open panel would otherwise leave its buttons faded out.
    this.resetPanelFocus();
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
    this.dockOpacity = opacity;
    const fade = { opacity } as Record<string, unknown>;
    this.root.setProperties(fade);
    // UIKit images do not inherit opacity; fade them directly.
    for (const image of this.images) image.setProperties(fade);
    this.allNotes.setOpacity(opacity);
    for (const slab of this.glassSlabs) slab.setOpacity(opacity);
    this.dock.scale.setScalar(this.baseScale * scale);
    if (this.focus > 0) this.paintFocus();
  }

  private renderPopover(): void {
    setVisible(this.popoverPanel, this.popover !== null);
    setVisible(this.popoverTemplates, this.popover === 'templates');
    setVisible(this.popoverSettings, this.popover === 'settings');
    for (const image of this.templateImages) setVisible(image, this.popover === 'templates');
    setText(this.popoverTitle, POPOVER_TITLES[this.popover ?? 'recent']);
    this.renderRecentSections();
    this.renderHint();
  }

  private renderRecent(): void {
    const summaries = this.session.summaries;
    this.renderHint();
    this.recentCards.forEach((card, i) => {
      const summary = summaries[i];
      card.noteId = summary?.id ?? null;
      setVisible(card.root, summary !== undefined);
      if (!summary) return;
      setText(card.title, truncate(summary.title || 'Untitled note', TITLE_MAX_CHARS));
      setText(card.meta, `Edited ${formatRelativeTime(summary.updatedAt)}`);
      void card.thumbnail.show(summary, (id) => this.session.getNote(id));
    });
    this.renderRecentSections();
  }

  /**
   * Which of Recent's parts show: the empty state, or the toggle and one of
   * its two views. With no notes only the empty state shows (an empty grid
   * adds its gap). Images follow their own card and view: an image whose
   * card or section is hidden otherwise draws at a stale place once the
   * panel glides.
   */
  private renderRecentSections(): void {
    const summaries = this.session.summaries;
    const total = summaries.length;
    const open = this.popover === 'recent';
    const showLatest = open && total > 0 && this.recentView === 'recent';
    const showAll = open && total > 0 && this.recentView === 'all';
    setVisible(this.recentEmpty, total === 0);
    setVisible(this.recentToggle, open && total > 0);
    setVisible(this.popoverRecent, showLatest);
    setVisible(this.allView, showAll);
    this.recentRows.forEach((row, r) => setVisible(row, total > r * RECENT_PER_ROW));
    this.recentCards.forEach((card, i) => setVisible(this.recentImages[i], showLatest && card.noteId !== null));
    const matches = applyNoteFilters(summaries, this.filters);
    this.allNotes.render(matches, showAll);
    setVisible(this.allNoMatch, showAll && matches.length === 0);
    // Only Recent counts its items.
    setVisible(this.popoverCount, open && total > 0);
    if (total > 0) setText(this.popoverCount, this.countLabel(total, matches.length));
    for (const view of ['recent', 'all'] as const) {
      paintChoice(this.recentTabs[view].tab, this.recentTabs[view].label, view === this.recentView);
    }
    for (const { chip, label, chosen } of this.filterChips) paintChoice(chip, label, chosen());
  }

  private countLabel(total: number, matching: number): string {
    if (this.recentView === 'recent') return noteCountLabel(total);
    return isFiltering(this.filters) ? `${matching} of ${total}` : notesLabel(total);
  }

  /** Recents / Show all: switch Recent between the latest notes and every note. */
  private bindRecentToggle(ui: PanelBinding): void {
    this.recentToggle = ui.element('recent-toggle');
    this.allView = ui.element('dock-all-view');
    this.allNoMatch = ui.element('all-no-match');
    for (const view of ['recent', 'all'] as const) {
      const tab = ui.onClick(`recent-tab-${view}`, () => {
        this.recentView = view;
        this.renderRecentSections();
      });
      addPressMotion(tab, this.tweens, this.cleanupFuncs, { hover: 1.05, pressed: 0.95 });
      this.recentTabs[view] = { tab, label: ui.text(`recent-tab-${view}-label`) };
    }
    this.bindFilters(ui);
    this.allNotes = new AllNotesGrid(ui.element('dock-popover-all'), {
      perRow: RECENT_PER_ROW,
      titleMaxChars: TITLE_MAX_CHARS,
      thumbnailPx: PREVIEW_PX,
      tweens: this.tweens,
      cleanupFuncs: this.cleanupFuncs,
      loadNote: (id) => this.session.getNote(id),
      onOpen: (id) => {
        void openNoteFromHome(this.session, this.toasts, id);
        this.closePanel();
      },
    });
  }

  /** Show all's filters: when a note was edited, and the order. */
  private bindFilters(ui: PanelBinding): void {
    const option = <K extends keyof NoteFilters>(key: K, value: NoteFilters[K], id: string) => {
      const chip = ui.onClick(id, () => {
        this.filters = { ...this.filters, [key]: value };
        this.renderRecentSections();
      });
      addPressMotion(chip, this.tweens, this.cleanupFuncs, { hover: 1.05, pressed: 0.95 });
      this.filterChips.push({ chip, label: ui.text(`${id}-label`), chosen: () => this.filters[key] === value });
    };
    for (const when of ['all', 'today', 'week', 'older'] as WhenFilter[]) option('when', when, `when-${when}`);
    for (const sort of ['recent', 'title'] as NoteSort[]) option('sort', sort, `sort-${sort}`);
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

/** Recent's header count: "3 notes", or "8 of 12" once there are more than fit. */
function noteCountLabel(total: number): string {
  if (total > RECENT_SLOTS) return `${RECENT_SLOTS} of ${total}`;
  return notesLabel(total);
}

/** "1 note", "12 notes". */
function notesLabel(total: number): string {
  return total === 1 ? '1 note' : `${total} notes`;
}

/** A chosen option (a tab or filter chip) wears the theme's clay. */
function paintChoice(chip: PanelElement, label: UIKit.Text, chosen: boolean): void {
  chip.setProperties({ backgroundColor: chosen ? THEME.clay : CLEAR });
  label.setProperties({ color: chosen ? '#ffffff' : THEME.inkSoft });
}

/** A UIKit element's laid-out size signal (UIKit pixels), missing from its public type. */
function panelSize(element: PanelElement): {
  peek(): [number, number] | undefined;
  subscribe(listener: () => void): () => void;
} {
  return (element as unknown as { size: ReturnType<typeof panelSize> }).size;
}
