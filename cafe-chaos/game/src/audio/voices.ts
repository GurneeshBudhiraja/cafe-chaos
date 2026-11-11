/**
 * The café's sounds, made in code with the Web Audio API: nothing is
 * downloaded, and nothing needs a licence. Each function plays one sound
 * into `out` (a panner placed where the sound comes from) starting at
 * `t` (the audio clock), and cleans up after itself. Loudness is set by
 * the caller's gain; these are shaped to sit together, all soft.
 *
 * The café is a miniature on the player's table, so everything is small
 * and close: bright, light, short sounds, the way a tiny café would
 * sound up close.
 */

/** A few seconds of noise, made once per context: white for hiss and clinks, brown (deep, soft) for the room and water. */
const noises = new WeakMap<BaseAudioContext, { white: AudioBuffer; brown: AudioBuffer }>();
export function noise(ctx: BaseAudioContext, kind: 'white' | 'brown'): AudioBuffer {
  let made = noises.get(ctx);
  if (!made) {
    const length = ctx.sampleRate * 3;
    const white = ctx.createBuffer(1, length, ctx.sampleRate);
    const brown = ctx.createBuffer(1, length, ctx.sampleRate);
    const w = white.getChannelData(0);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
    made = { white, brown };
    noises.set(ctx, made);
  }
  return made[kind];
}

/** A sine partial with a fast attack and an exponential decay. */
function partial(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number, level: number, decay: number, attack = 0.004): void {
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

/** A burst of filtered noise with an envelope. */
function burst(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  opts: { kind?: 'white' | 'brown'; type: BiquadFilterType; freq: number; q?: number; level: number; attack: number; hold: number; release: number; sweepTo?: number },
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, opts.kind ?? 'white');
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.type;
  filter.frequency.setValueAtTime(opts.freq, t);
  if (opts.sweepTo) filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.attack + opts.hold + opts.release);
  filter.Q.value = opts.q ?? 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(opts.level, t + opts.attack);
  gain.gain.setValueAtTime(opts.level, t + opts.attack + opts.hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.attack + opts.hold + opts.release);
  src.connect(filter).connect(gain).connect(out);
  const end = t + opts.attack + opts.hold + opts.release + 0.05;
  src.start(t, Math.random() * 2);
  src.stop(end);
}

// ------------------------------------------------------------------ the bar

/** The espresso machine: a grind, then the steam wand's hiss rising and falling. */
export function espresso(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  // The grinder: a low buzzing rasp, a second long.
  const grind = ctx.createBufferSource();
  grind.buffer = noise(ctx, 'white');
  grind.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 900;
  band.Q.value = 1.4;
  const buzz = ctx.createGain();
  buzz.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 38;
  const depth = ctx.createGain();
  depth.gain.value = 0.18;
  lfo.connect(depth).connect(buzz.gain);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + 0.05);
  env.gain.setValueAtTime(1, t + 0.9);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
  grind.connect(band).connect(buzz).connect(env).connect(out);
  grind.start(t);
  grind.stop(t + 1.2);
  lfo.start(t);
  lfo.stop(t + 1.2);
  // The steam: a breathy hiss that swells and fades.
  burst(ctx, out, t + 1.6, { type: 'highpass', freq: 2600, level: 0.32, attack: 0.35, hold: 1.4, release: 0.9, sweepTo: 4200 });
}

/** A kettle on the brazier: one gentle bubble (call often for a simmer). */
export function bubble(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const osc = ctx.createOscillator();
  const f = 500 + Math.random() * 700;
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.05);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.09 + Math.random() * 0.06, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.1);
}

/** Two cups touching, or a cup set on its saucer: a small bright clink. */
export function clink(ctx: BaseAudioContext, out: AudioNode, t: number, level = 1): void {
  const base = 2900 + Math.random() * 900;
  partial(ctx, out, t, base, 0.16 * level, 0.18);
  partial(ctx, out, t, base * 1.52, 0.09 * level, 0.12);
  partial(ctx, out, t, base * 2.71, 0.05 * level, 0.07);
  burst(ctx, out, t, { type: 'highpass', freq: 5000, level: 0.12 * level, attack: 0.001, hold: 0.004, release: 0.03 });
}

/** A tray set down on a table: a soft wooden knock and the cups on it clinking. */
export function trayDown(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  partial(ctx, out, t, 210, 0.22, 0.08, 0.002);
  burst(ctx, out, t, { kind: 'brown', type: 'lowpass', freq: 900, level: 0.25, attack: 0.002, hold: 0.01, release: 0.06 });
  clink(ctx, out, t + 0.03, 0.8);
  clink(ctx, out, t + 0.11, 0.45);
}

// ---------------------------------------------------------------- the door

/** The wind chime (furin) by the door, rung by someone arriving: a glassy bell, a soft strike and a long ring. */
export function furin(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const base = 1760 * (0.95 + Math.random() * 0.1);
  for (const [ratio, level, decay] of [[1, 0.11, 2.4], [2.76, 0.05, 1.3], [5.4, 0.025, 0.6], [1.003, 0.06, 2.6]] as const) partial(ctx, out, t, base * ratio, level, decay, 0.003);
  // The clapper swinging back for a second, softer touch.
  for (const [ratio, level, decay] of [[1, 0.05, 1.6], [2.76, 0.02, 0.8]] as const) partial(ctx, out, t + 0.32, base * ratio, level, decay, 0.003);
}

// -------------------------------------------------------------- the garden

/** Water trickling in the pond: a few drops (call often for a steady trickle). */
export function trickle(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  for (let i = 0; i < 3; i++) {
    const at = t + Math.random() * 0.25;
    const osc = ctx.createOscillator();
    const f = 900 + Math.random() * 1500;
    osc.frequency.setValueAtTime(f, at);
    osc.frequency.exponentialRampToValueAtTime(f * 1.6, at + 0.03);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.03, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 0.08);
  }
}

