/**
 * A look at the hands: open over the café, pinching, and from close.
 * Usage: dev server running, then `node scripts/look-hands.mjs`.
 * Output: artifacts/hands-*.png.
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => {
      window.__cafe.guests.arrivals = false;
      window.__cafe.system.replace();
    });
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.mood.lampsUp > 0.99, null, { timeout: 30000 });
  },
});
const { page } = h;
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const Q = { x: 0, y: 0, z: 0, w: 1 };
const hand = (name, p) => send('set_transform', { device: `hand-${name}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: Q });

// Both hands open over the café, from the seat.
await hand('right', [-1.18, 0.98, 0.42]);
await hand('left', [-1.2, 0.97, 0.12]);
await h.pause(500);
await h.screenshot('artifacts/hands-1-open.png');
// The right hand pinching, from close.
await send('set_select_value', { device: 'hand-right', value: 1 });
await h.head({ x: -1.02, y: 1.02, z: 0.52 }, { x: -1.18, y: 0.95, z: 0.4 }, 300);
await h.pause(500);
await h.screenshot('artifacts/hands-2-pinch.png');
await send('set_select_value', { device: 'hand-right', value: 0 });
await h.pause(400);
await h.screenshot('artifacts/hands-3-close.png');
const errors = await h.finish();
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no console errors');
process.exit(0);
