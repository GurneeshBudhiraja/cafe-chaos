/**
 * RenderBudgetSystem: keeps each frame cheap enough for the headset to
 * hold its frame rate (a missed frame is what shows as judder and
 * smearing when the head moves), and shows what a frame costs when asked.
 *
 * - The shadow map is redrawn only when its picture would change. The
 *   shadow light stands in the café's own space (light/cafe-lights.ts), so
 *   when the café moves or turns as one, light and casters move together
 *   and the map is still right: only the light's shadow matrix is brought
 *   up to date (a few matrix multiplies, no render pass). An anchor
 *   correction (systems/anchor-system.ts) is such a move. The map is
 *   redrawn when the café is resized, when its furniture changes (a table
 *   opened, the café swapped for the other, the annex rising) and whenever
 *   something asks (`touchShadows`): under multiview, every redraw is a
 *   switch of render target in the middle of the frame, which Meta's
 *   engineers name as a cause of whole-scene flicker on the Quest.
 * - While the café is hidden (the pause card is up) no redraw happens:
 *   it would draw an empty map; a pending one waits for the café to show.
 * - The session is asked for a steady 72 Hz where the headset allows a
 *   choice: a frame rate the café can hold beats a higher one it misses.
 * - With `?probe` in the address (lib/probe.ts), a readout floats over the
 *   café: frames per second, draw calls and triangles a frame, shadow
 *   redraws, texture uploads and shader links a second, anchor corrections
 *   and guests on stage, and whether multiview and the shadow map are on.
 *   `?fps` shows the frame rate alone. Both off by default.
 */

import { CanvasTexture, createSystem, Matrix4, Quaternion, Sprite, SpriteMaterial, Vector3, type Light } from '@iwsdk/core';
import { COUNTS, PROBE } from '../lib/probe.js';
import { AnchorSystem } from './anchor-system.js';
import { CafeSystem } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';
import { MoodSystem } from './mood-system.js';

/** The refresh rate asked of the headset (Hz). */
export const TARGET_HZ = 72;
/** After a change, keep redrawing the shadow map for this many frames (materials and textures may still be settling). */
const SETTLE_FRAMES = 3;
/** The readout refreshes this often (seconds). */
const READOUT_EVERY = 0.5;
/** A change of the café's scale smaller than this is not a resize. */
const SCALE_EPSILON = 1e-5;

/** A session that can report and set its refresh rate (Quest Browser). */
type RateSession = XRSession & { supportedFrameRates?: Float32Array; updateTargetFrameRate?: (hz: number) => Promise<void> };
/** A light whose shadow matrix can be brought up to date without a redraw. */
type ShadowLight = Light & { shadow: { updateMatrices: (light: Light) => void } };

interface Readout {
  sprite: Sprite;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  full: boolean;
}

export class RenderBudgetSystem extends createSystem({}) {
  /** Frames per second over the last half second (0 until measured). */
  fps = 0;
  /** How many times the shadow map has been redrawn (for the checks). */
  shadowDraws = 0;
  /** What the readout shows (the last half second's rates; for the checks). */
  readonly probe = { fps: 0, calls: 0, triangles: 0, shadowsPerS: 0, uploadsPerS: 0, linksPerS: 0, links: 0, uploads: 0, corrections: 0, guests: 0 };
  private readonly last = new Matrix4();
  private readonly lastScale = new Vector3(Number.NaN, 0, 0);
  private readonly p = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private settle = SETTLE_FRAMES;
  private furniture = -1;
  private session: XRSession | null = null;
  private frames = 0;
  private elapsed = 0;
  private readout: Readout | null = null;
  private readonly spot = new Vector3();
  /** The counts at the last readout, for the rates. */
  private readonly was = { shadows: 0, uploads: 0, links: 0, hud: 0 };
  /** The readout's own texture uploads (one per refresh), left out of the rate it shows. */
  private hudUploads = 0;

  init(): void {
    this.world.renderer.shadowMap.autoUpdate = false;
    this.world.renderer.shadowMap.needsUpdate = true;
    if (PROBE.readout || PROBE.fpsOnly) this.readout = makeReadout(PROBE.readout);
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
    this.keepShadows(cafe?.matrixWorld, cafe?.visible ?? false);
    this.keepRate();
    this.measure(delta, cafe?.position);
  }

  /**
   * The shadow map: redrawn when something asked or the café was resized;
   * when the café only moved or turned, the shadow lights' matrices are
   * brought up to date and the map is kept.
   */
  private keepShadows(matrix: Matrix4 | undefined, shown: boolean): void {
    // This frame's pose, not the last render's.
    this.world.getSystem(CafeSystem)?.cafe.updateWorldMatrix(true, false);
    if (matrix && !matrix.equals(this.last)) {
      this.last.copy(matrix);
      matrix.decompose(this.p, this.q, this.s);
      if (this.lastScale.distanceToSquared(this.s) > SCALE_EPSILON * SCALE_EPSILON) this.settle = Math.max(this.settle, SETTLE_FRAMES);
      else this.refreshShadowMatrices();
      this.lastScale.copy(this.s);
    }
    if (this.settle <= 0) return;
    // Hidden (the pause card is up): a redraw now would draw an empty map; it waits for the café to show again.
    if (!shown) return;
    this.settle--;
    this.world.renderer.shadowMap.needsUpdate = true;
    this.shadowDraws++;
  }

