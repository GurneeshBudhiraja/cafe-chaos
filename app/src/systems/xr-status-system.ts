/**
 * XrStatusSystem: XR entry/exit buttons and the device feature readout.
 *
 * XR means an immersive WebXR session (headset view with passthrough in
 * mixed reality). On desktop, IWER (IWSDK's browser XR emulator) provides a
 * simulated Quest 3 so the same session can be tested without a headset.
 * See https://iwsdk.dev/guides/02-testing-experience.html.
 *
 * Feature checks are optional by design: every feature is requested as
 * optional in iwsdk.config.json, and the app stays usable without it. This
 * system only reports what the current session actually granted.
 */

import {
  createSystem,
  VisibilityState,
  type UIKit,
  type UIKitMLAsset,
} from '@iwsdk/core';
import { PanelBinding, setText, setVisible } from '../ui/panel-helpers.js';

const TOOLS_PANEL_NODE = 'tools-panel';

/** WebXR feature descriptors we report on, mapped to their readout ids. */
const REPORTED_FEATURES = [
  { feature: 'hand-tracking', elementId: 'feature-hands' },
  { feature: 'plane-detection', elementId: 'feature-planes' },
  { feature: 'anchors', elementId: 'feature-anchors' },
] as const;

export class XrStatusSystem extends createSystem({}) {
  init(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>(TOOLS_PANEL_NODE);
    if (!panel) return;
    const ui = new PanelBinding(panel, this.cleanupFuncs);

    const enter = ui.onClick('xr-enter-button', () => this.world.launchXR());
    const exit = ui.onClick('xr-exit-button', () => this.world.exitXR());
    const readouts = REPORTED_FEATURES.map(({ feature, elementId }) => ({
      feature,
      text: ui.text(elementId),
    }));

    if (!this.world.xrEnabled) {
      setVisible(enter, false);
      setVisible(exit, false);
    }

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const inXr = state !== VisibilityState.NonImmersive;
        if (this.world.xrEnabled) {
          setVisible(enter, !inXr);
          setVisible(exit, inXr);
        }
        this.reportFeatures(readouts, inXr);
      }),
    );
  }

  private reportFeatures(
    readouts: Array<{ feature: string; text: UIKit.Text }>,
    inXr: boolean,
  ): void {
    const session = this.renderer.xr.getSession();
    const granted: readonly string[] = session?.enabledFeatures ?? [];
    for (const { feature, text } of readouts) {
      if (!inXr || !session) {
        setText(text, 'Enter XR to check');
      } else {
        setText(text, granted.includes(feature) ? 'Available' : 'Not available');
      }
    }
  }
}
