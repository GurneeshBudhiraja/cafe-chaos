/**
 * The game's sound, all made with the Web Audio API (no sound files):
 *
 * - Music: a slow, soft pad cycling through four warm chords, a sparse
 *   pentatonic pluck on top, through a gentle low-pass that breathes and
 *   a little delay for space. Quiet by design.
 * - Effects, kept soft: the blade going through the cake (a hushed
 *   filtered noise that follows how fast the blade moves), a low thump
 *   when a piece comes free, a plop when a piece settles into its cell
 *   (with a two-note chime for a good fit), a small arpeggio when the
 *   box is done, and a tick for the pads.
 *
 * Everything is written against a BaseAudioContext and a start time, so
 * the same code plays live and renders the recording's soundtrack offline
 * (every effect is logged with its time; see renderOffline).
 */

export type SoundKind = 'cut' | 'snap' | 'complete' | 'tap' | 'cutting';
export interface SoundEvent {
  /** Seconds on the page's clock (performance.now() / 1000). */
  t: number;
  kind: SoundKind;
  /** snap: the fit (0..1); complete: stars; cutting: the blade's speed (m/s). */
  value?: number;
}

const CHORD_SECONDS = 8;
/** Four warm chords (Hz, low to high): Cmaj9, Am9, Fmaj7, G6. */
const CHORDS = [
  [130.81, 196.0, 329.63, 493.88, 587.33],
  [110.0, 164.81, 261.63, 392.0, 493.88],
  [87.31, 130.81, 220.0, 329.63, 392.0],
  [98.0, 146.83, 246.94, 293.66, 440.0],
];
/** C major pentatonic for the plucks. */
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

/** Repeatable noise for the music's choices, so live and offline agree. */
function hash(n: number, k = 0): number {
  const s = Math.sin(n * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

let noiseBuffer: AudioBuffer | null = null;
function getNoise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const seconds = 2;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** A sine (or other) tone with an attack and an exponential-ish release. */
function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  freq: number,
  at: number,
  { type = 'sine', gain = 0.1, attack = 0.005, hold = 0, release = 0.4, glideTo = 0, detune = 0 }: Partial<{
    type: OscillatorType;
    gain: number;
    attack: number;
    hold: number;
    release: number;
    glideTo: number;
    detune: number;
  }> = {},
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + attack + hold + release * 0.6);
  osc.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + attack);
  g.gain.setValueAtTime(gain, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + attack + hold + release + 0.05);
}

/** A burst of filtered noise. */
function hiss(ctx: BaseAudioContext, out: AudioNode, at: number, seconds: number, gain: number, freq: number, q = 0.8): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  src.connect(filter).connect(g).connect(out);
  src.start(at);
  src.stop(at + seconds + 0.05);
}

// ------------------------------------------------------------------ music

interface MusicNodes {
  input: GainNode;
}

/** The music's shared chain: a breathing low-pass, a delay for space, into `out`. */
function buildMusicChain(ctx: BaseAudioContext, out: AudioNode, at: number): MusicNodes {
  const input = ctx.createGain();
  input.gain.value = 1;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 1400;
  lowpass.Q.value = 0.3;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 450;
  lfo.connect(lfoGain).connect(lowpass.frequency);
  lfo.start(at);
  const dry = ctx.createGain();
  dry.gain.value = 0.75;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  input.connect(lowpass);
  lowpass.connect(dry).connect(out);
  // Two feedback delays, darkened in the loop, as a small room.
  for (const seconds of [0.31, 0.47]) {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = seconds;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 1800;
    lowpass.connect(delay);
    delay.connect(dark).connect(feedback).connect(delay);
    dark.connect(wet);
  }
  wet.connect(out);
  return { input };
}

/**
 * Schedule the music between two times on the music's own clock (seconds
 * since the music began): the chord pads and the plucks that fall in that
 * window. Idempotent per window, so a live player can call it in chunks.
 */
