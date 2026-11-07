/**
 * The game's sound, all made with the Web Audio API (no sound files):
 *
 * - Music: a light travelling tune: a plucked ukulele-like strum over four
 *   friendly chords, a soft round bass on the beats, and now and then a
 *   little glockenspiel phrase, through a warm low-pass and a small room
 *   of delay. Cheerful but quiet by design.
 * - Effects, kept soft: a plump little "sit" when a Yapper takes a seat, a
 *   bright chirp when it is happy there, a nasal yap-yap when it grumbles,
 *   a questioning "mep?" when picked up, a boing when it bounces off a
 *   taken seat, the bus's bell and horn when everyone is aboard and
 *   content, and a tick for the pads.
 *
 * Everything is written against a BaseAudioContext and a start time, so
 * the same code plays live and renders the recording's soundtrack offline
 * (every effect is logged with its time; see renderOffline).
 */

export type SoundKind = 'seat' | 'happy' | 'grumble' | 'pickup' | 'bump' | 'complete' | 'tap';
export interface SoundEvent {
  /** Seconds on the page's clock (performance.now() / 1000). */
  t: number;
  kind: SoundKind;
  /** complete: stars. happy/grumble: the Yapper's index (its voice). */
  value?: number;
}

/** The beat (seconds) and the chord changes: C, Am, F, G, two bars each. */
const BEAT = 0.58;
const CHORD_BEATS = 8;
const CHORDS = [
  [261.63, 329.63, 392.0, 523.25],
  [220.0, 261.63, 329.63, 440.0],
  [174.61, 220.0, 261.63, 349.23],
  [196.0, 246.94, 293.66, 392.0],
];
const BASS = [130.81, 110.0, 87.31, 98.0];
/** C major pentatonic for the glockenspiel. */
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
/** The strum: which eighth notes play in each two-beat cell (1 = down-strum, 2 = up-strum, 0 = rest). */
const STRUM = [1, 0, 2, 1, 0, 1, 2, 0];

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

