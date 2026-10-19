/**
 * CameraCaptureSystem: the camera trial (start, preview, capture one still).
 *
 * Uses IWSDK's camera support: adding a `CameraSource` component makes
 * IWSDK's CameraSystem open the stream through the browser media API
 * (`navigator.mediaDevices`), and `CameraUtils.captureFrame` copies one frame
 * into a canvas. See https://iwsdk.dev/guides/13-camera-access.html.
 *
 * Privacy rules from the product plan:
 * - The camera opens only after the user presses Start camera.
 * - Status text always shows when the camera is active.
 * - The camera stops after a capture or when the user presses Stop.
 *
 * Status: on desktop this proves the shared capture flow with a webcam. Quest
 * outward-camera access stays unverified until it is tested on a headset.
 */

import {
  CameraFacing,
  CameraSource,
  CameraState,
  CameraUtils,
  CanvasTexture,
  createSystem,
  SRGBColorSpace,
  type CameraDeviceInfo,
  type Entity,
  type Texture,
  type UIKit,
  type UIKitMLAsset,
} from '@iwsdk/core';
import {
  PanelBinding,
  setText,
  setVisible,
  type PanelElement,
} from '../ui/panel-helpers.js';
import { devLog } from '../util/dev-log.js';

/** Scene node id of the panel that hosts the camera controls. */
const TOOLS_PANEL_NODE = 'tools-panel';

/** The most recent still image, kept for inserting into a note later. */
export interface CapturedStill {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  deviceLabel: string;
  capturedAt: number;
}

type CameraUiState = 'off' | 'starting' | 'live' | 'captured' | 'error';

export class CameraCaptureSystem extends createSystem({}) {
  lastCapture: CapturedStill | null = null;

  private cameraEntity: Entity | null = null;
  private device: CameraDeviceInfo | null = null;
  private lastSourceState: string | null = null;
  private stillTexture: Texture | null = null;

  private status!: UIKit.Text;
  private featureCamera!: UIKit.Text;
  private preview!: PanelElement;
  private startButton!: PanelElement;
  private captureButton!: PanelElement;
  private stopButton!: PanelElement;

  init(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>(TOOLS_PANEL_NODE);
    if (!panel) {
      console.warn('[CameraCaptureSystem] Tools panel missing; camera UI off.');
      return;
    }
    const ui = new PanelBinding(panel, this.cleanupFuncs);
    this.status = ui.text('camera-status');
    this.featureCamera = ui.text('feature-camera');
    this.preview = ui.element('camera-preview');
    this.startButton = ui.onClick('camera-start-button', () => void this.startCamera());
    this.captureButton = ui.onClick('camera-capture-button', () => this.captureStill());
    this.stopButton = ui.onClick('camera-stop-button', () => this.stopCamera());
    this.cleanupFuncs.push(() => this.stopCamera());

    this.setUiState('off', 'Camera is off. Start it to take a still image.');
    void this.reportCapability();
  }

  update(): void {
    // Follow IWSDK's CameraSource state machine for the one camera we own.
    const entity = this.cameraEntity;
    if (!entity) return;
    const state = entity.getValue(CameraSource, 'state') as string;
    if (state === this.lastSourceState) return;
    this.lastSourceState = state;

    devLog('camera', `source state: ${state}`);
    if (state === CameraState.Active) {
      const texture = entity.getValue(CameraSource, 'texture') as Texture | null;
      if (texture) this.preview.setProperties({ src: texture });
      this.setUiState('live', `Camera on: ${this.deviceName()}. Press Capture.`);
      setText(this.featureCamera, 'Active');
    } else if (state === CameraState.Error) {
      this.removeCameraEntity();
      this.setUiState(
        'error',
        'The camera could not start. Check that no other app uses it, then try again.',
      );
      setText(this.featureCamera, 'Failed');
    }
  }

  /** Ask for permission, choose a camera, and open its stream. */
  private async startCamera(): Promise<void> {
    if (this.cameraEntity) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setUiState('error', 'This browser does not provide camera access.');
      setText(this.featureCamera, 'Unavailable');
      return;
    }

