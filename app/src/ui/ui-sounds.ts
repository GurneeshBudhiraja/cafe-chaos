/**
 * Soft UI sounds, synthesized with Web Audio (no audio files): a short
 * muted tick when something is pinched, and a gentle two-note chime when a
 * toast appears. Quiet and brief, so they confirm an action without
 * drawing attention; Snap's Spectacles guidance pairs audio with visual
 * feedback. The audio context starts on the first pinch (browsers only
 * allow sound after a user gesture).
 */

export type UiSound = 'press' | 'toast' | 'pen-touch';

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

/** One soft sine blip: quick attack, exponential decay. */
function blip(ctx: AudioContext, frequency: number, startIn: number, length: number, gain: number): void {
  const t = ctx.currentTime + startIn;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, t);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.92, t + length);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(env).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

export function playUiSound(sound: UiSound): void {
  const ctx = audio();
  if (!ctx) return;
  if (sound === 'press') {
    blip(ctx, 1320, 0, 0.05, 0.05);
  } else if (sound === 'pen-touch') {
    // Low, short and quiet (under half the press tick): a nib meeting paper, for a classroom.
    blip(ctx, 540, 0, 0.03, 0.02);
  } else {
    blip(ctx, 784, 0, 0.18, 0.045);
    blip(ctx, 1175, 0.09, 0.26, 0.04);
  }
}
