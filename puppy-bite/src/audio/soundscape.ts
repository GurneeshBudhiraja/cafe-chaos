/**
 * The game's sound, all made with the Web Audio API (no sound files):
 *
 * - Music: a slow lullaby: a soft pad cycling through four gentle chords
 *   with a music-box pluck on top, through a low-pass that breathes and a
 *   little delay for space. Quiet by design.
 * - Effects, kept soft: a contented sigh when a puppy settles into the
 *   bed, a small yip when one nips, a tiny whine when one is picked up, a
 *   happy little howl when the whole litter is tucked in, and a tick for
 *   the pads.
 *
 * Everything is written against a BaseAudioContext and a start time, so
 * the same code plays live and renders the recording's soundtrack offline
 * (every effect is logged with its time; see renderOffline).
 */

export type SoundKind = 'snuggle' | 'nip' | 'pickup' | 'complete' | 'tap';
export interface SoundEvent {
  /** Seconds on the page's clock (performance.now() / 1000). */
  t: number;
  kind: SoundKind;
  /** complete: stars. */
  value?: number;
}

const CHORD_SECONDS = 7;
/** Four gentle chords (Hz, low to high): Fmaj7, C/E, Dm7, Gsus4-ish. */
const CHORDS = [
  [87.31, 174.61, 261.63, 329.63, 440.0],
  [82.41, 164.81, 261.63, 329.63, 392.0],
  [73.42, 146.83, 220.0, 349.23, 523.25],
  [98.0, 146.83, 261.63, 293.66, 392.0],
];
/** F major pentatonic for the music-box plucks. */
const PENTATONIC = [698.46, 783.99, 880.0, 1046.5, 1174.66, 1396.91];

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
    // A music box: a bright fundamental with a couple of fading overtones.
    tone(ctx, music.input, freq, base + t, { type: 'sine', gain: 0.04, attack: 0.004, release: 1.6 });
    tone(ctx, music.input, freq * 2, base + t, { type: 'sine', gain: 0.014, attack: 0.004, release: 0.6 });
    tone(ctx, music.input, freq * 3.01, base + t, { type: 'sine', gain: 0.005, attack: 0.004, release: 0.3 });
  }
}

// ---------------------------------------------------------------- effects

function playEffect(ctx: BaseAudioContext, out: AudioNode, event: SoundEvent, at: number): void {
  switch (event.kind) {
    case 'snuggle':
      // A contented sigh: a soft breath of noise and a low, falling hum.
      hiss(ctx, out, at, 0.5, 0.03, 700, 0.5);
      tone(ctx, out, 190, at + 0.05, { gain: 0.045, attack: 0.08, release: 0.45, glideTo: 140 });
      tone(ctx, out, 380, at + 0.05, { gain: 0.012, attack: 0.08, release: 0.35, glideTo: 280 });
      break;
    case 'nip':
      // A small yip, twice: a quick rising squeak with a touch of breath.
      tone(ctx, out, 650, at, { gain: 0.09, attack: 0.006, release: 0.1, glideTo: 1250 });
      hiss(ctx, out, at, 0.04, 0.02, 2800, 1);
      tone(ctx, out, 800, at + 0.14, { gain: 0.07, attack: 0.006, release: 0.09, glideTo: 1400 });
      break;
    case 'pickup':
      // A tiny questioning whine.
      tone(ctx, out, 520, at, { gain: 0.03, attack: 0.03, release: 0.18, glideTo: 760 });
      break;
    case 'complete': {
      // A happy little howl, then a sleepy music-box cadence.
      tone(ctx, out, 330, at, { gain: 0.045, attack: 0.08, hold: 0.25, release: 0.5, glideTo: 620 });
      const stars = event.value ?? 1;
      const notes = [698.46, 880.0, 1046.5, 1396.91, ...(stars >= 3 ? [1760.0] : [])];
      notes.forEach((freq, i) => tone(ctx, out, freq, at + 0.5 + i * 0.18, { gain: 0.05, attack: 0.005, release: 1.1 }));
      break;
    }
    case 'tap':
      tone(ctx, out, 900, at, { gain: 0.06, attack: 0.003, release: 0.05 });
      hiss(ctx, out, at, 0.03, 0.03, 3000, 1);
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

  play(kind: SoundKind, value?: number): void {
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
    for (const event of events) {
      const at = (event.t - origin) / speedUp;
      if (at < 0 || at > seconds) continue;
      playEffect(ctx, master, event, at);
    }
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