/** A tone with an attack and an exponential-ish release. */
function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  freq: number,
  at: number,
  { type = 'sine', gain = 0.1, attack = 0.005, hold = 0, release = 0.4, glideTo = 0, detune = 0, lowpass = 0 }: Partial<{
    type: OscillatorType;
    gain: number;
    attack: number;
    hold: number;
    release: number;
    glideTo: number;
    detune: number;
    lowpass: number;
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
  let last: AudioNode = osc;
  if (lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    last.connect(filter);
    last = filter;
  }
  last.connect(g).connect(out);
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

/** The music's shared chain: a warm low-pass, a delay for space, into `out`. */
function buildMusicChain(ctx: BaseAudioContext, out: AudioNode, at: number): MusicNodes {
  const input = ctx.createGain();
  input.gain.value = 1;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 2600;
  lowpass.Q.value = 0.4;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 500;
  lfo.connect(lfoGain).connect(lowpass.frequency);
  lfo.start(at);
  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  input.connect(lowpass);
  lowpass.connect(dry).connect(out);
  for (const seconds of [0.29, 0.43]) {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = seconds;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 1600;
    lowpass.connect(delay);
    delay.connect(dark).connect(feedback).connect(delay);
    dark.connect(wet);
  }
  wet.connect(out);
  return { input };
}

/** One plucked string: a bright start that mellows quickly, like a nylon string. */
function pluck(ctx: BaseAudioContext, out: AudioNode, freq: number, at: number, gain: number): void {
  tone(ctx, out, freq, at, { type: 'triangle', gain, attack: 0.003, release: 0.9, lowpass: 2400 });
  tone(ctx, out, freq * 2, at, { type: 'sine', gain: gain * 0.25, attack: 0.003, release: 0.25 });
}

/**
 * Schedule the music between two times on the music's own clock (seconds
 * since the music began): the strums, bass and glockenspiel notes that
 * fall in that window. Idempotent per window, so a live player can call
 * it in chunks.
 */
function scheduleMusic(ctx: BaseAudioContext, music: MusicNodes, base: number, from: number, until: number): void {
  const eighth = BEAT / 2;
  const firstSlot = Math.ceil(from / eighth);
  const lastSlot = Math.floor(until / eighth);
  for (let slot = firstSlot; slot <= lastSlot; slot++) {
    const t = slot * eighth;
    if (t < from || t >= until) continue;
    const beat = Math.floor(slot / 2);
    const chord = CHORDS[Math.floor(beat / CHORD_BEATS) % CHORDS.length];
    const bass = BASS[Math.floor(beat / CHORD_BEATS) % BASS.length];
    // The strum pattern repeats every two beats (eight eighths).
    const strum = STRUM[slot % STRUM.length];
    if (strum) {
      const notes = strum === 1 ? chord : [...chord].reverse();
      notes.forEach((freq, i) => pluck(ctx, music.input, freq, base + t + i * 0.012, strum === 1 ? 0.05 : 0.034));
    }
    // Bass on beats 1 and 3 of each bar, a soft round note.
    if (slot % 2 === 0 && beat % 2 === 0) {
      tone(ctx, music.input, bass, base + t, { type: 'sine', gain: 0.1, attack: 0.01, hold: 0.1, release: 0.5 });
      tone(ctx, music.input, bass * 2, base + t, { type: 'triangle', gain: 0.012, attack: 0.01, release: 0.2, lowpass: 900 });
    }
    // The glockenspiel: a short phrase every other bar, on the pentatonic, stepwise.
    const bar = Math.floor(beat / 4);
    if (bar % 2 === 1 && slot % 2 === 0 && hash(slot, 5) < 0.75) {
      const step = Math.floor(hash(bar, 6) * 3) + Math.floor(((slot % 8) / 8) * 3);
      const freq = PENTATONIC[(step + Math.floor(hash(slot, 7) * 2)) % PENTATONIC.length];
      tone(ctx, music.input, freq, base + t, { type: 'sine', gain: 0.045, attack: 0.003, release: 1.2 });
      tone(ctx, music.input, freq * 2.76, base + t, { type: 'sine', gain: 0.006, attack: 0.003, release: 0.3 });
    }
  }
}

// ---------------------------------------------------------------- effects

/** Each Yapper has its own pitch of voice. */
function voice(index = 0): number {
  return 1 + ((index * 7) % 5) * 0.08 - 0.16;
}

function playEffect(ctx: BaseAudioContext, out: AudioNode, event: SoundEvent, at: number): void {
  switch (event.kind) {
    case 'seat':
      // A plump little sit: a low soft thump and a tiny cushion creak.
      tone(ctx, out, 190, at, { gain: 0.07, attack: 0.005, release: 0.14, glideTo: 95 });
      hiss(ctx, out, at + 0.01, 0.08, 0.015, 900, 1.2);
      break;
    case 'happy': {
      // A bright two-note chirp with a little trill.
      const v = voice(event.value);
      tone(ctx, out, 1150 * v, at, { gain: 0.045, attack: 0.006, release: 0.09, glideTo: 1700 * v });
      tone(ctx, out, 1500 * v, at + 0.11, { gain: 0.04, attack: 0.006, release: 0.14, glideTo: 2100 * v });
      tone(ctx, out, 2000 * v, at + 0.24, { gain: 0.02, attack: 0.004, release: 0.12, glideTo: 1800 * v });
      break;
    }
    case 'grumble': {
      // Yap yap yap: three short nasal squawks, falling.
      const v = voice(event.value);
      [0, 0.14, 0.27].forEach((dt, i) => {
        tone(ctx, out, (460 - i * 30) * v, at + dt, { type: 'sawtooth', gain: 0.028, attack: 0.008, release: 0.1, glideTo: (330 - i * 20) * v, lowpass: 1800 });
        tone(ctx, out, (920 - i * 60) * v, at + dt, { type: 'square', gain: 0.008, attack: 0.008, release: 0.08, glideTo: (660 - i * 40) * v, lowpass: 2200 });
      });
      break;
    }
    case 'pickup':
      // A questioning "mep?".
      tone(ctx, out, 560, at, { type: 'triangle', gain: 0.035, attack: 0.01, release: 0.12, glideTo: 880, lowpass: 2000 });
      break;
    case 'bump':
      // A boing, and an indignant squawk from the sitter.
      tone(ctx, out, 320, at, { gain: 0.06, attack: 0.005, release: 0.3, glideTo: 140 });
      tone(ctx, out, 640, at, { type: 'triangle', gain: 0.02, attack: 0.005, release: 0.2, glideTo: 280, lowpass: 1500 });
      tone(ctx, out, 520, at + 0.1, { type: 'sawtooth', gain: 0.025, attack: 0.008, release: 0.16, glideTo: 380, lowpass: 1800 });
      break;
    case 'complete': {
      // The bus's bell, ding-ding, then a friendly horn and a little fanfare for the stars.
      for (const dt of [0, 0.22]) {
        tone(ctx, out, 1760, at + dt, { gain: 0.05, attack: 0.003, release: 1.4 });
        tone(ctx, out, 1760 * 2.4, at + dt, { gain: 0.015, attack: 0.003, release: 0.5 });
      }
      tone(ctx, out, 330, at + 0.55, { type: 'triangle', gain: 0.045, attack: 0.03, hold: 0.35, release: 0.3, lowpass: 1200 });
      tone(ctx, out, 415.3, at + 0.55, { type: 'triangle', gain: 0.045, attack: 0.03, hold: 0.35, release: 0.3, detune: 6, lowpass: 1200 });
      const stars = event.value ?? 1;
      const notes = [523.25, 659.25, 783.99, 1046.5, ...(stars >= 3 ? [1318.5] : [])];
      notes.forEach((freq, i) => tone(ctx, out, freq, at + 1.3 + i * 0.16, { gain: 0.045, attack: 0.004, release: 1.0 }));
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
