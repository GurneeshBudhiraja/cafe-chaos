/**
 * TypingSystem: typed text on the note's page, and the keys that type it.
 *
 * - Shows the page's text frames on the tablet's page (PageTextView), in
 *   both modes, over the handwriting.
 * - Owns the TextEditor (shared through TypingState) and saves every edit
 *   with the note.
 * - The Write / Type toggle on the note bar switches modes. Entering Type
 *   mode puts the caret just below the handwriting (or at the end of the
 *   text typed last), so the user can type straight away; a tap anywhere
 *   on the page types there instead, as in Excalidraw.
 * - In Type mode the headset's own keyboard (Meta Quest's system keyboard,
 *   system-keyboard.ts) comes up and types at the caret. A tap or poke on
 *   the page places the caret and brings the keyboard back if it was
 *   closed (a quick second tap selects the word; a drag selects text; a tap
 *   on a checklist's box ticks it). A real keyboard types too, with Docs'
 *   shortcuts (key-commands.ts).
 *
 * Staging the floating page and the desk keyboard is TypeModeSystem's job.
 */

import { createSystem, Mesh, Vector3, type Object3D, type UIKitMLAsset } from '@iwsdk/core';
import { INK_RENDER_ORDER } from '../ink/stroke-mesh.js';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import type { Page } from '../notes/note-model.js';
import { SURFACE_HEIGHT_M, SURFACE_WIDTH_M, WRITING_SURFACE_NAME } from '../scene-assets/tablet.scene-asset.js';
import { applyKey, type KeyStroke } from '../text/key-commands.js';
import { SystemKeyboard } from '../text/system-keyboard.js';
import { FRAME_MARGIN, TextEditor } from '../text/text-editor.js';
import { TextLayout, PAGE_UNITS_HEIGHT } from '../text/text-layout.js';
import { createCanvasMeasure, loadTextFonts, PageTextView } from '../text/text-renderer.js';
import { getNoteView, type NoteViewState } from '../ui/note-view.js';
import { addToggleStateColors, PanelBinding } from '../ui/panel-helpers.js';
import { addPressMotion } from '../ui/press-motion.js';
import { getTweens } from '../ui/tweens.js';
import { getTyping, type TypingState } from '../ui/typing-state.js';

const TABLET_NODE = 'tablet';
const BAR_NODE = 'note-bar';
/** New text starts this far below the lowest handwriting (page heights). */
const GAP_BELOW_WRITING = 0.035;
/** Two taps this close in time and place select a word (ms, page widths). */
const DOUBLE_TAP_MS = 450;
const DOUBLE_TAP_REACH = 0.03;

/** The parts of a pmndrs pointer event this system reads. */
interface PagePointerEvent {
  pointerId: number;
  point: Vector3;
  object: Object3D;
}

export class TypingSystem extends createSystem({}) {
  private session!: NoteSession;
  private typing!: TypingState;
  private noteView!: NoteViewState;
  private editor!: TextEditor;
  private layout!: TextLayout;
  private view!: PageTextView;
  private keyboard!: SystemKeyboard;
  private tablet!: Object3D;
  private surface!: Mesh;
  private refreshToggle: Array<() => void> = [];
  /** The pointer selecting text (from its touch-down), if any. */
  private dragPointer: number | null = null;
  private lastTap = { at: -Infinity, x: 0, y: 0 };
  private readonly local = new Vector3();
  private readonly pagePoint = { x: 0, y: 0 };

