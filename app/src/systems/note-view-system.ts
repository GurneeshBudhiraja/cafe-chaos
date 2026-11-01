/**
 * NoteViewSystem: shows the open note on the tablet, with a slim bar above
 * it (the note's title and a close button).
 *
 * Starting or opening a note from the home opens the view (NoteViewState):
 * the dock fades away and the tablet fades in lying flat on the desk in
 * front of the viewer, like an iPad on a table (see desk-placement.ts), with
 * the bar standing just behind its far edge. With no desk found it floats
 * straight ahead instead, a little below eye level and turned to face the
 * eyes. The bar's close button fades them out and the dock returns. The
 * page shows the note's paper; InkSystem draws its ink on top. The paper's
 * photo stays put while its pattern (ruled lines, grid, dots) belongs to the
 * page's infinite canvas, so it pans and zooms with the ink
 * (paper-pattern.ts).
 *
 * Hidden, the tablet and bar also leave pointer input (no RayInteractable),
 * since rays still hit invisible meshes.
 */

import {
  AssetManager,
  createSystem,
  Euler,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RayInteractable,
  Vector3,
  XRPlane as DetectedPlane,
  type Entity,
  type MeshPhysicalMaterial,
  type Object3D,
  type UIKit,
  type UIKitMLAsset,
} from '@iwsdk/core';
import type { PaperStyle } from '../notes/note-model.js';
import { getNoteSession } from '../notes/note-services.js';
import type { NoteSession } from '../notes/note-session.js';
import { SURFACE_HEIGHT_M, SURFACE_WIDTH_M, TABLET_TOP_M, WRITING_SURFACE_NAME } from '../scene-assets/tablet.scene-asset.js';
import { findDeskSpot, type DetectedSurface } from '../ui/desk-placement.js';
import { faceViewer } from '../ui/drag.js';
import { truncate } from '../ui/format.js';
import { attachLiquidGlass, type LiquidGlass } from '../ui/liquid-glass.js';
import { MeshFade } from '../ui/mesh-fade.js';
import { getNoteView, type NoteViewState } from '../ui/note-view.js';
import { addStateColors, PanelBinding, panelSize, setText, setVisible, UIKIT_PIXEL_M, type PanelElement } from '../ui/panel-helpers.js';
import { aimPaperPattern, createPaperPattern, type PaperPattern } from '../ui/paper-pattern.js';
import { PaperPreview } from '../ui/paper-preview.js';
import { addPressMotion } from '../ui/press-motion.js';
import { easeInCubic, easeOutCubic, getTweens, type Tweens } from '../ui/tweens.js';

const TABLET_NODE = 'tablet';
const BAR_NODE = 'note-bar';
/** With no desk: metres out from the eyes, and degrees below eye level, of the page's centre. */
const DISTANCE_M = 0.55;
const BELOW_EYE_LEVEL_DEG = 4;
/** On a desk the page sits this high above the desk's surface: the tablet's body (metres). */
const ON_DESK_M = 0.01;
/** Space between the tablet's top edge and the bar (metres). */
const BAR_GAP_M = 0.025;
/** Must match .bar border-radius in note-bar.uikitml. */
const BAR_RADIUS_PX = 26;
const TITLE_MAX_CHARS = 32;
/** Canvas width of the page's paper texture (pixels). */
const PAPER_PX = 1024;
/** How much the page lights itself (0 to 1) on top of the room's light: a little, so it reads as lit paper, not a light box. */
const PAGE_GLOW = 0.12;
/** The paper picture drawn under the page's lines (asset ID). */
const PAPER_IMAGE_ASSET = 'paper-image';
/** The pattern lies this far over the page (metres): under the ink, never flickering into the paper. */
const PATTERN_LIFT_M = 0.0003;
/** Fades (ms): the page comes in once the dock has faded away. */
const SHOW_MS = 320;
const SHOW_DELAY_MS = 140;
const HIDE_MS = 220;
const CLOSE_STATES = {
  rest: 'rgba(255, 250, 242, 0.1)',
  hover: 'rgba(255, 250, 242, 0.22)',
  pressed: 'rgba(255, 250, 242, 0.3)',
};