function scheduleMusic(ctx: BaseAudioContext, music: MusicNodes, base: number, from: number, until: number): void {
  // Chords: one every CHORD_SECONDS, cycling.
  const firstChord = Math.floor(from / CHORD_SECONDS);
  const lastChord = Math.floor(until / CHORD_SECONDS);
  for (let n = firstChord; n <= lastChord; n++) {
    const start = n * CHORD_SECONDS;
    if (start < from || start >= until) continue;
    const chord = CHORDS[n % CHORDS.length];
    chord.forEach((freq, i) => {
      const gain = i === 0 ? 0.05 : 0.038;
      tone(ctx, music.input, freq, base + start, { type: 'triangle', gain, attack: 2.6, hold: CHORD_SECONDS - 2.2, release: 3.2, detune: 0 });
      tone(ctx, music.input, freq, base + start, { type: 'sine', gain: gain * 0.8, attack: 3.0, hold: CHORD_SECONDS - 2.6, release: 3.2, detune: i % 2 ? 5 : -4 });
    });
  }
  // Plucks: on a grid of 0.5 s, each slot has a small chance, never two in a row.
  const firstSlot = Math.ceil(from / 0.5);
  const lastSlot = Math.floor(until / 0.5);
  for (let slot = firstSlot; slot <= lastSlot; slot++) {
    const t = slot * 0.5;
    if (t < from || t >= until) continue;
    if (hash(slot, 1) > 0.22 || hash(slot - 1, 1) <= 0.22) continue;
    const chordIndex = Math.floor(t / CHORD_SECONDS) % CHORDS.length;
    // Lean on notes that sit in the chord: pick from the pentatonic, nudged by the chord.
    const choice = (Math.floor(hash(slot, 2) * PENTATONIC.length) + chordIndex) % PENTATONIC.length;
    const freq = PENTATONIC[choice] * (hash(slot, 3) > 0.7 ? 0.5 : 1);
    tone(ctx, music.input, freq, base + t, { type: 'sine', gain: 0.045, attack: 0.012, release: 1.4 });
    tone(ctx, music.input, freq * 2, base + t, { type: 'sine', gain: 0.012, attack: 0.012, release: 0.7 });
  }
}

// ---------------------------------------------------------------- effects

function playEffect(ctx: BaseAudioContext, out: AudioNode, event: SoundEvent, at: number): void {
  switch (event.kind) {
    case 'cut':
      // A piece comes free: a low, soft thump and a crumbly crackle.
      tone(ctx, out, 120, at, { gain: 0.14, attack: 0.004, release: 0.22, glideTo: 65 });
      hiss(ctx, out, at, 0.09, 0.035, 2600, 0.6);
      break;
    case 'snap': {
      const fit = event.value ?? 0;
      // The plop of a piece settling.
      tone(ctx, out, 390, at, { gain: 0.11, attack: 0.004, release: 0.13, glideTo: 170 });
      if (fit >= 0.85) {
        tone(ctx, out, 659.25, at + 0.06, { gain: 0.05, attack: 0.01, release: 0.6 });
        tone(ctx, out, 783.99, at + 0.16, { gain: 0.05, attack: 0.01, release: 0.7 });
      } else if (fit >= 0.65) {
        tone(ctx, out, 659.25, at + 0.06, { gain: 0.045, attack: 0.01, release: 0.5 });
      } else {
        tone(ctx, out, 220, at + 0.05, { gain: 0.06, attack: 0.01, release: 0.25 });
      }
      break;
    }
    case 'complete': {
      const stars = event.value ?? 1;
      const notes = [523.25, 659.25, 783.99, 1046.5, ...(stars >= 3 ? [1318.5] : [])];
      notes.forEach((freq, i) => tone(ctx, out, freq, at + i * 0.17, { gain: 0.06, attack: 0.01, release: 0.9 }));
      break;
    }
    case 'tap':
      tone(ctx, out, 900, at, { gain: 0.06, attack: 0.003, release: 0.05 });
      hiss(ctx, out, at, 0.03, 0.03, 3000, 1);
      break;
    case 'cutting':
      // Handled as a continuous sound (see Soundscape.cutting and renderOffline).
      break;
  }
}

// -------------------------------------------------------------- the player

export class Soundscape {
  /** Every effect played, with its time on the page's clock (for the recording's soundtrack). */
  readonly log: SoundEvent[] = [];
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: MusicNodes | null = null;
  private musicBase = 0;
  private scheduledUntil = 0;
  private cuttingGain: GainNode | null = null;
  private lastCuttingLog = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Live music volume (0..1). */
  musicLevel = 1;

