/**
 * The page before the headset view (index.html): the same card as in the
 * headset, with PLAY IN VR (index.ts enters the headset view with it) and
 * How to play. Loaded on its own, ahead of the game, so it is up at once.
 *
 * - The rough lines round the cards and buttons are drawn over them, and
 *   drawn again with a new seed ten times a second (the boil of the
 *   headset's cards). They keep still for players who ask the system for
 *   less motion, and while the headset view is on.
 * - How to play opens on a second card in front; CLOSE, Escape or a click
 *   outside closes it.
 * - On a device with no headset view (a computer, a phone), PLAY IN VR is
 *   greyed out and the note says where to open the page.
 */

import rough from 'roughjs';

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
function openHow(on: boolean): void {
  how.classList.toggle('open', on);
  draw();
  (on ? close : help).focus({ focusVisible: false } as FocusOptions);
}
help.addEventListener('click', () => openHow(true));
close.addEventListener('click', () => openHow(false));
how.addEventListener('click', (e) => {
  if (e.target === how) openHow(false);
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && how.classList.contains('open')) openHow(false);
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
