/**
 * RenderBudgetSystem: keeps each frame cheap enough for the headset to
 * hold its frame rate (a missed frame is what shows as judder and
 * smearing when the head moves).
 *
 * - The shadow map is only redrawn when it would change. The house light
 *   and everything that casts a shadow belong to the café and stand still
 *   inside it, so the map is redrawn when the café itself moves, turns or
 *   is resized, and whenever something asks (`touchShadows`), not on
 *   every frame.
 * - The session is asked for a steady 72 Hz where the headset allows a
 *   choice: a frame rate the café can hold beats a higher one it misses.
 * - With `?fps` in the address, a small readout by the café shows the
 *   frames per second actually reached, for testing on the headset.
 */

import { CanvasTexture, createSystem, Matrix4, Sprite, SpriteMaterial, Vector3 } from '@iwsdk/core';
import { CafeSystem } from './cafe-system.js';

/** The refresh rate asked of the headset (Hz). */
export const TARGET_HZ = 72;
/** After a change, keep redrawing the shadow map for this many frames (materials and textures may still be settling). */
const SETTLE_FRAMES = 3;
/** The readout refreshes this often (seconds). */
const READOUT_EVERY = 0.5;

/** A session that can report and set its refresh rate (Quest Browser). */
type RateSession = XRSession & { supportedFrameRates?: Float32Array; updateTargetFrameRate?: (hz: number) => Promise<void> };

export class RenderBudgetSystem extends createSystem({}) {
  /** Frames per second over the last half second (0 until measured). */
  fps = 0;
  /** How many times the shadow map has been redrawn (for the checks). */
  shadowDraws = 0;
  private readonly last = new Matrix4();
  private settle = SETTLE_FRAMES;
  private furniture = -1;
  private session: XRSession | null = null;
  private frames = 0;
  private elapsed = 0;
  private readout: { sprite: Sprite; canvas: HTMLCanvasElement; texture: CanvasTexture } | null = null;
  private readonly spot = new Vector3();

  init(): void {
    this.world.renderer.shadowMap.autoUpdate = false;
    this.world.renderer.shadowMap.needsUpdate = true;
    if (new URLSearchParams(location.search).has('fps')) this.readout = makeReadout();
    if (this.readout) this.world.createTransformEntity(this.readout.sprite);
  }

  /** Ask for the shadow map to be redrawn (something that casts a shadow has changed). */
  touchShadows(frames = SETTLE_FRAMES): void {
    this.settle = Math.max(this.settle, frames);
  }

  update(delta: number): void {
    const system = this.world.getSystem(CafeSystem);
    const cafe = system?.cafe;
    // The annex rising out of the plate casts a changing shadow; and the furniture changed (a table shown or hidden, the
    // café swapped for the other) casts a new one.
    if (system?.annex && system.annex.rising < 1) this.touchShadows();
    if (system && system.furniture !== this.furniture) {
      this.furniture = system.furniture;
      this.touchShadows();
    }
    this.keepShadows(cafe?.matrixWorld);
    this.keepRate();
    this.measure(delta, cafe?.position);
  }

  /** Redraw the shadow map only when the café has moved or something asked. */
  private keepShadows(matrix: Matrix4 | undefined): void {
    if (matrix && !matrix.equals(this.last)) {
      this.last.copy(matrix);
      this.settle = Math.max(this.settle, SETTLE_FRAMES);
    }
    if (this.settle <= 0) return;
    this.settle--;
    this.world.renderer.shadowMap.needsUpdate = true;
    this.shadowDraws++;
  }

  /** On a new session, ask for the target refresh rate if the headset offers it. */
  private keepRate(): void {
    const session = this.world.renderer.xr.getSession() as RateSession | null;
    if (session === this.session) return;
    this.session = session;
    this.touchShadows();
    if (!session?.updateTargetFrameRate || !session.supportedFrameRates) return;
    if (Array.from(session.supportedFrameRates).includes(TARGET_HZ)) session.updateTargetFrameRate(TARGET_HZ).catch(() => {});
  }

  private measure(delta: number, cafe: Vector3 | undefined): void {
    this.frames++;
    this.elapsed += delta;
    if (this.elapsed < READOUT_EVERY) return;
    this.fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    const readout = this.readout;
    if (!readout) return;
    const ctx = readout.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, readout.canvas.width, readout.canvas.height);
    ctx.fillStyle = 'rgba(20,14,10,0.7)';
    ctx.fillRect(0, 0, readout.canvas.width, readout.canvas.height);
    ctx.fillStyle = this.fps >= TARGET_HZ - 4 ? '#b9f0a4' : this.fps >= 55 ? '#ffe08a' : '#ff9a8a';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.fps.toFixed(0)} fps`, readout.canvas.width / 2, readout.canvas.height / 2);
    readout.texture.needsUpdate = true;
    // Float it above the café.
    if (cafe) readout.sprite.position.copy(this.spot.copy(cafe)).y += 0.55;
  }
}

function makeReadout(): { sprite: Sprite; canvas: HTMLCanvasElement; texture: CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 64;
  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false }));
  sprite.name = 'FpsReadout';
  sprite.scale.set(0.12, 0.04, 1);
  sprite.renderOrder = 1000;
  return { sprite, canvas, texture };
}
