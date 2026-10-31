/**
 * NoteViewSystem: shows the open note on the tablet, right in front of the
 * viewer, with a slim bar above it (the note's title and a close button).
 *
 * Starting or opening a note from the home opens the view (NoteViewState):
 * the dock fades away, and the tablet and bar fade in centred in the view,
 * a little below eye level and turned to face the eyes, so nothing needs
 * looking for. The bar's close button fades them out and the dock returns.
 * The page shows the note's paper; InkSystem draws its ink on top.
 *
 * Hidden, the tablet and bar also leave pointer input (no RayInteractable),
 * since rays still hit invisible meshes.
 */

import {
  createSystem,
  Euler,
  Mesh,
  RayInteractable,
  Vector3,
  type Entity,
  type MeshPhysicalMaterial,
  type Object3D,
  type UIKit,
  type UIKitMLAsset,
} from '@iwsdk/core';
import type { PaperStyle } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import { TABLET_TOP_M, WRITING_SURFACE_NAME } from '../scene-assets/tablet.scene-asset.js';
import { faceViewer } from '../ui/drag.js';
import { truncate } from '../ui/format.js';
import { attachLiquidGlass, type LiquidGlass } from '../ui/liquid-glass.js';
import { MeshFade } from '../ui/mesh-fade.js';
import { getNoteView, type NoteViewState } from '../ui/note-view.js';
import { addStateColors, PanelBinding, panelSize, setText, setVisible, UIKIT_PIXEL_M, type PanelElement } from '../ui/panel-helpers.js';
import { PaperPreview } from '../ui/paper-preview.js';
import { addPressMotion } from '../ui/press-motion.js';
import { easeInCubic, easeOutCubic, getTweens, type Tweens } from '../ui/tweens.js';

const TABLET_NODE = 'tablet';
const BAR_NODE = 'note-bar';
/** Metres out from the eyes, and degrees below eye level, of the page's centre. */
const DISTANCE_M = 0.55;
const BELOW_EYE_LEVEL_DEG = 4;
/** Space between the tablet's top edge and the bar (metres). */
const BAR_GAP_M = 0.025;
/** Must match .bar border-radius in note-bar.uikitml. */
const BAR_RADIUS_PX = 26;
const TITLE_MAX_CHARS = 32;
/** Canvas width of the page's paper texture (pixels). */
const PAPER_PX = 1024;
/** How much the page lights itself (0 to 1) on top of the room's light. */
const PAGE_GLOW = 0.3;
/** Fades (ms): the page comes in once the dock has faded away. */
const SHOW_MS = 320;
const SHOW_DELAY_MS = 140;
const HIDE_MS = 220;
const CLOSE_STATES = {
  rest: 'rgba(255, 250, 242, 0.1)',
  hover: 'rgba(255, 250, 242, 0.22)',
  pressed: 'rgba(255, 250, 242, 0.3)',
};

export class NoteViewSystem extends createSystem({}) {
  private session!: NoteSession;
  private noteView!: NoteViewState;
  private tweens!: Tweens;
  private tabletEntity!: Entity;
  private tablet!: Object3D;
  private barEntity!: Entity;
  private bar!: Object3D;
  private barRoot!: PanelElement;
  private barGlass!: LiquidGlass;
  private title!: UIKit.Text;
  private paperLabel!: UIKit.Text;
  private fade!: MeshFade;
  private paper!: PaperPreview;
  /** The paper drawn on the page, so it is redrawn only when it changes. */
  private drawnPaper: PaperStyle | null = null;
  private readonly headPosition = new Vector3();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');

  init(): void {
    const tabletEntity = this.world.getSceneEntity(TABLET_NODE);
    const barEntity = this.world.getSceneEntity(BAR_NODE);
    const bar = this.world.getSceneObject<UIKitMLAsset>(BAR_NODE);
    if (!tabletEntity?.object3D || !barEntity || !bar) {
      console.warn('[NoteViewSystem] Tablet or note bar missing from the scene.');
      return;
    }
    this.session = getNoteSession(this.world);
    this.noteView = getNoteView(this.world);
    this.tweens = getTweens(this.world);
    this.tabletEntity = tabletEntity;
    this.tablet = tabletEntity.object3D;
    this.barEntity = barEntity;
    this.bar = bar;
    this.fade = new MeshFade(this.tablet);
    this.usePaperTexture();

    const ui = new PanelBinding(bar, this.cleanupFuncs);
    this.barRoot = ui.element('note-bar-root');
    this.barGlass = attachLiquidGlass(this.barRoot, this.cleanupFuncs, {
      radiusPx: BAR_RADIUS_PX,
      bevelPx: 8,
      frostAlpha: 0.88,
      host: bar,
    });
    this.title = ui.text('note-bar-title');
    this.paperLabel = ui.text('note-bar-paper');
    const close = ui.onClick('note-bar-close', () => this.noteView.close());
    addStateColors(close, CLOSE_STATES, this.cleanupFuncs);
    addPressMotion(close, this.tweens, this.cleanupFuncs, { hover: 1.08, pressed: 0.92 });

    this.setShown(false);
    this.cleanupFuncs.push(
      this.noteView.subscribe((open) => (open ? this.present() : this.dismiss())),
      // Another note can open while the view is up (or the open one is renamed).
      this.session.subscribe((change) => {
        if (change !== 'save' && this.noteView.isOpen) this.renderNote();
      }),
      () => {
        this.tweens.cancel('note-view');
        this.fade.restore();
      },
    );
  }

