/**
 * TypeModeSystem: stages Type mode, the way the note is laid out for typing.
 *
 * Switching to Type (the note bar's toggle):
 * - the tablet's body goes away (the bezel, the pen, the sticky pad): only
 *   the page is left, on a thin paper card, with its handwriting and text;
 * - the page rises and floats in front of the viewer, a little larger and a
 *   little below eye level, facing the eyes; the note bar rides on its top
 *   edge and the formatting toolbar under its bottom edge. The headset's
 *   own keyboard (TypingSystem brings it up) types into it.
 *
 * The page can be moved by the grab bar under the toolbar (pinch it and
 * move the hand, as with a window in visionOS) and resized from its bottom
 * corners (pinch a corner's arc and pull it out or in). Switching back to
 * Write returns the page to the tablet, where it was. Closing the note
 * leaves Type mode at once.
 */

import {
  createSystem,
  DoubleSide,
  Euler,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RayInteractable,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
  type Entity,
  type Object3D,
  type UIKitMLAsset,
} from '@iwsdk/core';
import { SURFACE_HEIGHT_M, SURFACE_WIDTH_M, WRITING_SURFACE_NAME } from '../scene-assets/tablet.scene-asset.js';
import { faceViewer, makeDraggable } from '../ui/drag.js';
import { attachLiquidGlass, type LiquidGlass } from '../ui/liquid-glass.js';
import { getNoteView, type NoteViewState } from '../ui/note-view.js';
import { PanelBinding, panelSize, setVisible, UIKIT_PIXEL_M, type PanelElement } from '../ui/panel-helpers.js';
import { easeInOutCubic, getTweens, type Tweens } from '../ui/tweens.js';
import { getTyping, type TypingState } from '../ui/typing-state.js';

const TABLET_NODE = 'tablet';
const BAR_NODE = 'note-bar';
const TOOLBAR_NODE = 'type-toolbar';

/** The floating page: this far from the eyes, this far below eye level, this much larger than on the tablet. */
const FLOAT_DISTANCE_M = 0.55;
const FLOAT_BELOW_EYE_DEG = 9;
const FLOAT_SCALE = 1.5;
/** Resizing keeps the page between these scales. */
const MIN_SCALE = 0.8;
const MAX_SCALE = 2.2;
/** The paper card round the page (metres at scale 1). */
const CARD_MARGIN_M = 0.012;
const CARD_RADIUS_M = 0.012;
const CARD_DEPTH_M = 0.0025;
/** Gaps from the page's edges to the bar above and the toolbar below (metres, at the panels' own scale). */
const BAR_GAP_M = 0.022;
const TOOLBAR_GAP_M = 0.02;
/** The toolbar is never wider than the page times this (wider than the page, as Docs' is, so its buttons stay big enough to hit). */
const TOOLBAR_MAX_WIDTH = 1.4;
/**
 * How much the floating page lights itself (the tablet's page uses 0.12):
 * standing upright it catches less of the room's light than lying on a
 * desk, and text wants a bright page.
 */
const TYPE_PAGE_GLOW = 0.42;
/** Must match .toolbar border-radius in type-toolbar.uikitml. */
const TOOLBAR_RADIUS_PX = 28;
/** The corner arcs: their radius and thickness, and how far outside the page's corner they sit (metres at scale 1). */
const CORNER_RADIUS_M = 0.028;
const CORNER_TUBE_M = 0.0026;
const CORNER_OUTSET_M = 0.016;
const CORNER_REST_OPACITY = 0.5;
const CORNER_HOVER_OPACITY = 0.95;
/** Transitions (ms). */
const RISE_MS = 520;
const RETURN_MS = 420;

