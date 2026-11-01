/**
 * ToastSystem: draws the current toast (src/ui/toasts.ts) as one slim glass
 * line at the top centre of the view, apart from the app.
 *
 * Where: about a metre out, straight ahead in the direction the head faces
 * and a little above eye level: the top centre of the view, above the dock
 * and its pop-ups (which sit below the gaze), and not at the blurry edge of
 * the lenses (a top-right corner is easy to miss in a headset). Quest's own
 * system messages appear in this region, so the eye already looks there.
 * It turns with the head but does not tilt with it, so looking down at a
 * panel never brings a toast onto it. When the dock is in front, the toast
 * rises as needed to keep a clear gap above it, so the two never touch.
 * It drifts lazily after the head, so a turn brings it along without it
 * swimming with every small movement. It slides down into place while
 * fading in, holds, then fades away (sticky toasts stay until dismissed).
 */

import { createSystem, Euler, Quaternion, Vector3, type Object3D, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { attachLiquidGlass, type LiquidGlass } from '../ui/liquid-glass.js';
import {
  addStateColors,
  elementWorldPosition,
  PanelBinding,
  panelSize,
  setText,
  setVisible,
  type PanelElement,
  type StateColors,
  UIKIT_PIXEL_M,
} from '../ui/panel-helpers.js';
import { addPressMotion } from '../ui/press-motion.js';
import { THEME } from '../ui/theme.js';
import { playUiSound } from '../ui/ui-sounds.js';
import { getToasts, type Toast, type ToastKind, type ToastService } from '../ui/toasts.js';
import { easeInCubic, easeOutCubic, getTweens, type Tweens } from '../ui/tweens.js';

const TOAST_NODE = 'toast';
/** Half the line's height in UIKit pixels: its corner radius (.toast). */
const RADIUS_PX = 24;
/** Metres out, and degrees above eye level (the horizon, not the gaze). */
const DISTANCE_M = 1.0;
const ABOVE_EYE_LEVEL_DEG = 10;
/** The dock's scene node, and the clear gap kept above its buttons (degrees). */
const DOCK_NODE = 'compact-dock';
const DOCK_GAP_DEG = 3;
/** Only a dock within this many degrees of straight ahead pushes the toast up. */
const DOCK_IN_FRONT_DEG = 45;
const DEG = Math.PI / 180;
/** Slides down this far (metres) while fading in. */
const DROP_M = 0.03;
/** How quickly it catches up with the head (per second, on the UI clock). */
const FOLLOW_RATE = 4;
const SHOW_MS = 360;
const HIDE_MS = 220;
const HOLD_MS = 3200;

const ICON_COLORS: Record<ToastKind, string> = {
  info: THEME.clay,
  done: '#8fd1a9',
  error: '#f0897d',
};
const ACTION_STATES: StateColors = { rest: THEME.ink, hover: '#ffffff', pressed: '#e9e2d8' };
const FORWARD = new Vector3(0, 0, -1);

export class ToastSystem extends createSystem({}) {
  private toasts!: ToastService;
  private tweens!: Tweens;
  private panel!: Object3D;
  private baseScale = 1;
  private root!: PanelElement;
  private glass!: LiquidGlass;
  private icons!: Record<ToastKind, PanelElement>;
  private badge!: PanelElement;
  private title!: UIKit.Text;
  private body!: UIKit.Text;
  private action!: PanelElement;
  private actionLabel!: UIKit.Text;
  private shown: Toast | null = null;
  /** True while visible or fading out: the toast keeps following the head. */
  private active = false;
  /** 1 at the start of the slide-in (raised by DROP_M), 0 in place. */
  private lift = 0;
  /** Snap to the head on the next placement instead of easing there. */
  private snap = true;
  private readonly headPosition = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly target = new Vector3();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  /** The toast's orientation: the head's yaw, tipped to face the eyes. */
  private readonly facing = new Quaternion();
  /** The dock's root and button row, to keep clear of; null without a dock. */
  private dockRoot: PanelElement | null = null;
  private dockRow: PanelElement | null = null;
  private dockPanel: Object3D | null = null;
  private readonly dockTop = new Vector3();

  init(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>(TOAST_NODE);
    if (!panel) return;
    this.panel = panel;
    this.baseScale = panel.scale.x;
    this.toasts = getToasts(this.world);
    this.tweens = getTweens(this.world);

    const ui = new PanelBinding(panel, this.cleanupFuncs);
    this.root = ui.element('toast-root');
    this.glass = attachLiquidGlass(this.root, this.cleanupFuncs, {
      radiusPx: RADIUS_PX,
      bevelPx: 8,
      frostAlpha: 0.88,
      host: panel,
    });
    this.badge = ui.element('toast-badge');
    this.icons = {
      info: ui.element('toast-icon-info'),
      done: ui.element('toast-icon-done'),
      error: ui.element('toast-icon-error'),
    };
    this.title = ui.text('toast-title');
    this.body = ui.text('toast-body');
    this.actionLabel = ui.text('toast-action-label');
    this.action = ui.onClick('toast-action', () => {
      const toast = this.shown;
      toast?.action?.run();
      this.toasts.dismiss(toast ?? undefined);
    });
    addStateColors(this.action, ACTION_STATES, this.cleanupFuncs);
    addPressMotion(this.action, this.tweens, this.cleanupFuncs);

    const dock = this.world.getSceneObject<UIKitMLAsset>(DOCK_NODE);
    if (dock) {
      this.dockPanel = dock;
      this.dockRoot = dock.getElementById('dock-root') ?? null;
      this.dockRow = dock.getElementById('dock-row') ?? null;
    }

    setVisible(this.root, false);
    this.cleanupFuncs.push(
      this.toasts.subscribe((toast) => (toast ? this.present(toast) : this.hide())),
      () => this.tweens.cancel('toast-hold'),
    );
  }

  update(delta: number): void {
    if (this.active) this.place(delta);
  }

  // ------------------------------------------------------------- rendering

  private present(toast: Toast): void {
    const replacing = this.shown !== null;
    this.shown = toast;
    this.active = true;
    this.tweens.cancel('toast-hold');
    for (const kind of Object.keys(this.icons) as ToastKind[]) {
      setVisible(this.icons[kind], kind === toast.kind);
    }
    this.badge.setProperties({ color: ICON_COLORS[toast.kind] });
    setText(this.title, toast.title);
    setText(this.body, toast.body ?? '');
    setVisible(this.body as unknown as PanelElement, Boolean(toast.body));
    setVisible(this.action, Boolean(toast.action));
    if (toast.action) setText(this.actionLabel, toast.action.label);
    setVisible(this.root, true);
    if (!replacing) {
      this.snap = true;
      playUiSound('toast');
    }

    // Slide down and fade in (a replacement only refreshes in place).
    this.tweens.play(
      SHOW_MS,
      (t) => {
        const e = easeOutCubic(t);
        this.lift = replacing ? 0 : 1 - e;
        this.setFade(replacing ? 1 : e);
      },
      { key: 'toast' },
    );
    if (!toast.sticky) {
      // On the UI animation clock (like the fades), so it scales with them.
      this.tweens.play(HOLD_MS + SHOW_MS, () => {}, {
        key: 'toast-hold',
        done: () => this.toasts.dismiss(toast),
      });
    }
  }

  private hide(): void {
    this.tweens.cancel('toast-hold');
    if (!this.shown) return;
    this.shown = null;
    this.tweens.play(HIDE_MS, (t) => this.setFade(1 - easeInCubic(t)), {
      key: 'toast',
      done: () => {
        setVisible(this.root, false);
        this.active = false;
      },
    });
  }

  private setFade(opacity: number): void {
    this.root.setProperties({ opacity } as Record<string, unknown>);
    this.glass.setOpacity(opacity);
    this.panel.scale.setScalar(this.baseScale * (0.96 + 0.04 * opacity));
  }

  // ------------------------------------------------------------- placement

  /** Ease toward the top centre of the view, facing the eyes. */
  private place(delta: number): void {
    // The camera is the viewer's eyes in XR and on desktop alike.
    const head = this.world.camera;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    // Yaw only: straight ahead of where the head faces, level with the eyes.
    const yaw = this.euler.setFromQuaternion(this.headQuaternion, 'YXZ').y;
    const pitch = Math.max(ABOVE_EYE_LEVEL_DEG * DEG, this.pitchClearOfDock(yaw));
    this.facing.setFromEuler(this.euler.set(pitch, yaw, 0, 'YXZ'));
    this.target
      .copy(FORWARD)
      .applyQuaternion(this.facing)
      .multiplyScalar(DISTANCE_M)
      .add(this.headPosition);
    this.target.y += this.lift * DROP_M;
    if (this.snap) {
      this.panel.position.copy(this.target);
      this.panel.quaternion.copy(this.facing);
      this.snap = false;
      return;
    }
    const rate = FOLLOW_RATE * getTweens(this.world).timeScale;
    const k = 1 - Math.exp(-delta * rate);
    this.panel.position.lerp(this.target, k);
    this.panel.quaternion.slerp(this.facing, k);
  }

  /**
   * The lowest pitch (radians above the horizon) at which the toast's bottom
   * edge clears the dock's buttons by DOCK_GAP_DEG, or -Infinity when the
   * dock is hidden or not in front.
   */
  private pitchClearOfDock(yaw: number): number {
    const row = this.dockRow;
    const dock = this.dockPanel;
    if (!row || !dock || !this.dockRoot?.isVisible.peek()) return -Infinity;
    // The top of the button row, in world space.
    elementWorldPosition(row, this.dockTop);
    const rowHeightPx = panelSize(row).peek()?.[1] ?? 0;
    this.dockTop.y += (rowHeightPx / 2) * UIKIT_PIXEL_M * dock.scale.y;
    const dx = this.dockTop.x - this.headPosition.x;
    const dz = this.dockTop.z - this.headPosition.z;
    // Yaw as Three measures it: 0 faces -Z, positive turns left.
    const off = Math.atan2(-dx, -dz) - yaw;
    if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > DOCK_IN_FRONT_DEG * DEG) return -Infinity;
    const dockTop = Math.atan2(this.dockTop.y - this.headPosition.y, Math.hypot(dx, dz));
    const toastHeightPx = panelSize(this.root).peek()?.[1] ?? 0;
    const halfToast = Math.atan((toastHeightPx / 2) * UIKIT_PIXEL_M * this.baseScale / DISTANCE_M);
    return dockTop + DOCK_GAP_DEG * DEG + halfToast;
  }
}