export class NoteViewSystem extends createSystem({
  planes: { required: [DetectedPlane] },
}) {
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
  /** The paper whose pattern is on the page, so it is made only when it changes. */
  private drawnPaper: PaperStyle | null = null;
  /** The page's pattern on the canvas (null for blank paper), and the mesh showing it. */
  private pattern: PaperPattern | null = null;
  private patternMesh!: Mesh;
  private patternMaterial!: MeshBasicMaterial;
  private readonly headPosition = new Vector3();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly deskSpot = new Vector3();
  // Bound once; reads the detected planes for desk-placement.ts.
  private readonly surfaces: Iterable<DetectedSurface> = {
    [Symbol.iterator]: () => this.surfaceList(),
  };

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
        if (change === 'view') this.aimPattern();
        else if (change !== 'save' && this.noteView.isOpen) this.renderNote();
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
    const paperImage = AssetManager.getTexture(PAPER_IMAGE_ASSET)?.image as CanvasImageSource | undefined;
    if (paperImage) this.paper.setPaperImage(paperImage);
    // The sheet itself (the photo); its pattern is a separate layer on the canvas.
    this.paper.draw('blank');
    const material = (surface.material as MeshPhysicalMaterial).clone();
    material.map = this.paper.texture;
    // A faint glow of its own, so the page reads as white paper in a dim
    // room instead of grey.
    material.emissiveMap = this.paper.texture;
    material.emissive.set(0xffffff);
    material.emissiveIntensity = PAGE_GLOW;
    surface.material = material;

    this.patternMaterial = new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    this.patternMesh = new Mesh(new PlaneGeometry(SURFACE_WIDTH_M, SURFACE_HEIGHT_M), this.patternMaterial);
    this.patternMesh.name = 'PaperPattern';
    this.patternMesh.position.z = PATTERN_LIFT_M;
    this.patternMesh.raycast = () => {};
    this.patternMesh.visible = false;
    surface.add(this.patternMesh);
    this.cleanupFuncs.push(() => {
      material.dispose();
      this.paper.dispose();
      this.pattern?.texture.dispose();
      this.patternMaterial.dispose();
      this.patternMesh.geometry.dispose();
    });
  }

  /** Show `paper`'s pattern on the page (made once per paper style). */
  private usePattern(paper: PaperStyle): void {
    if (!this.patternMesh || paper === this.drawnPaper) return;
    this.drawnPaper = paper;
    this.pattern?.texture.dispose();
    this.pattern = createPaperPattern(paper);
    this.patternMaterial.map = this.pattern?.texture ?? null;
    this.patternMaterial.needsUpdate = true;
    this.patternMesh.visible = this.pattern !== null;
    this.aimPattern();
  }

  /** Line the pattern up with the page's view of its canvas. */
  private aimPattern(): void {
    if (this.pattern) aimPaperPattern(this.pattern, this.session.getView());
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

  /** Flat on the desk in front of the viewer, or floating straight ahead without one. */
  private place(): void {
    this.player.head.getWorldPosition(this.headPosition);
    this.player.head.getWorldQuaternion(this.tablet.quaternion);
    const yaw = this.euler.setFromQuaternion(this.tablet.quaternion, 'YXZ').y;
    const barHeightPx = panelSize(this.barRoot).peek()?.[1] ?? 0;
    const barHalfM = (barHeightPx / 2) * UIKIT_PIXEL_M * this.bar.scale.y;

    const onDesk = findDeskSpot(this.surfaces, this.headPosition, yaw, this.deskSpot);
    // The tablet model's soft contact shadow belongs on a desk, not in mid-air.
    const deskShadow = this.tablet.getObjectByName('DeskShadow');
    if (deskShadow) deskShadow.visible = onDesk;
    if (onDesk) {
      // Page up, its bottom edge toward the viewer.
      this.tablet.position.copy(this.deskSpot);
      this.tablet.position.y += ON_DESK_M;
      const toViewer = Math.atan2(
        this.headPosition.x - this.deskSpot.x,
        this.headPosition.z - this.deskSpot.z,
      );
      this.tablet.quaternion.setFromEuler(this.euler.set(-Math.PI / 2, toViewer, 0, 'YXZ'));
      // The bar stands just behind the far edge, facing the eyes.
      this.tablet.updateMatrixWorld();
      this.bar.position.set(0, TABLET_TOP_M + BAR_GAP_M, 0);
      this.tablet.localToWorld(this.bar.position);
      this.bar.position.y += barHalfM;
      faceViewer(this.bar, this.world);
      return;
    }

    // No desk: straight ahead, a little below eye level, facing the eyes.
    this.tablet.position.set(
      this.headPosition.x - Math.sin(yaw) * DISTANCE_M,
      this.headPosition.y - Math.tan((BELOW_EYE_LEVEL_DEG * Math.PI) / 180) * DISTANCE_M,
      this.headPosition.z - Math.cos(yaw) * DISTANCE_M,
    );
    faceViewer(this.tablet, this.world);
    // The bar sits on the tablet's top edge, in the tablet's own plane.
    this.tablet.updateMatrixWorld();
    this.bar.position.set(0, TABLET_TOP_M + BAR_GAP_M + barHalfM, 0);
    this.tablet.localToWorld(this.bar.position);
    this.bar.quaternion.copy(this.tablet.quaternion);
  }

  /** The detected planes, as desk-placement.ts reads them. */
  private *surfaceList(): Generator<DetectedSurface> {
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(DetectedPlane, '_plane') as XRPlane | undefined;
      if (plane && entity.object3D) yield { object: entity.object3D, plane };
    }
  }

  // ------------------------------------------------------------- rendering

  private renderNote(): void {
    const note = this.session.active;
    if (!note) return;
    setText(this.title, truncate(note.title || 'Untitled note', TITLE_MAX_CHARS));
    setText(this.paperLabel, paperLabel(note.paper));
    this.usePattern(note.paper);
    this.aimPattern();
  }
}

/** "Lined page", "Blank page": what the bar says under the title. */
function paperLabel(paper: PaperStyle): string {
  return `${paper.charAt(0).toUpperCase()}${paper.slice(1)} page`;
}