    this.setUiState('starting', 'Asking for camera permission...');
    let devices: CameraDeviceInfo[];
    try {
      // Triggers the browser permission prompt on first use.
      devices = await CameraUtils.getDevices(true);
    } catch (error) {
      this.handleStartError(error);
      return;
    }
    if (devices.length === 0) {
      this.setUiState('error', 'No camera was found on this device.');
      setText(this.featureCamera, 'No camera');
      return;
    }

    this.device = chooseSceneCamera(devices);
    devLog(
      'camera',
      `${devices.length} camera(s): ${devices.map((d) => `${d.label} [${d.facing}]`).join(', ')}; using "${this.deviceName()}"`,
    );
    this.lastSourceState = null;
    this.cameraEntity = this.world.createEntity();
    this.cameraEntity.addComponent(CameraSource, {
      deviceId: this.device.deviceId,
      facing: this.device.facing,
    });
    this.setUiState('starting', `Starting ${this.deviceName()}...`);
  }

  /** Copy the current frame into a still image, then turn the camera off. */
  private captureStill(): void {
    const entity = this.cameraEntity;
    const canvas = entity ? CameraUtils.captureFrame(entity) : null;
    if (!canvas) {
      this.setUiState('error', 'No camera frame was ready. Try Capture again.');
      return;
    }

    this.lastCapture = {
      canvas,
      width: canvas.width,
      height: canvas.height,
      deviceLabel: this.deviceName(),
      capturedAt: Date.now(),
    };
    devLog('camera', `captured ${canvas.width}x${canvas.height} from "${this.deviceName()}"`);
    this.stillTexture?.dispose();
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.stillTexture = texture;
    this.preview.setProperties({ src: texture });

    this.removeCameraEntity();
    setText(this.featureCamera, 'Allowed');
    this.setUiState(
      'captured',
      `Captured a ${canvas.width} x ${canvas.height} still. Camera is off.`,
    );
  }

  private stopCamera(): void {
    if (!this.cameraEntity) return;
    this.removeCameraEntity();
    this.preview.setProperties({ src: this.stillTexture ?? undefined });
    this.setUiState('off', 'Camera is off. Start it to take a still image.');
  }

  /** Removing CameraSource makes IWSDK stop the stream and free the device. */
  private removeCameraEntity(): void {
    // dispose() (not destroy()) also releases GPU resources.
    this.cameraEntity?.dispose();
    this.cameraEntity = null;
    this.lastSourceState = null;
  }

  private handleStartError(error: unknown): void {
    const name = error instanceof DOMException ? error.name : '';
    devLog('camera', `start failed: ${name || String(error)}`);
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      this.setUiState(
        'error',
        'Camera permission was denied. Allow camera access in the browser settings, then try again.',
      );
      setText(this.featureCamera, 'Denied');
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      this.setUiState('error', 'No camera was found on this device.');
      setText(this.featureCamera, 'No camera');
    } else {
      this.setUiState('error', 'The camera could not start. Try again.');
      setText(this.featureCamera, 'Failed');
    }
  }

  /** Initial capability report, without opening the camera. */
  private async reportCapability(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setText(this.featureCamera, 'Unavailable');
      return;
    }
    const granted = await CameraUtils.hasPermission();
    setText(this.featureCamera, granted ? 'Allowed' : 'Ask on use');
  }

  private setUiState(state: CameraUiState, message: string): void {
    setText(this.status, message);
    setVisible(this.startButton, state === 'off' || state === 'captured' || state === 'error');
    setVisible(this.captureButton, state === 'live');
    setVisible(this.stopButton, state === 'live' || state === 'starting');
  }

  private deviceName(): string {
    return this.device?.label || 'camera';
  }
}

/**
 * Prefer an outward-facing ("back"/"environment") camera, which is the source
 * intended for capturing the physical scene. Fall back to the first camera so
 * desktop webcams still work during development.
 */
function chooseSceneCamera(devices: CameraDeviceInfo[]): CameraDeviceInfo {
  return CameraUtils.findByFacing(devices, CameraFacing.Back) ?? devices[0];
}
