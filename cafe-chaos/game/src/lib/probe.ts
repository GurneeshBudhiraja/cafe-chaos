/**
 * The probe: switches in the address for finding what makes the café
 * flicker on the headset, and counters for what the renderer does each
 * frame that the readout (`?probe`, systems/render-budget-system.ts) shows.
 *
 * Switches (each off unless named in the address):
 * - `?probe`: the readout over the café (fps, draw calls, triangles,
 *   shadow redraws, texture uploads, shader links, anchor corrections,
 *   guests). `?fps` still shows the frame rate alone.
 * - `?nomultiview`: the headset's two views drawn one after the other,
 *   not both in one pass (the OCULUS_multiview extension hidden from the
 *   renderer). Set before the renderer is made: import this module first.
 * - `?noshadow`: no shadow map at all.
 * - `?nodials`: the patience dots and name tags are drawn once and never
 *   again (no texture uploads for them during play).
 * - `?nobar`: the bar over the café is drawn once and never again.
 * - `?noanchor`: the café is never corrected onto its anchor.
 *
 * The counters wrap the WebGL context's own calls, so they count what the
 * renderer really does, not what the game asked for: `linkProgram` is a
 * shader link (a long frame on the headset, and a change in every lit
 * material's program when the set of lights changes); `texImage2D` and
 * `texSubImage2D` with a canvas, image or bitmap source are texture
 * uploads (every redrawn canvas texture is one).
 */

const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

export const PROBE = {
  /** The readout over the café. */
  readout: query.has('probe'),
  /** Frames per second only (the older `?fps`). */
  fpsOnly: query.has('fps') && !query.has('probe'),
  noMultiview: query.has('nomultiview'),
  noShadow: query.has('noshadow'),
  noDials: query.has('nodials'),
  noBar: query.has('nobar'),
  noAnchor: query.has('noanchor'),
};

/** Running totals since the page loaded. */
export const COUNTS = {
  /** Shader programs linked. */
  links: 0,
  /** Textures uploaded from a canvas, image or bitmap (whole or part). */
  uploads: 0,
  /** Whether the renderer got the multiview extension (set once the context exists; null until then). */
  multiview: null as boolean | null,
};

function isImageSource(source: unknown): boolean {
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) return true;
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) return true;
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) return true;
  if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) return true;
  if (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas) return true;
  return false;
}

/** Wrap the context's calls (once, at load). */
function instrument(): void {
  if (typeof WebGL2RenderingContext === 'undefined') return;
  const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const link = proto.linkProgram;
  proto.linkProgram = function (this: WebGL2RenderingContext, ...args: unknown[]) {
    COUNTS.links++;
    return link.apply(this, args);
  };
  for (const name of ['texImage2D', 'texSubImage2D']) {
    const upload = proto[name];
    proto[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      // The source is the last argument in every overload that takes an image.
      if (isImageSource(args[args.length - 1])) COUNTS.uploads++;
      return upload.apply(this, args);
    };
  }
  const getExtension = proto.getExtension as (name: string) => unknown;
  proto.getExtension = function (this: WebGL2RenderingContext, name: string) {
    const multiview = name === 'OCULUS_multiview' || name === 'OVR_multiview2';
    if (multiview && PROBE.noMultiview) {
      COUNTS.multiview = false;
      return null;
    }
    const ext = getExtension.call(this, name);
    if (multiview) COUNTS.multiview = COUNTS.multiview || !!ext;
    return ext;
  } as typeof proto.getExtension;
}

instrument();
