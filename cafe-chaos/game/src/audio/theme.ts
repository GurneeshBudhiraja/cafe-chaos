/**
 * The theme: a soft lo-fi track that plays under the whole game, quietly,
 * from the moment the session starts. It is there to settle the player
 * into the café's evening, not to be listened to: it comes in gently
 * with the dusk, loops, and goes out when the session ends.
 *
 * The track is "Tokyo Sunset" by HoliznaCC0, public domain (CC0 1.0);
 * its source and licence are in `public/audio/CREDITS.md`.
 *
 * Browsers only let sound start from something the player did. Entering
 * the session is such a thing, so the music is started there; if the
 * browser still holds it back, it is started on the player's first
 * pinch instead.
 */

import type { World } from '@iwsdk/core';

/** How loud the theme plays (0 to 1): 5 %, barely there, a room tone more than a song. */
export const THEME_VOLUME = 0.05;
/** It comes in over this long, and goes out over this long (seconds). */
const FADE = { in: 4, out: 1.2 };
/** How loud it plays while the game is paused, as a share of its usual volume. */
const DUCK = 0.4;

export class Theme {
  readonly audio: HTMLAudioElement;
  /** True once the browser has let it play. */
  started = false;
  /** How many times it has been asked to play (for the checks). */
  asked = 0;
  private target = 0;
  /** Quieter while the game is paused (see duck). */
  ducked = false;
  private rate = 0;
  private last = performance.now();

  constructor(url: string) {
    this.audio = new Audio(url);
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.audio.volume = 0;
  }

  /** Start (or resume) the theme, fading in. */
  play(): void {
    this.asked++;
    this.target = THEME_VOLUME * (this.ducked ? DUCK : 1);
    this.rate = THEME_VOLUME / FADE.in;
    this.audio
      .play()
      .then(() => {
        this.started = true;
      })
      .catch(() => {
        // Held back by the browser until the player does something: `nudge` tries again.
      });
  }

  /** Try again after a player action, if the browser held the theme back. */
  nudge(): void {
    if (!this.started && this.target > 0) this.play();
  }

  /** Quieter while the game is paused (40%), back up when it carries on; only while it is playing. */
  duck(on: boolean): void {
    if (on === this.ducked || this.target === 0) return;
    this.ducked = on;
    this.target = THEME_VOLUME * (on ? DUCK : 1);
    this.rate = THEME_VOLUME / FADE.out;
  }

  /** Fade out and pause. */
  stop(): void {
    this.target = 0;
    this.rate = THEME_VOLUME / FADE.out;
  }

  /** Ease the volume toward where it should be (call every frame). */
  update(): void {
    const now = performance.now();
    const delta = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const volume = this.audio.volume;
    if (volume === this.target) return;
    const step = this.rate * delta;
    this.audio.volume = volume < this.target ? Math.min(this.target, volume + step) : Math.max(this.target, volume - step);
    if (this.audio.volume === 0 && this.target === 0) this.audio.pause();
  }
}

/** Play the theme for as long as a session lasts. Returns it (for the dev hook and the checks). */
export function playTheme(world: World): Theme {
  const theme = new Theme(`${import.meta.env.BASE_URL}audio/theme.mp3`);
  const xr = world.renderer.xr;
  xr.addEventListener('sessionstart', () => {
    theme.play();
    // A pinch is a player action too: if the browser held the music back, the first one releases it.
    xr.getSession()?.addEventListener('selectstart', () => theme.nudge());
  });
  xr.addEventListener('sessionend', () => theme.stop());
  const tick = (): void => {
    theme.update();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return theme;
}
