/**
 * CompactDockSystem: the home, a row of floating glass buttons. It is the
 * only screen at launch (no big window in front of you: see home-mode.ts).
 *
 * Recent | New note | Templates, Settings, with nothing between them but
 * passthrough. Recent and Templates open a small pop-up just above the
 * row; Recent scrolls sideways through up to eight notes. Picking an item
 * closes it. A grab bar under the row moves the dock (pinch and drag); on
 * release it turns to face the viewer. Settings opens a panel with stick
 * mode (the dock follows the head; on by default and remembered) and
 * account connections (not built yet: Connect says so in place). While it
 * is open the buttons fade away and the panel takes their place, centred
 * where the eye already is; a pinch anywhere outside it brings the buttons
 * back. The dock fades in with a small pop and a shine across
 * its glass, so the eye finds it. On a first launch a one-line hint above
 * the buttons points at New note, which pulses gently, until the first
 * note exists.
 *
 * Mode changes go through the shared HomeModeState; note changes go through
 * NoteSession commands.
 */

import {
  createSystem,
  Euler,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RayInteractable,
  Vector3,
  type Entity,
  type Object3D,
  type UIKit,
  type UIKitMLAsset,
} from '@iwsdk/core';
import { PAPER_STYLES, type PaperStyle } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import { noteTitleFor, truncate } from '../ui/format.js';
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
import { NoteThumbnail, PaperPreview } from '../ui/paper-preview.js';
import { addPressMotion } from '../ui/press-motion.js';
import { THEME } from '../ui/theme.js';
import { getToasts, newNoteToast, openedNoteToast, type ToastService } from '../ui/toasts.js';
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
/**
 * Launch placement: the button row about 85 cm out and 20 degrees below the
 * gaze, in the bottom half of the view, centred. The dock's origin is its
 * bottom edge, about 0.15 m below the row's centre (at the scene's scale).
 */
const HOME_DISTANCE_M = 0.85;
const HOME_BELOW_GAZE_DEG = 20;
const ROW_ABOVE_ORIGIN_M = 0.15;
/** Frames to wait after XR starts (or a recenter) for a settled head pose. */
const SETTLE_FRAMES = 12;
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

type Popover = 'recent' | 'templates' | 'settings' | null;

const POPOVER_TITLES: Record<Exclude<Popover, null>, string> = {
  recent: 'Recent notes',
  templates: 'Start a new note',
  settings: 'Settings',
};
const FOCUS_IN_MS = 320;
const FOCUS_OUT_MS = 220;
/** Height of the button row's centre above the dock's bottom edge (UIKit pixels). */
const ROW_CENTRE_PX = 70;
/**
 * The outside-pinch catcher: an invisible sheet (metres) a little behind the
 * dock. A scene object rather than a UI element, because UIKit only
 * hit-tests children within their parent's bounds.
 */
