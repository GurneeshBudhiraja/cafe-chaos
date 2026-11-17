/**
 * The page before the headset view (index.html): the same card as in the
 * headset, with PLAY IN VR (index.ts enters the headset view with it) and
 * How to play. Loaded on its own, ahead of the game, so it is up at once.
 *
 * - The rough lines round the cards and buttons are drawn over them, and
 *   drawn again with a new seed ten times a second (the boil of the
 *   headset's cards). They keep still for players who ask the system for
 *   less motion, and while the headset view is on.
 * - How to play opens on a second card in front, one step at a time (the
 *   steps are in game/how-to-play.ts): the step's video loops, silent, over
 *   its title and line; PREVIOUS and NEXT (or the arrow keys) move between
 *   steps; the close button, DONE on the last step, Escape or a click
 *   outside closes it. Players who ask for less motion see the still.
 * - The game's theme plays here too (the end of this file).
 * - On a device with no headset view (a computer, a phone), PLAY IN VR is
 *   greyed out and the note says where to open the page.
 */

import rough from 'roughjs';
import { Theme } from './audio/theme.js';
import { HOW_TO_PLAY } from './game/how-to-play.js';
import { SaveBook, TEST_MODE } from './game/save.js';

const STROKES: Record<string, string> = { ink: '#16171d', timber: '#3e2a1c', 'moss-deep': '#2f522d', off: '#b6a993' };
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
let seed = 1;

function draw(): void {
  if (document.body.classList.contains('in-xr')) return;
  for (const el of document.querySelectorAll<HTMLElement>('.sketch')) {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) continue;
    let svg = el.querySelector<SVGSVGElement>(':scope > svg.rough');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('rough');
      el.appendChild(svg);
    }
    svg.replaceChildren();
    const card = el.classList.contains('card');
    const inset = card ? 7 : 1.5;
    const stroke = STROKES[el.dataset.stroke ?? 'ink'] ?? STROKES.ink;
    svg.appendChild(rough.svg(svg).rectangle(inset, inset, w - inset * 2, h - inset * 2, { seed: seed + w, roughness: 1.3, bowing: 1.1, strokeWidth: card ? 2.5 : 2.2, stroke }));
  }
}

const how = document.getElementById('how')!;
const help = document.getElementById('help')!;
const close = document.getElementById('how-close')!;
const frame = document.getElementById('how-frame')!;
const video = document.getElementById('how-video') as HTMLVideoElement;
const prev = document.getElementById('how-prev') as HTMLButtonElement;
const next = document.getElementById('how-next') as HTMLButtonElement;
const dots = document.getElementById('how-dots')!;
const base = import.meta.env.BASE_URL;
let step = 0;
dots.replaceChildren(...HOW_TO_PLAY.map(() => document.createElement('i')));

/** Show step `i`: its still (until the clip plays), its clip, title and line, and where it is in the list. */
function showStep(i: number): void {
  step = Math.max(0, Math.min(HOW_TO_PLAY.length - 1, i));
  const s = HOW_TO_PLAY[step];
  frame.style.backgroundImage = `url(${base}${s.poster})`;
  if (s.video && !still) {
    video.hidden = false;
    video.poster = `${base}${s.poster}`;
    if (video.getAttribute('src') !== `${base}${s.video}`) video.src = `${base}${s.video}`;
    if (how.classList.contains('open')) void video.play().catch(() => {});
  } else {
    video.pause();
    video.removeAttribute('src');
    video.hidden = true;
  }
  document.getElementById('how-num')!.textContent = `${step + 1}`;
  document.getElementById('how-step-title')!.textContent = s.title;
  document.getElementById('how-step-text')!.textContent = s.text;
  document.getElementById('how-count')!.textContent = `Step ${step + 1} of ${HOW_TO_PLAY.length}.`;
  dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === step));
  prev.disabled = step === 0;
  prev.dataset.stroke = step === 0 ? 'off' : 'ink';
  next.textContent = step === HOW_TO_PLAY.length - 1 ? 'DONE' : 'NEXT';
  draw();
}

function openHow(on: boolean): void {
  how.classList.toggle('open', on);
  if (on) showStep(0);
  else video.pause();
  draw();
  (on ? next : help).focus({ focusVisible: false } as FocusOptions);
}
help.addEventListener('click', () => openHow(true));
close.addEventListener('click', () => openHow(false));
prev.addEventListener('click', () => showStep(step - 1));
next.addEventListener('click', () => (step === HOW_TO_PLAY.length - 1 ? openHow(false) : showStep(step + 1)));
how.addEventListener('click', (e) => {
  if (e.target === how) openHow(false);
});
addEventListener('keydown', (e) => {
  if (!how.classList.contains('open')) return;
  if (e.key === 'Escape') openHow(false);
  else if (e.key === 'ArrowRight') showStep(step + 1);
  else if (e.key === 'ArrowLeft') showStep(step - 1);
});
addEventListener('resize', draw);
document.fonts.ready.then(draw);
draw();
if (!still) setInterval(() => (seed++, draw()), 100);

// No headset view on this device: PLAY IN VR cannot be pressed, and the note says where to open the page.
async function headsetView(): Promise<boolean> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) return false;
  try {
    return (await xr.isSessionSupported('immersive-ar')) || (await xr.isSessionSupported('immersive-vr'));
  } catch {
    return false;
  }
}
// The game's emulator (development) adds a headset view a moment after load: ask once the page has settled.
addEventListener('load', () =>
  setTimeout(async () => {
    if (await headsetView()) return;
    const start = document.getElementById('start') as HTMLButtonElement;
    start.disabled = true;
    start.dataset.stroke = 'off';
    const note = document.getElementById('note')!;
    note.classList.add('warn');
    note.textContent = 'Open this page in the browser on your Meta Quest.';
    draw();
  }, 1500),
);

// The game's theme plays here too, quietly, at the player's music level (Settings), so the page sounds
// like the café. Browsers hold sound back until the player does something, so it starts on the first
// click, tap or key if it could not start at once. It stops as the headset view opens (the game plays
// its own) and comes back when the player returns to the page.
const theme = new Theme(`${import.meta.env.BASE_URL}audio/theme.mp3`);
theme.level = new SaveBook().load('japan').music / 2;
if (!TEST_MODE) theme.play();
for (const kind of ['pointerdown', 'keydown', 'touchstart'] as const) addEventListener(kind, () => theme.nudge(), { capture: true });
new MutationObserver(() => {
  if (document.body.classList.contains('in-xr')) {
    theme.stop();
    theme.audio.pause();
    theme.audio.volume = 0;
  } else if (!TEST_MODE) theme.play();
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
const tick = (): void => {
  theme.update();
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