/** A pose to come back to. */
interface Pose {
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

/** The parts of a pmndrs pointer event the corner handles use. */
interface HandlePointerEvent {
  pointerId: number;
  point: Vector3;
  object: Object3D & { setPointerCapture?(id: number): void };
}

export class TypeModeSystem extends createSystem({}) {
  private typing!: TypingState;
  private noteView!: NoteViewState;
  private tweens!: Tweens;
  private tablet!: Object3D;
  private surface!: Mesh;
  private bar!: Object3D;
  private toolbar!: UIKitMLAsset;
  private toolbarEntity!: Entity;
  private toolbarRoot!: PanelElement;
  private toolbarRow!: PanelElement;
  private toolbarGlass!: LiquidGlass;
  /** The paper card and the corner handles, shown only in Type mode. */
  private readonly typeOnly: Object3D[] = [];
  /** Tablet parts put away while typing, with how they were. */
  private readonly hidden: Array<{ object: Object3D; visible: boolean; raycast: Object3D['raycast'] }> = [];
  private hidePending = false;
  /** Where the tablet and bar were before typing. */
  private tabletPose: Pose | null = null;
  private barPose: Pose | null = null;
  /** The page is in Type mode's place (or going there): the bar and toolbar follow it. */
  private staged = false;
  /** The page's own glow on the tablet, to restore. */
  private pageGlow = 0;
  private readonly head = new Vector3();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly fromPose: Pose = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() };
  private readonly toPose: Pose = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() };

  init(): void {
    const tablet = this.world.getSceneEntity(TABLET_NODE)?.object3D;
    const surface = tablet?.getObjectByName(WRITING_SURFACE_NAME);
    const bar = this.world.getSceneObject<UIKitMLAsset>(BAR_NODE);
    const toolbarEntity = this.world.getSceneEntity(TOOLBAR_NODE);
    const toolbar = this.world.getSceneObject<UIKitMLAsset>(TOOLBAR_NODE);
    if (!tablet || !(surface instanceof Mesh) || !bar || !toolbar || !toolbarEntity) {
      console.warn('[TypeModeSystem] The tablet, note bar or type toolbar is missing.');
      return;
    }
    this.tablet = tablet;
    this.surface = surface;
    this.bar = bar;
    this.toolbar = toolbar;
    this.toolbarEntity = toolbarEntity;
    this.typing = getTyping(this.world);
    this.noteView = getNoteView(this.world);
    this.tweens = getTweens(this.world);

    const ui = new PanelBinding(toolbar, this.cleanupFuncs);
    this.toolbarRoot = ui.element('type-toolbar-root');
    this.toolbarRow = ui.element('type-toolbar-row');
    this.toolbarGlass = attachLiquidGlass(this.toolbarRow, this.cleanupFuncs, {
      radiusPx: TOOLBAR_RADIUS_PX,
      bevelPx: 8,
      frostAlpha: 0.88,
      host: toolbar,
    });
    const grab = ui.element('type-toolbar-grab');
    makeDraggable(grab, grab, this.tablet, this.world, this.cleanupFuncs);

    this.buildCard();
    this.buildCornerHandles();
    this.showToolbar(false);

    this.cleanupFuncs.push(
      this.typing.subscribe((mode) => (mode === 'type' ? this.enter() : this.leave())),
      () => this.tweens.cancel('type-mode'),
    );
  }

  update(): void {
    if (!this.tablet) return;
    if (this.hidePending) {
      // A frame after entering, so every other system has finished reacting
      // to the switch (the pen settling at rest shows its shadow, for one).
      this.hidePending = false;
      this.hideTabletBody();
    }
    if (this.staged) this.placePanels();
  }

  // ------------------------------------------------------------ the modes

  private enter(): void {
    if (!this.noteView.isOpen) return;
    this.tweens.cancel('type-mode');
    this.tabletPose = savePose(this.tablet);
    this.barPose = savePose(this.bar);
    this.hidePending = true;
    this.staged = true;
    for (const object of this.typeOnly) object.visible = true;
    this.showToolbar(true);
    this.setPageGlow(true);

    this.floatingPose(this.toPose);
    copyPose(this.fromPose, this.tabletPose);
    this.tweens.play(RISE_MS, (t) => this.blendPose(easeInOutCubic(t)), { key: 'type-mode' });
  }

  private leave(): void {
    if (!this.tabletPose) return;
    const back = this.tabletPose;
    this.tabletPose = null;
    this.tweens.cancel('type-mode');
    this.showToolbar(false);
    for (const object of this.typeOnly) object.visible = false;
    if (!this.noteView.isOpen) {
      // The note was closed: everything goes back at once (the view is fading out).
      this.staged = false;
      this.hidePending = false;
      applyPose(this.tablet, back);
      if (this.barPose) applyPose(this.bar, this.barPose);
      this.restoreTabletBody();
      this.setPageGlow(false);
      return;
    }
    copyPose(this.fromPose, savePose(this.tablet));
    copyPose(this.toPose, back);
    this.tweens.play(RETURN_MS, (t) => this.blendPose(easeInOutCubic(t)), {
      key: 'type-mode',
      done: () => {
        this.staged = false;
        this.hidePending = false;
        this.restoreTabletBody();
        this.setPageGlow(false);
        if (this.barPose) applyPose(this.bar, this.barPose);
      },
    });
  }

  /** The floating page's pose: ahead of the eyes, a little low, facing them, larger. */
  private floatingPose(out: Pose): void {
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldQuaternion(out.quaternion);
    const yaw = this.euler.setFromQuaternion(out.quaternion, 'YXZ').y;
    const drop = Math.tan((FLOAT_BELOW_EYE_DEG * Math.PI) / 180) * FLOAT_DISTANCE_M;
    out.position.set(
      this.head.x - Math.sin(yaw) * FLOAT_DISTANCE_M,
      this.head.y - drop,
      this.head.z - Math.cos(yaw) * FLOAT_DISTANCE_M,
    );
    // Face the eyes (faceViewer works on an object: borrow the tablet's pose briefly).
    const saved = savePose(this.tablet);
    this.tablet.position.copy(out.position);
    faceViewer(this.tablet, this.world);
    out.quaternion.copy(this.tablet.quaternion);
    applyPose(this.tablet, saved);
    out.scale.setScalar(FLOAT_SCALE);
  }

  private blendPose(t: number): void {
    this.tablet.position.lerpVectors(this.fromPose.position, this.toPose.position, t);
    this.tablet.quaternion.slerpQuaternions(this.fromPose.quaternion, this.toPose.quaternion, t);
    this.tablet.scale.lerpVectors(this.fromPose.scale, this.toPose.scale, t);
  }

  // --------------------------------------------------- the page and panels

  /** The note bar on the page's top edge, the toolbar under its bottom edge, both in its plane. */
  private placePanels(): void {
    const scale = this.tablet.scale.x;
    this.tablet.updateMatrixWorld();
    const pageTop = (SURFACE_HEIGHT_M / 2 + CARD_MARGIN_M) * scale;
    const barHalf = ((panelSize(this.barRoot()).peek()?.[1] ?? 0) / 2) * UIKIT_PIXEL_M * this.bar.scale.y;
    this.placeInPagePlane(this.bar, pageTop + BAR_GAP_M + barHalf, scale);

    // The toolbar never runs wider than the page.
    const [widthPx, heightPx] = panelSize(this.toolbarRoot).peek() ?? [0, 0];
    if (widthPx > 0) {
      const fit = (SURFACE_WIDTH_M * scale * TOOLBAR_MAX_WIDTH) / (widthPx * UIKIT_PIXEL_M);
      this.toolbar.scale.setScalar(Math.min(this.toolbarBaseScale(), fit));
    }
    const toolbarHalf = (heightPx / 2) * UIKIT_PIXEL_M * this.toolbar.scale.y;
    this.placeInPagePlane(this.toolbar, -(pageTop + TOOLBAR_GAP_M + toolbarHalf), scale);
  }

  /** Put a panel `offsetY` metres above the page's centre (below, if negative), in the page's plane. */
  private placeInPagePlane(panel: Object3D, offsetY: number, scale: number): void {
    // tablet-local units are scaled: divide the world offset by the scale.
    panel.position.set(0, offsetY / scale, 0.004 / scale);
    this.tablet.localToWorld(panel.position);
    panel.quaternion.copy(this.tablet.quaternion);
  }

  private barRoot(): PanelElement {
    return (this.bar as UIKitMLAsset).getElementById('note-bar-root') as PanelElement;
  }

  private toolbarBaseScale(): number {
    return this.bar.scale.x;
  }

  private showToolbar(shown: boolean): void {
    setVisible(this.toolbarRoot, shown);
    this.toolbarGlass.setOpacity(shown ? 1 : 0);
    if (shown && !this.toolbarEntity.hasComponent(RayInteractable)) this.toolbarEntity.addComponent(RayInteractable);
    if (!shown && this.toolbarEntity.hasComponent(RayInteractable)) this.toolbarEntity.removeComponent(RayInteractable);
  }

  /** Light the page up for typing, or back to how the tablet shows it. */
  private setPageGlow(typing: boolean): void {
    const material = this.surface.material as MeshStandardMaterial;
    if (!('emissiveIntensity' in material)) return;
    if (typing) {
      this.pageGlow = material.emissiveIntensity;
      material.emissiveIntensity = TYPE_PAGE_GLOW;
    } else {
      material.emissiveIntensity = this.pageGlow;
    }
  }

  /** A thin paper card behind the page, so the floating page reads as a sheet, not a hole in space. */
  private buildCard(): void {
    const w = SURFACE_WIDTH_M + CARD_MARGIN_M * 2;
    const h = SURFACE_HEIGHT_M + CARD_MARGIN_M * 2;
    const shape = roundedRect(w, h, CARD_RADIUS_M);
    const card = new Mesh(
      new ShapeGeometry(shape, 6),
      new MeshStandardMaterial({ color: 0xf2ece3, roughness: 0.92, metalness: 0, side: DoubleSide }),
    );
    card.name = 'TypePageCard';
    card.position.z = -CARD_DEPTH_M;
    card.raycast = () => {};
    card.visible = false;
    this.surface.add(card);
    this.typeOnly.push(card);
    this.cleanupFuncs.push(() => {
      card.geometry.dispose();
      (card.material as MeshStandardMaterial).dispose();
    });
  }

  /** The two bottom corners' arcs: pinch one and pull to resize the page. */
  private buildCornerHandles(): void {
    const arc = new TorusGeometry(CORNER_RADIUS_M, CORNER_TUBE_M, 8, 20, Math.PI / 2);
    const hitArea = new PlaneGeometry(CORNER_RADIUS_M * 2.2, CORNER_RADIUS_M * 2.2);
    const hitMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.cleanupFuncs.push(() => {
      arc.dispose();
      hitArea.dispose();
      hitMaterial.dispose();
    });
    for (const side of [1, -1] as const) {
      const material = new MeshBasicMaterial({
        color: 0xfffaf2,
        transparent: true,
        opacity: CORNER_REST_OPACITY,
        depthWrite: false,
        toneMapped: false,
      });
      // The arc wraps round the corner, just outside the page.
      const cornerX = side * (SURFACE_WIDTH_M / 2 + CORNER_OUTSET_M);
      const cornerY = -(SURFACE_HEIGHT_M / 2 + CORNER_OUTSET_M);
      const handle = new Mesh(hitArea, hitMaterial);
      handle.name = side > 0 ? 'TypeResizeRight' : 'TypeResizeLeft';
      handle.position.set(cornerX - side * CORNER_RADIUS_M * 0.3, cornerY + CORNER_RADIUS_M * 0.3, 0.002);
      const ring = new Mesh(arc, material);
      ring.raycast = () => {};
      // The quarter torus runs 0° to 90°: turn it to the bottom-right (or bottom-left) quarter.
      ring.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI;
      ring.position.set(cornerX - side * CORNER_RADIUS_M - handle.position.x, cornerY + CORNER_RADIUS_M - handle.position.y, 0);
      handle.add(ring);
      handle.visible = false;
      this.surface.add(handle);
      this.typeOnly.push(handle);
      this.cleanupFuncs.push(() => material.dispose());
      this.makeResizable(handle, material);
    }
  }

  /** Pull a corner away from the page's centre to grow it, toward it to shrink it. */
  private makeResizable(handle: Mesh, material: MeshBasicMaterial): void {
    let pointer: number | null = null;
    let startDistance = 1;
    let startScale = 1;
    const centre = new Vector3();
    const target = handle as unknown as {
      addEventListener(type: string, listener: (event: HandlePointerEvent) => void): void;
      removeEventListener(type: string, listener: (event: HandlePointerEvent) => void): void;
    };
    const down = (event: HandlePointerEvent) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      this.surface.getWorldPosition(centre);
      startDistance = Math.max(0.05, event.point.distanceTo(centre));
      startScale = this.tablet.scale.x;
      event.object.setPointerCapture?.(event.pointerId);
      material.opacity = CORNER_HOVER_OPACITY;
    };
    const move = (event: HandlePointerEvent) => {
      if (event.pointerId !== pointer) return;
      const scale = (startScale * event.point.distanceTo(centre)) / startDistance;
      this.tablet.scale.setScalar(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)));
    };
    const end = (event: HandlePointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      material.opacity = CORNER_REST_OPACITY;
    };
    const enter = () => (material.opacity = CORNER_HOVER_OPACITY);
    const leave = () => {
      if (pointer === null) material.opacity = CORNER_REST_OPACITY;
    };
    const handlers = [
      ['pointerdown', down],
      ['pointermove', move],
      ['pointerup', end],
      ['pointercancel', end],
      ['pointerenter', enter],
      ['pointerleave', leave],
    ] as const;
    for (const [type, handler] of handlers) target.addEventListener(type, handler as (event: HandlePointerEvent) => void);
    this.cleanupFuncs.push(() => {
      for (const [type, handler] of handlers) target.removeEventListener(type, handler as (event: HandlePointerEvent) => void);
    });
  }

  /** Put the tablet's body away (everything but the page, its ink and text, and Type mode's own parts). */
  private hideTabletBody(): void {
    this.hidden.length = 0;
    const keep = new Set<Object3D>([this.surface, ...this.typeOnly]);
    const visit = (object: Object3D) => {
      if (keep.has(object)) return;
      if (object !== this.tablet && (object as Mesh).isMesh) {
        this.hidden.push({ object, visible: object.visible, raycast: object.raycast });
        object.visible = false;
        // Hidden meshes still take rays: these must not.
        object.raycast = () => {};
      }
      for (const child of object.children) visit(child);
    };
    visit(this.tablet);
  }

  private restoreTabletBody(): void {
    for (const { object, visible, raycast } of this.hidden) {
      object.visible = visible;
      object.raycast = raycast;
    }
    this.hidden.length = 0;
  }
}

function savePose(object: Object3D): Pose {
  return { position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() };
}

function copyPose(out: Pose, from: Pose): void {
  out.position.copy(from.position);
  out.quaternion.copy(from.quaternion);
  out.scale.copy(from.scale);
}

function applyPose(object: Object3D, pose: Pose): void {
  object.position.copy(pose.position);
  object.quaternion.copy(pose.quaternion);
  object.scale.copy(pose.scale);
}

function roundedRect(w: number, h: number, r: number): Shape {
  const x = -w / 2;
  const y = -h / 2;
  const shape = new Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}