/** A cricket in the evening garden: a few quick high chirps. */
export function cricket(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const f = 4300 + Math.random() * 500;
  const chirps = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < chirps; i++) partial(ctx, out, t + i * 0.055, f, 0.018, 0.03, 0.006);
}

// ---------------------------------------------------------------- the hands

/** A guest lifted off its feet: a light, round pop. */
export function pop(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(340, t);
  osc.frequency.exponentialRampToValueAtTime(880, t + 0.07);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.22, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.15);
}

/** A guest put down on its seat: a soft cushioned thump, and a two-note chime that says "seated". */
export function seated(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.1);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.3, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.18);
  partial(ctx, out, t + 0.08, 1318.5, 0.08, 0.45);
  partial(ctx, out, t + 0.2, 1975.5, 0.07, 0.6);
}

/** A tiny voice: a guest's little "oh!" when picked up, "mm" when seated, or a sigh when it gives up. */
export function voice(ctx: BaseAudioContext, out: AudioNode, t: number, kind: 'oh' | 'mm' | 'sigh'): void {
  const pitch = 0.9 + Math.random() * 0.25;
  if (kind === 'sigh') {
    burst(ctx, out, t, { type: 'bandpass', freq: 1300 * pitch, q: 2.2, level: 0.12, attack: 0.08, hold: 0.15, release: 0.45, sweepTo: 600 * pitch });
    return;
  }
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  const [from, to, length] = kind === 'oh' ? [620, 980, 0.16] : [420, 380, 0.3];
  osc.frequency.setValueAtTime(from * pitch, t);
  osc.frequency.exponentialRampToValueAtTime(to * pitch, t + length * 0.6);
  // A small vowel: a band of the voice brought forward.
  const vowel = ctx.createBiquadFilter();
  vowel.type = 'bandpass';
  vowel.frequency.value = (kind === 'oh' ? 900 : 600) * pitch;
  vowel.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(kind === 'oh' ? 0.2 : 0.14, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(vowel).connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** The plaque pressed: the padlock's click, and a rising run of bells as the café grows. */
export function unlock(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  burst(ctx, out, t, { type: 'bandpass', freq: 3200, q: 3, level: 0.3, attack: 0.001, hold: 0.008, release: 0.03 });
  partial(ctx, out, t, 1400, 0.1, 0.08, 0.001);
  [784, 988, 1175, 1568, 1976].forEach((f, i) => partial(ctx, out, t + 0.25 + i * 0.11, f, 0.08, 0.9));
}

/** Coins paid: a bright little jingle, two coins and a tinkle. */
export function coins(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  burst(ctx, out, t, { type: 'bandpass', freq: 5200, q: 6, level: 0.16, attack: 0.001, hold: 0.01, release: 0.06 });
  partial(ctx, out, t + 0.005, 2637, 0.07, 0.25, 0.001);
  burst(ctx, out, t + 0.07, { type: 'bandpass', freq: 6100, q: 6, level: 0.12, attack: 0.001, hold: 0.01, release: 0.05 });
  partial(ctx, out, t + 0.075, 3136, 0.06, 0.3, 0.001);
  partial(ctx, out, t + 0.16, 3951, 0.04, 0.35, 0.001);
}

/** A guest storming out: a low, cross little "hmph". */
export function grumble(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const pitch = 0.9 + Math.random() * 0.2;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(260 * pitch, t);
  osc.frequency.exponentialRampToValueAtTime(150 * pitch, t + 0.22);
  const vowel = ctx.createBiquadFilter();
  vowel.type = 'bandpass';
  vowel.frequency.value = 520 * pitch;
  vowel.Q.value = 1.6;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.13, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  osc.connect(vowel).connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.32);
  burst(ctx, out, t + 0.02, { type: 'lowpass', freq: 700, q: 0.7, level: 0.1, attack: 0.01, hold: 0.06, release: 0.12 });
}

/** Not enough money: a dull knock of stone, and a low two-note "uh-uh". */
export function refuse(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  burst(ctx, out, t, { type: 'lowpass', freq: 500, q: 1, level: 0.25, attack: 0.002, hold: 0.02, release: 0.08 });
  partial(ctx, out, t + 0.04, 330, 0.08, 0.12);
  partial(ctx, out, t + 0.17, 262, 0.08, 0.18);
}

/** A button pressed: a soft wooden tick. */
export function tick(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  burst(ctx, out, t, { type: 'bandpass', freq: 1800, q: 4, level: 0.22, attack: 0.001, hold: 0.006, release: 0.04 });
  partial(ctx, out, t, 1046.5, 0.05, 0.08, 0.001);
}

/** Closing time: a slow, falling run of bells. */
export function closing(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  [1568, 1319, 1175, 988, 784].forEach((f, i) => partial(ctx, out, t + i * 0.22, f, 0.07, 1.2));
}

/**
 * The room itself: a soft, low murmur of a quiet café (deep noise,
 * shaped round voices' warmth and slowly breathing), looped. Returns the
 * node to connect into a panner; it runs until the context closes.
 */
export function roomTone(ctx: BaseAudioContext, out: AudioNode): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 'brown');
  src.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = 'bandpass';
  low.frequency.value = 420;
  low.Q.value = 0.6;
  const level = ctx.createGain();
  level.gain.value = 0.16;
  // A slow swell, as conversations rise and fall.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const depth = ctx.createGain();
  depth.gain.value = 0.05;
  lfo.connect(depth).connect(level.gain);
  src.connect(low).connect(level).connect(out);
  src.start();
  lfo.start();
}