  /**
   * Give this tablet's page its own material showing the paper style. The
   * asset's material is shared by every copy, so it is copied, not changed.
   */
  private usePaperTexture(): void {
    const surface = this.tablet.getObjectByName(WRITING_SURFACE_NAME);
    if (!(surface instanceof Mesh)) return;
    this.paper = new PaperPreview(PAPER_PX);
    const material = (surface.material as MeshPhysicalMaterial).clone();
    material.map = this.paper.texture;
    // A faint glow of its own, so the page reads as white paper in a dim
    // room instead of grey.
    material.emissiveMap = this.paper.texture;
    material.emissive.set(0xffffff);
    material.emissiveIntensity = PAGE_GLOW;
    surface.material = material;
    this.cleanupFuncs.push(() => {
      material.dispose();
      this.paper.dispose();
    });
  }

  // ----------------------------------------------------------- transitions

  private present(): void {
    this.place();
    this.renderNote();
    this.setShown(true);
    this.setOpacity(0);
    this.tweens.play(SHOW_MS, (t) => this.setOpacity(easeOutCubic(t)), {
      delayMs: SHOW_DELAY_MS,
      key: 'note-view',
    });
  }

  private dismiss(): void {
    this.tweens.play(HIDE_MS, (t) => this.setOpacity(1 - easeInCubic(t)), {
      key: 'note-view',
      done: () => {
        this.setShown(false);
        this.setOpacity(1);
      },
    });
  }

  private setOpacity(opacity: number): void {
    this.fade.set(opacity);
    this.barRoot.setProperties({ opacity } as Record<string, unknown>);
    this.barGlass.setOpacity(opacity);
  }

  /** Show or hide the tablet and bar, and let rays reach them only while shown. */
  private setShown(shown: boolean): void {
    this.tablet.visible = shown;
    setVisible(this.barRoot, shown);
    for (const entity of [this.tabletEntity, this.barEntity]) {
      if (shown && !entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
      if (!shown && entity.hasComponent(RayInteractable)) entity.removeComponent(RayInteractable);
    }
  }

  // ------------------------------------------------------------- placement

  /** Straight ahead of the head (its yaw), a little below eye level, facing the eyes. */
  private place(): void {
    this.player.head.getWorldPosition(this.headPosition);
    this.player.head.getWorldQuaternion(this.tablet.quaternion);
    const yaw = this.euler.setFromQuaternion(this.tablet.quaternion, 'YXZ').y;
    this.tablet.position.set(
      this.headPosition.x - Math.sin(yaw) * DISTANCE_M,
      this.headPosition.y - Math.tan((BELOW_EYE_LEVEL_DEG * Math.PI) / 180) * DISTANCE_M,
      this.headPosition.z - Math.cos(yaw) * DISTANCE_M,
    );
    faceViewer(this.tablet, this.world);
    // The bar sits on the tablet's top edge, in the tablet's own plane.
    const barHeightPx = panelSize(this.barRoot).peek()?.[1] ?? 0;
    const barHalfM = (barHeightPx / 2) * UIKIT_PIXEL_M * this.bar.scale.y;
    this.bar.position.set(0, TABLET_TOP_M + BAR_GAP_M + barHalfM, 0);
    this.tablet.localToWorld(this.bar.position);
    this.bar.quaternion.copy(this.tablet.quaternion);
  }

  // ------------------------------------------------------------- rendering

  private renderNote(): void {
    const note = this.session.active;
    if (!note) return;
    setText(this.title, truncate(note.title || 'Untitled note', TITLE_MAX_CHARS));
    setText(this.paperLabel, paperLabel(note.paper));
    if (note.paper !== this.drawnPaper) {
      this.paper?.draw(note.paper);
      this.drawnPaper = note.paper;
    }
  }
}

/** "Lined page", "Blank page": what the bar says under the title. */
function paperLabel(paper: PaperStyle): string {
  return `${paper.charAt(0).toUpperCase()}${paper.slice(1)} page`;
}
