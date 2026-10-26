/**
 * ToastSystem: draws the current toast (src/ui/toasts.ts) on a glass
 * capsule just above whichever home surface is showing: the window's top
 * edge, or above the dock. It rises into place while fading in, holds, then
 * fades away (sticky toasts stay). While shown it keeps its place relative
 * to that surface, so it travels with a dragged or pinned window.
 */

import { createSystem, Vector3, type Object3D, type UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { getHomeMode, type HomeModeState, WINDOW_GLASS_NAME } from '../ui/home-mode.js';
import { attachLiquidGlass, type LiquidGlass } from '../ui/liquid-glass.js';
import {
  addStateColors,
  PanelBinding,
  setText,
  setVisible,
  type PanelElement,
  type StateColors,
} from '../ui/panel-helpers.js';
import { addPressMotion } from '../ui/press-motion.js';
import { THEME } from '../ui/theme.js';
import { playUiSound } from '../ui/ui-sounds.js';
import { getToasts, type Toast, type ToastKind, type ToastService } from '../ui/toasts.js';
import { easeInCubic, easeOutBack, easeOutCubic, getTweens, type Tweens } from '../ui/tweens.js';

const TOAST_NODE = 'toast';
const WINDOW_NODE = 'home-window';
const DOCK_NODE = 'compact-dock';
/** Half the capsule height in UIKit pixels: its corner radius. */
const RADIUS_PX = 40;
/**
 * Metres: the gap above the window's top edge; the lift above the dock's
 * origin (its bottom edge), measured to clear the button row;
 * and toward the viewer.
 */
const WINDOW_GAP_M = 0.09;
const DOCK_LIFT_M = 0.48;
const FORWARD_M = 0.02;
/** Rises this far (metres) while fading in. */
const RISE_M = 0.025;
const SHOW_MS = 360;
const HIDE_MS = 220;
const HOLD_MS = 3200;

const BADGE_COLORS: Record<ToastKind, { background: string; color: string }> = {
  info: { background: 'rgba(212, 112, 79, 0.18)', color: THEME.clay },
  done: { background: 'rgba(124, 196, 154, 0.16)', color: '#8fd1a9' },
  error: { background: 'rgba(240, 133, 122, 0.16)', color: '#f0897d' },
};
const ACTION_STATES: StateColors = { rest: THEME.ink, hover: '#ffffff', pressed: '#e9e2d8' };

export class ToastSystem extends createSystem({}) {
  private toasts!: ToastService;
  private homeMode!: HomeModeState;
  private tweens!: Tweens;
  private panel!: Object3D;
  private baseScale = 1;
  private windowPanel: Object3D | null = null;
  /** The window's glass mesh (its scale is the window's size), found lazily. */
  private windowGlass: Object3D | null = null;
  private dockPanel: Object3D | null = null;
  private root!: PanelElement;
  private glass!: LiquidGlass;
  private icons!: Record<ToastKind, PanelElement>;
  private badge!: PanelElement;
  private title!: UIKit.Text;
  private body!: UIKit.Text;
  private action!: PanelElement;
  private actionLabel!: UIKit.Text;
  private shown: Toast | null = null;
  /** 0 at rest in place; 1 lowered by RISE_M (the start of the rise). */
  private drop = 0;
  private readonly anchor = new Vector3();
  private readonly offset = new Vector3();

  init(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>(TOAST_NODE);
    if (!panel) return;
    this.panel = panel;
    this.baseScale = panel.scale.x;
    this.toasts = getToasts(this.world);
    this.homeMode = getHomeMode(this.world);
    this.tweens = getTweens(this.world);
    this.windowPanel = this.world.getSceneObject(WINDOW_NODE) ?? null;
    this.dockPanel = this.world.getSceneObject(DOCK_NODE) ?? null;

    const ui = new PanelBinding(panel, this.cleanupFuncs);
    this.root = ui.element('toast-root');
    this.glass = attachLiquidGlass(this.root, this.cleanupFuncs, {
      radiusPx: RADIUS_PX,
      bevelPx: 12,
      frostAlpha: 0.86,
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

    setVisible(this.root, false);
    this.cleanupFuncs.push(
      this.toasts.subscribe((toast) => (toast ? this.present(toast) : this.hide())),
      () => this.clearHold(),
    );
  }

  update(): void {
    if (this.shown || this.drop < 1) this.place();
  }

  // ------------------------------------------------------------- rendering

  private present(toast: Toast): void {
    const replacing = this.shown !== null;
    this.shown = toast;
    this.clearHold();
    for (const kind of Object.keys(this.icons) as ToastKind[]) {
      setVisible(this.icons[kind], kind === toast.kind);
    }
    const colors = BADGE_COLORS[toast.kind];
    this.badge.setProperties({ backgroundColor: colors.background, color: colors.color });
    setText(this.title, toast.title);
    setText(this.body, toast.body ?? '');
    setVisible(this.body as unknown as PanelElement, Boolean(toast.body));
    setVisible(this.action, Boolean(toast.action));
    if (toast.action) setText(this.actionLabel, toast.action.label);
    setVisible(this.root, true);
    if (!replacing) playUiSound('toast');

    // Rise and fade in (a replacement only pops, it is already in place).
    const fromDrop = replacing ? 0.4 : 1;
    this.tweens.play(
      SHOW_MS,
      (t) => {
        this.drop = fromDrop * (1 - easeOutCubic(t));
        const scale = 0.94 + 0.06 * easeOutBack(t);
        this.setFade(replacing ? 1 : easeOutCubic(t), scale);
      },
      { key: 'toast' },
    );
    if (!toast.sticky) {
      // On the UI animation clock (like the fades), so it pauses and scales with them.
      this.tweens.play(HOLD_MS + SHOW_MS, () => {}, {
        key: 'toast-hold',
        done: () => this.toasts.dismiss(toast),
      });
    }
  }

  private hide(): void {
    this.clearHold();
    if (!this.shown) return;
    this.shown = null;
    this.tweens.play(
      HIDE_MS,
      (t) => this.setFade(1 - easeInCubic(t), 1 - 0.04 * easeInCubic(t)),
      {
        key: 'toast',
        done: () => {
          setVisible(this.root, false);
          this.drop = 1;
        },
      },
    );
  }

  private setFade(opacity: number, scale: number): void {
    this.root.setProperties({ opacity } as Record<string, unknown>);
    this.glass.setOpacity(opacity);
    this.panel.scale.setScalar(this.baseScale * scale);
  }

  private clearHold(): void {
    this.tweens.cancel('toast-hold');
  }

  // ------------------------------------------------------------- placement

  /** Above the window's top edge, or above the dock, a little nearer. */
  private place(): void {
    const compact = this.homeMode.mode === 'compact';
    const surface = compact ? this.dockPanel : this.windowPanel;
    if (!surface) return;
    this.panel.quaternion.copy(surface.quaternion);
    this.anchor.copy(surface.position);
    let up = DOCK_LIFT_M;
    this.windowGlass ??= this.windowPanel?.getObjectByName(WINDOW_GLASS_NAME) ?? null;
    if (!compact && this.windowGlass) {
      // The glass plane's world scale is the window's size in metres (it
      // only yaws, so the matrix's Y column length is its height).
      this.windowGlass.getWorldPosition(this.anchor);
      up = this.windowGlass.matrixWorld.elements[5] / 2 + WINDOW_GAP_M;
    }
    up -= this.drop * RISE_M;
    this.offset.set(0, up, FORWARD_M).applyQuaternion(surface.quaternion);
    this.panel.position.copy(this.anchor).add(this.offset);
  }
}