  /** The shadow lights' matrices from where they stand now (the café moved as one: the map itself is still right). */
  private refreshShadowMatrices(): void {
    const lights = this.world.getSystem(MoodSystem)?.lights;
    if (!lights) return;
    for (const light of [lights.house, lights.moon] as ShadowLight[]) {
      if (!light.castShadow || !light.visible) continue;
      light.updateWorldMatrix(true, false);
      (light as unknown as { target: { updateWorldMatrix: (p: boolean, c: boolean) => void } }).target.updateWorldMatrix(true, false);
      light.shadow.updateMatrices(light);
    }
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
    const seconds = this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    const info = this.world.renderer.info.render;
    const probe = this.probe;
    probe.fps = this.fps;
    probe.calls = info.calls;
    probe.triangles = info.triangles;
    probe.shadowsPerS = (this.shadowDraws - this.was.shadows) / seconds;
    probe.uploadsPerS = Math.max(0, COUNTS.uploads - this.was.uploads - (this.hudUploads - this.was.hud)) / seconds;
    probe.linksPerS = (COUNTS.links - this.was.links) / seconds;
    probe.links = COUNTS.links;
    probe.uploads = COUNTS.uploads;
    probe.corrections = this.world.getSystem(AnchorSystem)?.corrected ?? 0;
    probe.guests = this.world.getSystem(GuestSystem)?.guests.length ?? 0;
    this.was.shadows = this.shadowDraws;
    this.was.uploads = COUNTS.uploads;
    this.was.links = COUNTS.links;
    this.was.hud = this.hudUploads;
    const readout = this.readout;
    if (!readout) return;
    this.draw(readout);
    this.hudUploads++;
    // Float it above the café.
    if (cafe) readout.sprite.position.copy(this.spot.copy(cafe)).y += 0.55;
  }

  private draw(readout: Readout): void {
    const { canvas, texture, full } = readout;
    const probe = this.probe;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(20,14,10,0.78)';
    ctx.fillRect(0, 0, w, h);
    const fpsColour = this.fps >= TARGET_HZ - 4 ? '#b9f0a4' : this.fps >= 55 ? '#ffe08a' : '#ff9a8a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!full) {
      ctx.fillStyle = fpsColour;
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(`${this.fps.toFixed(0)} fps`, w / 2, h / 2);
      texture.needsUpdate = true;
      return;
    }
    ctx.font = 'bold 42px sans-serif';
    const line = (y: number, parts: [string, string][]): void => {
      const text = parts.map(([t]) => t).join('   ');
      const width = ctx.measureText(text).width;
      let x = (w - width) / 2;
      ctx.textAlign = 'left';
      parts.forEach(([t, colour], i) => {
        ctx.fillStyle = colour;
        ctx.fillText(t, x, y);
        x += ctx.measureText(t + (i < parts.length - 1 ? '   ' : '')).width;
      });
    };
    const warn = (bad: boolean): string => (bad ? '#ff9a8a' : '#efe6d6');
    const multiview = COUNTS.multiview === null ? 'mv ?' : COUNTS.multiview ? 'mv on' : 'mv off';
    const shadows = this.world.renderer.shadowMap.enabled ? 'shadow on' : 'shadow off';
    line(h * 0.2, [[`${this.fps.toFixed(0)} fps`, fpsColour], [`${probe.calls} calls`, warn(probe.calls > 300)], [`${(probe.triangles / 1000).toFixed(0)}k tri`, '#efe6d6']]);
    line(h * 0.5, [[`shadow ${probe.shadowsPerS.toFixed(0)}/s`, warn(probe.shadowsPerS > 0)], [`upload ${probe.uploadsPerS.toFixed(0)}/s`, warn(probe.uploadsPerS > 2)], [`link ${probe.linksPerS.toFixed(0)}/s`, warn(probe.linksPerS > 0)]]);
    line(h * 0.8, [[`anchor ${probe.corrections}`, '#efe6d6'], [`guests ${probe.guests}`, '#efe6d6'], [multiview, '#cfe3ff'], [shadows, '#cfe3ff']]);
    texture.needsUpdate = true;
  }
}

function makeReadout(full: boolean): Readout {
  const canvas = document.createElement('canvas');
  canvas.width = full ? 980 : 192;
  canvas.height = full ? 224 : 64;
  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false }));
  sprite.name = 'ProbeReadout';
  // Real metres: about 2 cm letters at arm's length.
  if (full) sprite.scale.set(0.46, 0.105, 1);
  else sprite.scale.set(0.12, 0.04, 1);
  sprite.renderOrder = 1000;
  return { sprite, canvas, texture, full };
}