  /** Start (or resume) the sound: needs a user gesture behind it, such as entering VR. */
  start(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);
      const musicOut = ctx.createGain();
      musicOut.gain.value = this.musicLevel;
      musicOut.connect(this.master);
      this.musicBase = ctx.currentTime + 0.1;
      this.music = buildMusicChain(ctx, musicOut, this.musicBase);
      // The cutting hush: a looped noise whose gain follows the blade.
      const src = ctx.createBufferSource();
      src.buffer = getNoise(ctx);
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 750;
      band.Q.value = 0.7;
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 1900;
      this.cuttingGain = ctx.createGain();
      this.cuttingGain.gain.value = 0;
      src.connect(band).connect(soft).connect(this.cuttingGain).connect(this.master);
      src.start();
      this.timer = setInterval(() => this.scheduleAhead(), 500);
      this.scheduleAhead();
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  private scheduleAhead(): void {
    if (!this.ctx || !this.music) return;
    const now = this.ctx.currentTime - this.musicBase;
    const until = now + 2.5;
    if (until <= this.scheduledUntil) return;
    scheduleMusic(this.ctx, this.music, this.musicBase, Math.max(this.scheduledUntil, now - 0.5), until);
    this.scheduledUntil = until;
  }

  /** The blade moving through cake at `speed` metres per second (0 when still). */
  cutting(speed: number): void {
    const now = performance.now() / 1000;
    if (speed > 0.01 && now - this.lastCuttingLog > 0.08) {
      this.log.push({ t: now, kind: 'cutting', value: speed });
      this.lastCuttingLog = now;
    }
    if (!this.ctx || !this.cuttingGain) return;
    const level = Math.min(0.09, speed * 0.4);
    this.cuttingGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.04);
  }

  play(kind: Exclude<SoundKind, 'cutting'>, value?: number): void {
    const event: SoundEvent = { t: performance.now() / 1000, kind, value };
    this.log.push(event);
    if (this.ctx && this.master) playEffect(this.ctx, this.master, event, this.ctx.currentTime + 0.01);
  }

  /**
   * Render a soundtrack offline: the music from time 0, and the logged
   * events placed at `(event.t - origin) / speedUp` seconds (a recording
   * captured slowly and sped up has its events closer together).
   */
  static async renderOffline(events: SoundEvent[], seconds: number, origin: number, speedUp = 1): Promise<AudioBuffer> {
    const sampleRate = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    const musicOut = ctx.createGain();
    musicOut.gain.value = 1;
    musicOut.connect(master);
    const music = buildMusicChain(ctx, musicOut, 0);
    scheduleMusic(ctx, music, 0, 0, seconds + 1);
    // The cutting hush, automated from the logged speeds.
    const src = ctx.createBufferSource();
    src.buffer = getNoise(ctx);
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 750;
    band.Q.value = 0.7;
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 1900;
    const cuttingGain = ctx.createGain();
    cuttingGain.gain.value = 0;
    src.connect(band).connect(soft).connect(cuttingGain).connect(master);
    src.start(0);
    let lastCutting = -1;
    for (const event of events) {
      const at = (event.t - origin) / speedUp;
      if (at < 0 || at > seconds) continue;
      if (event.kind === 'cutting') {
        const level = Math.min(0.09, (event.value ?? 0) * 0.4 * speedUp);
        if (lastCutting >= 0 && at - lastCutting > 0.25 / speedUp) cuttingGain.gain.setTargetAtTime(0, lastCutting + 0.1 / speedUp, 0.05);
        cuttingGain.gain.setTargetAtTime(level, at, 0.04);
        lastCutting = at;
      } else {
        playEffect(ctx, master, event, at);
      }
    }
    if (lastCutting >= 0) cuttingGain.gain.setTargetAtTime(0, lastCutting + 0.1 / speedUp, 0.05);
    return ctx.startRendering();
  }

  /** A 16-bit stereo WAV of a buffer. */
  static toWav(buffer: AudioBuffer): ArrayBuffer {
    const channels = buffer.numberOfChannels;
    const frames = buffer.length;
    const bytes = 44 + frames * channels * 2;
    const out = new ArrayBuffer(bytes);
    const view = new DataView(out);
    const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    write(0, 'RIFF');
    view.setUint32(4, bytes - 8, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, frames * channels * 2, true);
    const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
    let offset = 44;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        const v = Math.max(-1, Math.min(1, data[c][i]));
        view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        offset += 2;
      }
    }
    return out;
  }
}