const CATCHER_SIZE_M: [number, number] = [6, 4];
const CATCHER_BEHIND_M = 0.04;
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
  /**
   * The same images by pop-up. Each is hidden with its own pop-up section:
   * a hidden section's images otherwise keep drawing at stale positions
   * once the Settings panel glides (white sheets across the view).
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
  private popoverRecent!: PanelElement;
  private popoverTemplates!: PanelElement;
  private recentEmpty!: PanelElement;
  private popoverSettings!: PanelElement;
  private row!: PanelElement;
  private grabArea!: PanelElement;
  /** Invisible sheet behind the Settings panel: a pinch on it closes Settings. */
  private catcher!: Mesh;
  private catcherEntity: Entity | null = null;
  /** Requested catcher state, applied in update (outside pointer dispatch). */
  private catcherWanted: boolean | null = null;
  /** Glass behind the round buttons (faded while Settings has the stage). */
  private readonly rowSlabs: LiquidGlass[] = [];
  /** 0: the dock as usual; 1: Settings has the stage. */
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
      ui.onClick('dock-settings', () => this.setSettingsOpen(true)),
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
    this.row = ui.element('dock-row');
    this.grabArea = ui.element('dock-grab');
    this.createDismissCatcher();
    glass(this.popoverPanel, POPOVER_RADIUS_PX);
    this.popoverTitle = ui.text('dock-popover-title');
    this.popoverRecent = ui.element('dock-popover-recent');
    this.popoverTemplates = ui.element('dock-popover-templates');
    this.recentEmpty = ui.element('dock-recent-empty');
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
    this.renderRecent();
    setVisible(this.root, false);
    // Outside XR the dock appears where the scene put it; entering XR
    // moves it in front of the viewer (update).
    this.applyMode(this.homeMode.mode);
  }

  update(): void {
    if (this.catcherWanted !== null) {
      this.setCatcherActive(this.catcherWanted);
      this.catcherWanted = null;
    }
    // Keep the catcher behind the dock (stick mode can move it).
    if (this.catcher?.visible) this.placeCatcher();
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
    const space = this.world.renderer.xr.getReferenceSpace();
    if (!space) return;
    const onReset = () => this.homeMode.requestRecenter();
    space.addEventListener('reset', onReset);
    this.cleanupFuncs.push(() => space.removeEventListener('reset', onReset));
  }

  /** Bottom half of the view, centred, facing the eyes (yaw only from the head). */
  private placeInFrontOfHead(): void {
    const head = this.player.head;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    const yaw = this.euler.setFromQuaternion(this.headQuaternion, 'YXZ').y;
    const drop = HOME_DISTANCE_M * Math.tan((HOME_BELOW_GAZE_DEG * Math.PI) / 180);
    this.dock.position.set(
      this.headPosition.x - Math.sin(yaw) * HOME_DISTANCE_M,
      this.headPosition.y - drop - ROW_ABOVE_ORIGIN_M,
      this.headPosition.z - Math.cos(yaw) * HOME_DISTANCE_M,
    );
    faceViewer(this.dock, this.world);
    this.homeMode.notifyMoved();
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

  private closePopover(): void {
    if (this.popover === 'settings') {
      this.setSettingsOpen(false);
      return;
    }
    this.popover = null;
    this.renderPopover();
  }

  /**
   * Settings takes the stage: the buttons fade away and the panel glides
   * down into their place, centred where the eye already is. Closing (a
   * pinch outside it) reverses that.
   */
  private setSettingsOpen(open: boolean): void {
    if (open) {
      this.popover = 'settings';
      this.toasts.dismiss();
      this.renderPopover();
    } else if (this.popover !== 'settings') {
      return;
    }
    // Applied next frame: changing interactables while a pointer event is
    // being dispatched would break the dispatcher's listener loop.
    this.catcherWanted = open;
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

  private createDismissCatcher(): void {
    this.catcher = new Mesh(
      new PlaneGeometry(...CATCHER_SIZE_M),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    this.catcher.name = 'SettingsDismissCatcher';
    this.catcher.visible = false;
    // A pinch that starts and ends on the catcher closes Settings (XR hand
    // rays deliver down and up here, but no 'click' for a plain mesh).
    let armed = false;
    const handlers: Array<[string, () => void]> = [
      ['pointerdown', () => (armed = true)],
      ['pointerleave', () => (armed = false)],
      [
        'pointerup',
        () => {
          if (armed) this.setSettingsOpen(false);
          armed = false;
        },
      ],
    ];
    const target = this.catcher as unknown as EventTarget;
    for (const [type, handler] of handlers) target.addEventListener(type, handler);
    this.cleanupFuncs.push(() => {
      for (const [type, handler] of handlers) target.removeEventListener(type, handler);
      this.catcherEntity?.dispose();
    });
  }

  private placeCatcher(): void {
    this.scratch.set(0, 0, -CATCHER_BEHIND_M).applyQuaternion(this.dock.quaternion);
    this.catcher.position.copy(this.dock.position).add(this.scratch);
    this.catcher.quaternion.copy(this.dock.quaternion);
  }

  /** Put the catcher just behind the dock and let rays hit it, or retire it. */
  private setCatcherActive(active: boolean): void {
    if (active) {
      this.placeCatcher();
      this.catcher.visible = true;
      this.catcherEntity ??= this.world.createTransformEntity(this.catcher);
      if (!this.catcherEntity.hasComponent(RayInteractable)) this.catcherEntity.addComponent(RayInteractable);
    } else if (this.catcherEntity) {
      this.catcher.visible = false;
      if (this.catcherEntity.hasComponent(RayInteractable)) this.catcherEntity.removeComponent(RayInteractable);
    }
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
    // Glide the panel down so its centre lands on the row's centre.
    const height = (this.popoverPanel as unknown as { size: { peek(): [number, number] | undefined } }).size.peek()?.[1] ?? 0;
    const glide = Math.max(0, height / 2 - ROW_CENTRE_PX) * f;
    this.popoverPanel.setProperties({ transformTranslateY: glide } as Record<string, unknown>);
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
    this.dockOpacity = opacity;
    const fade = { opacity } as Record<string, unknown>;
    this.root.setProperties(fade);
    // UIKit images do not inherit opacity; fade them directly.
    for (const image of this.images) image.setProperties(fade);
    for (const slab of this.glassSlabs) slab.setOpacity(opacity);
    this.dock.scale.setScalar(this.baseScale * scale);
    if (this.focus > 0) this.paintFocus();
  }

  private renderPopover(): void {
    setVisible(this.popoverPanel, this.popover !== null);
    setVisible(this.popoverRecent, this.popover === 'recent');
    setVisible(this.popoverTemplates, this.popover === 'templates');
    setVisible(this.popoverSettings, this.popover === 'settings');
    for (const image of this.recentImages) setVisible(image, this.popover === 'recent');
    for (const image of this.templateImages) setVisible(image, this.popover === 'templates');
    setText(this.popoverTitle, POPOVER_TITLES[this.popover ?? 'recent']);
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