  init(): void {
    const tablet = this.world.getSceneEntity(TABLET_NODE)?.object3D;
    const surface = tablet?.getObjectByName(WRITING_SURFACE_NAME);
    if (!tablet || !(surface instanceof Mesh)) {
      console.warn('[TypingSystem] The tablet or its page is missing.');
      return;
    }
    this.tablet = tablet;
    this.surface = surface;
    this.session = getNoteSession(this.world);
    this.typing = getTyping(this.world);
    this.noteView = getNoteView(this.world);
    this.layout = new TextLayout(createCanvasMeasure());
    this.editor = new TextEditor(this.layout);
    this.typing.editor = this.editor;
    this.typing.layout = this.layout;
    this.typing.setKeyHandler((stroke) => this.typeKey(stroke));
    this.keyboard = new SystemKeyboard(this.editor);
    this.typing.setKeyboardOpener(() => this.showKeyboard());
    // Text draws over the ink.
    this.view = new PageTextView(surface, SURFACE_WIDTH_M, SURFACE_HEIGHT_M, this.layout, INK_RENDER_ORDER + 1);

    void loadTextFonts().then(() => {
      // The real fonts measure differently from the fallback: lay out again.
      this.layout.resetMeasurements();
      this.view.invalidate();
      this.render();
    });

    this.bindModeToggle();
    this.listenToPage();
    this.listenToKeyboard();
    this.editor.setPage(this.session.getActivePage());
    this.render();

    this.cleanupFuncs.push(
      this.session.subscribe((change) => {
        if (change !== 'active') return;
        this.editor.setPage(this.session.getActivePage());
        this.render();
      }),
      this.editor.subscribe((change) => {
        if (change === 'content') this.session.textEdited();
        this.view.wake(performance.now());
        this.render();
      }),
      this.typing.subscribe((mode) => this.onModeChange(mode === 'type')),
      // Closing the note leaves typing.
      this.noteView.subscribe((open) => {
        if (!open) this.typing.setMode('write');
      }),
      () => {
        this.typing.setKeyHandler(null);
        this.typing.setKeyboardOpener(null);
        this.keyboard.dispose();
        this.view.dispose();
      },
    );
  }

  update(): void {
    this.view?.update(performance.now());
  }

  // ------------------------------------------------------------ the modes

  private onModeChange(typing: boolean): void {
    for (const refresh of this.refreshToggle) refresh();
    if (typing) {
      this.placeStartingCaret();
      // Called from the toggle's tap, so the browser lets the keyboard come up.
      this.keyboard.show();
    } else {
      this.keyboard.hide();
      this.editor.blur();
    }
    this.view.setCaretVisible(typing);
    this.render();
  }

  /**
   * Where typing starts on entering Type mode: at the end of the text typed
   * last if it is the lowest thing on the page, else in a new frame just
   * below the handwriting ("below where they stopped writing").
   */
  private placeStartingCaret(): void {
    const page = this.session.getActivePage();
    if (!page) return;
    const inkBottom = lowestInk(page);
    let lowestFrame = null;
    let frameBottom = -Infinity;
    for (const frame of page.frames ?? []) {
      const bottom = frame.y + this.layout.layoutFrame(frame).height / PAGE_UNITS_HEIGHT;
      if (bottom > frameBottom) {
        frameBottom = bottom;
        lowestFrame = frame;
      }
    }
    if (lowestFrame && frameBottom >= inkBottom) {
      this.editor.focusEnd(lowestFrame);
      return;
    }
    const top = Math.min(0.9, Math.max(FRAME_MARGIN, inkBottom + GAP_BELOW_WRITING));
    this.editor.newFrame(FRAME_MARGIN, top, 1 - FRAME_MARGIN * 2);
  }

  /** The Write / Type segmented toggle on the note bar. */
  private bindModeToggle(): void {
    const bar = this.world.getSceneObject<UIKitMLAsset>(BAR_NODE);
    if (!bar) return;
    const ui = new PanelBinding(bar, this.cleanupFuncs);
    const tweens = getTweens(this.world);
    const segments = [
      { id: 'note-bar-mode-write', mode: 'write' as const },
      { id: 'note-bar-mode-type', mode: 'type' as const },
    ];
    for (const { id, mode } of segments) {
      const element = ui.onClick(id, () => this.typing.setMode(mode));
      this.refreshToggle.push(addToggleStateColors(element, () => this.typing.mode === mode, this.cleanupFuncs));
      addPressMotion(element, tweens, this.cleanupFuncs, { hover: 1.05, pressed: 0.94 });
    }
  }

  // --------------------------------------------------------- page touches

