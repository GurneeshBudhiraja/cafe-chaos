/**
 * CompactDockSystem: the minimised home, a row of floating glass buttons.
 *
 * Expand, Recent | New note | Templates, Settings, with nothing between them
 * but passthrough. Recent and Templates open a small pop-up just above the
 * row; picking an item closes it and the dock stays minimised. A grab bar
 * under the row moves the dock (pinch and drag); on release it turns to face
 * the viewer. Expanding opens the full window where the dock is.
 *
 * Mode changes go through the shared HomeModeState; note changes go through
 * NoteSession commands.
 */

import { createSystem, Quaternion, Vector3, type Object3D, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { PAPER_STYLES, type PaperStyle } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import { noteTitleFor, truncate } from '../ui/format.js';
import { getHomeMode, type HomeModeState } from '../ui/home-mode.js';
import { attachLiquidGlass } from '../ui/liquid-glass.js';
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

const DOCK_NODE = 'compact-dock';
const WINDOW_NODE = 'home-window';
/** Must match the number of `dock-recent-card-N` elements. */
const RECENT_SLOTS = 4;
const TITLE_MAX_CHARS = 12;
const PREVIEW_PX = 224;
/** Half the round buttons' size: their corner radius in UIKit pixels. */
const BUTTON_RADIUS_PX = 32;
const GLASS_FROST_ALPHA = 0.84;
/**
 * Where the full window sits relative to the dock, in the dock's own frame
 * (metres): a little higher and further away. Matches the scene defaults.
 */
const WINDOW_OFFSET = new Vector3(0, 0.25, -0.2);

type Popover = 'recent' | 'templates' | null;

interface RecentCard {
  root: PanelElement;
  title: UIKit.Text;
  thumbnail: NoteThumbnail;
  noteId: string | null;
}

/** The parts of a pmndrs pointer event the drag uses. */
interface DragEvent {
  point: Vector3;
  pointerId?: number;
  object?: { setPointerCapture?(id: number): void };
}

export class CompactDockSystem extends createSystem({}) {
  private session!: NoteSession;
  private homeMode!: HomeModeState;
  private dock!: Object3D;
  private window: Object3D | null = null;
  private root!: PanelElement;
  private popover: Popover = null;
  private popoverPanel!: PanelElement;
  private popoverTitle!: UIKit.Text;
  private popoverRecent!: PanelElement;
  private popoverTemplates!: PanelElement;
  private recentCards: RecentCard[] = [];

  // Drag state, allocated once.
  private dragging = false;
  private readonly dragStartPoint = new Vector3();
  private readonly dragStartPosition = new Vector3();
  private readonly scratch = new Vector3();
  private readonly viewer = new Vector3();

  init(): void {
    this.session = getNoteSession(this.world);
    this.homeMode = getHomeMode(this.world);
    const panel = this.world.getSceneObject<UIKitMLAsset>(DOCK_NODE);
    if (!panel) {
      console.warn('[CompactDockSystem] Compact dock missing from the scene.');
      return;
    }
    this.dock = panel;
    this.window = this.world.getSceneObject(WINDOW_NODE) ?? null;
    const ui = new PanelBinding(panel, this.cleanupFuncs);
    this.root = ui.element('dock-root');
    // Anchor at the bottom so the pop-up grows upwards and the row stays put.
    this.root.setProperties({ anchorY: 'bottom' } as Record<string, unknown>);

    // Each round button and the pop-up get their own glass, with edge light.
    const glass = (el: PanelElement, radiusPx: number) =>
      attachLiquidGlass(el, this.cleanupFuncs, {
        radiusPx,
        bevelPx: 10,
        frostAlpha: GLASS_FROST_ALPHA,
        host: panel,
      });

    const round = [
      ui.onClick('dock-expand', () => this.expand()),
      ui.onClick('dock-recent', () => this.togglePopover('recent')),
      ui.onClick('dock-templates', () => this.togglePopover('templates')),
      ui.onClick('dock-settings', () => this.expand(true)),
    ];
    for (const el of round) {
      glass(el, BUTTON_RADIUS_PX);
      addStateColors(el, NEUTRAL_STATES, this.cleanupFuncs);
    }
    const newNote = ui.onClick('dock-new', () => this.newNote('blank'));
    addStateColors(newNote, PRIMARY_STATES, this.cleanupFuncs);

    this.popoverPanel = ui.element('dock-popover');
    glass(this.popoverPanel, 0);
    this.popoverTitle = ui.text('dock-popover-title');
    this.popoverRecent = ui.element('dock-popover-recent');
    this.popoverTemplates = ui.element('dock-popover-templates');

    for (let i = 0; i < RECENT_SLOTS; i++) {
      const thumbnail = new NoteThumbnail(PREVIEW_PX);
      ui.element(`dock-recent-thumb-${i}`).setProperties({ src: thumbnail.texture });
      const card: RecentCard = {
        root: ui.onClick(`dock-recent-card-${i}`, () => {
          if (!card.noteId) return;
          void this.session.openNote(card.noteId);
          this.closePopover();
        }),
        title: ui.text(`dock-recent-title-${i}`),
        thumbnail,
        noteId: null,
      };
      addStateColors(card.root, NEUTRAL_STATES, this.cleanupFuncs);
      this.recentCards.push(card);
      this.cleanupFuncs.push(() => thumbnail.dispose());
    }

    for (const paper of PAPER_STYLES) {
      const card = ui.onClick(`dock-template-${paper}`, () => this.newNote(paper));
      addStateColors(card, NEUTRAL_STATES, this.cleanupFuncs);
      if (paper === 'blank') continue;
      const preview = new PaperPreview(PREVIEW_PX);
      preview.draw(paper);
      ui.element(`dock-template-img-${paper}`).setProperties({ src: preview.texture });
      this.cleanupFuncs.push(() => preview.dispose());
    }

    this.setupDrag(ui.element('dock-grab'), ui.element('dock-grab-bar'));

    this.cleanupFuncs.push(
      this.session.subscribe(() => this.renderRecent()),
      this.homeMode.subscribe(({ mode }) => this.applyMode(mode)),
    );
    this.renderRecent();
    this.applyMode(this.homeMode.mode);
  }

  // -------------------------------------------------------------- commands

  private newNote(paper: PaperStyle): void {
    void this.session.createNote(noteTitleFor(), paper);
    this.closePopover();
  }

  private expand(openSettings = false): void {
    this.homeMode.set('full', { openSettings });
  }

  private togglePopover(which: Exclude<Popover, null>): void {
    this.popover = this.popover === which ? null : which;
    this.renderPopover();
  }

  private closePopover(): void {
    this.popover = null;
    this.renderPopover();
  }

  // ------------------------------------------------------------- rendering

  private applyMode(mode: 'full' | 'compact'): void {
    const compact = mode === 'compact';
    if (compact) {
      this.placeRelativeToWindow();
    } else {
      this.placeWindowAtDock();
      this.popover = null;
    }
    setVisible(this.root, compact);
    this.renderPopover();
  }

  private renderPopover(): void {
    setVisible(this.popoverPanel, this.popover !== null);
    setVisible(this.popoverRecent, this.popover === 'recent');
    setVisible(this.popoverTemplates, this.popover === 'templates');
    setText(this.popoverTitle, this.popover === 'templates' ? 'Start a new note' : 'Recent notes');
  }

  private renderRecent(): void {
    const summaries = this.session.summaries;
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

  // ------------------------------------------------------------------ drag

  /**
   * Pinch the grab bar and move the ray (or mouse) to drag the dock. Pointer
   * capture keeps the drag going when the ray leaves the bar; the point
   * moves at the grab distance, so the dock follows the hand.
   */
  private setupDrag(grab: PanelElement, bar: PanelElement): void {
    const down = (raw: unknown) => {
      const event = raw as DragEvent;
      if (!event.point) return;
      this.dragging = true;
      this.dragStartPoint.copy(event.point);
      this.dragStartPosition.copy(this.dock.position);
      if (event.pointerId != null) event.object?.setPointerCapture?.(event.pointerId);
      bar.setProperties({ backgroundColor: '#ffffff' });
    };
    const move = (raw: unknown) => {
      const event = raw as DragEvent;
      if (!this.dragging || !event.point) return;
      this.scratch.copy(event.point).sub(this.dragStartPoint);
      this.dock.position.copy(this.dragStartPosition).add(this.scratch);
    };
    const up = () => {
      if (!this.dragging) return;
      this.dragging = false;
      bar.setProperties({ backgroundColor: 'rgba(255, 253, 249, 0.92)' });
      this.faceViewer();
    };
    grab.addEventListener('pointerdown', down);
    grab.addEventListener('pointermove', move);
    grab.addEventListener('pointerup', up);
    addStateColors(grab, NEUTRAL_STATES, this.cleanupFuncs);
    this.cleanupFuncs.push(() => {
      grab.removeEventListener('pointerdown', down);
      grab.removeEventListener('pointermove', move);
      grab.removeEventListener('pointerup', up);
    });
  }

  /** Turn the dock about its vertical axis to face the viewer's head. */
  private faceViewer(): void {
    this.world.camera.getWorldPosition(this.viewer);
    const yaw = Math.atan2(this.viewer.x - this.dock.position.x, this.viewer.z - this.dock.position.z);
    this.dock.quaternion.copy(FACING.setFromAxisAngle(UP, yaw));
  }
}

const UP = new Vector3(0, 1, 0);
const FACING = new Quaternion();