  /** Taps, pokes and drags on the page while typing: place the caret, select, tick boxes. */
  private listenToPage(): void {
    const target = this.tablet as unknown as {
      addEventListener(type: string, listener: (event: PagePointerEvent) => void): void;
      removeEventListener(type: string, listener: (event: PagePointerEvent) => void): void;
    };
    const down = (event: PagePointerEvent) => {
      if (!this.typing.typing || event.object !== this.surface || !this.toPage(event.point)) return;
      const { x, y } = this.pagePoint;
      const box = this.layout.checkboxAt(this.editor.frames, x, y);
      if (box) {
        this.editor.toggleChecked(box.frameId, box.block);
        return;
      }
      const now = performance.now();
      const again = now - this.lastTap.at < DOUBLE_TAP_MS && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < DOUBLE_TAP_REACH;
      this.lastTap = { at: again ? -Infinity : now, x, y };
      this.editor.typeAt(x, y);
      if (!this.keyboard.open) this.keyboard.show();
      if (again) {
        this.editor.selectWord(this.editor.caret);
        return;
      }
      this.dragPointer = event.pointerId;
    };
    const move = (event: PagePointerEvent) => {
      if (event.pointerId !== this.dragPointer || event.object !== this.surface || !this.toPage(event.point)) return;
      this.editor.dragTo(this.pagePoint.x, this.pagePoint.y);
    };
    const up = (event: PagePointerEvent) => {
      if (event.pointerId === this.dragPointer) this.dragPointer = null;
    };
    const handlers = [
      ['pointerdown', down],
      ['pointermove', move],
      ['pointerup', up],
      ['pointercancel', up],
    ] as const;
    for (const [type, handler] of handlers) target.addEventListener(type, handler);
    this.cleanupFuncs.push(() => {
      for (const [type, handler] of handlers) target.removeEventListener(type, handler);
    });
  }

  /** A world point on the page, into `pagePoint` (page coordinates); false when off the page. */
  private toPage(point: Vector3): boolean {
    this.surface.updateWorldMatrix(true, false);
    const local = this.surface.worldToLocal(this.local.copy(point));
    const x = local.x / SURFACE_WIDTH_M + 0.5;
    const y = 0.5 - local.y / SURFACE_HEIGHT_M;
    if (x < 0 || x > 1 || y < 0 || y > 1) return false;
    this.pagePoint.x = x;
    this.pagePoint.y = y;
    return true;
  }

  // ------------------------------------------------------------- keyboard

  /** A real keyboard types while in Type mode (a paired Bluetooth one, or the computer's). */
  private listenToKeyboard(): void {
    const onKey = (event: KeyboardEvent) => {
      if (!this.typing.typing || event.isComposing) return;
      this.typeKey({
        key: event.key,
        code: event.code,
        shift: event.shiftKey,
        ctrl: event.ctrlKey || event.metaKey,
        alt: event.altKey,
      }) && event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
  }

  /** Bring the headset's keyboard up, typing at the caret (or where Type mode starts). */
  private showKeyboard(): void {
    if (!this.typing.typing) return;
    if (!this.editor.frame) this.placeStartingCaret();
    this.keyboard.show();
  }

  /** Type one key (from a real keyboard). Returns whether it did anything. */
  private typeKey(stroke: KeyStroke): boolean {
    if (!this.typing.typing) return false;
    // Typing with no caret starts where Type mode would.
    if (!this.editor.frame) this.placeStartingCaret();
    return applyKey(this.editor, stroke);
  }

  private render(): void {
    this.view.render(this.editor.frames, {
      frameId: this.typing.typing ? (this.editor.frame?.id ?? null) : null,
      caret: this.editor.caret,
      anchor: this.editor.anchor,
    });
  }
}

/** Strokes smaller than this across (page widths) are specks (a pen set down, a slip), not writing. */
const SPECK_SIZE = 0.02;

/** The bottom of the page's lowest handwriting (page coordinates), or 0 for a page without any. */
function lowestInk(page: Page): number {
  let bottom = 0;
  for (const stroke of page.strokes) {
    const points = stroke.points;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
      minX = Math.min(minX, points[i]);
      maxX = Math.max(maxX, points[i]);
      minY = Math.min(minY, points[i + 1]);
      maxY = Math.max(maxY, points[i + 1]);
    }
    if (Math.hypot(maxX - minX, maxY - minY) < SPECK_SIZE) continue;
    bottom = Math.max(bottom, maxY);
  }
  return bottom;
}
