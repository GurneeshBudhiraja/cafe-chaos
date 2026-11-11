/**
 * Grey-box size check in the IWER emulator (a simulated Quest 3 with hands):
 * - sits the viewer at the emulated living room's desk-height table and
 *   checks the café lands on it;
 * - measures how big the pieces look and how far apart the seats are;
 * - pinches a guest off the waiting bench, carries them to a chair and
 *   drops them there (they must sit), then drops one in empty floor (they
 *   must go back to the bench);
 * - saves headset-view screenshots to artifacts/.
 *
 * Usage: dev server running (npm run dev), then
 *   CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/check-sizes.mjs
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.APP_URL ?? 'https://localhost:8081/';
const OUT = 'artifacts';
mkdirSync(OUT, { recursive: true });
/** The emulated living room's desk-height table is to the viewer's left; sit facing it (as the notes app's recordings did). */
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1032, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL);
await page.waitForFunction(() => window.__cafe && window.IWER_DEVICE, null, { timeout: 60000 });

// In-page helpers: frame-paced moves through IWER's remote control.
await page.evaluate(() => {
  const { world, system } = window.__cafe;
  const call = (m, p) => window.IWER_DEVICE.remote.dispatch(m, p);
  const frame = () => new Promise((r) => { const f = world.renderer.info.render.frame; const tick = () => (world.renderer.info.render.frame !== f ? r() : requestAnimationFrame(tick)); tick(); });
  const frames = async (n) => { for (let i = 0; i < n; i++) await frame(); };
  const V = world.camera.position.constructor;
  window.__t = {
    call, frames, V,
    hand: async () => { const t = await call('get_transform', { device: 'hand-right' }); return new V(t.position.x, t.position.y, t.position.z); },
    async moveHand(to, ms, orientation) {
      const from = await this.hand(); const t0 = performance.now();
      for (;;) {
        const t = Math.min(1, (performance.now() - t0) / ms); const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const p = from.clone().lerp(to, e);
        await call('set_transform', { device: 'hand-right', position: { x: p.x, y: p.y, z: p.z }, orientation });
        if (t >= 1) return; await frame();
      }
    },
    world: (o) => o.getWorldPosition(new V()),
    system,
  };
});

const setup = await page.evaluate(async ([seat, look]) => {
  const t = window.__t;
  await t.call('accept_session', {});
  await t.frames(10);
  await t.call('set_input_mode', { mode: 'hand' });
  await t.call('set_transform', { device: 'headset', position: seat });
  await t.call('look_at', { device: 'headset', target: look });
  await t.call('set_transform', { device: 'hand-right', position: { x: seat.x - 0.15, y: 0.98, z: seat.z + 0.15 } });
  await t.call('set_transform', { device: 'hand-left', position: { x: seat.x + 0.2, y: 0.7, z: seat.z + 0.3 } });
  for (let i = 0; i < 300 && !t.system.placed; i++) await t.frames(1);
  const cafe = t.system.cafe;
  return { placed: t.system.placed, onDesk: t.system.onDesk, cafeAt: cafe.position.toArray().map((n) => +n.toFixed(3)) };
}, [SEAT, LOOK]);

const sizes = await page.evaluate(() => {
  const t = window.__t; const { world, system } = window.__cafe;
  const head = world.camera.getWorldPosition(new t.V());
  const deg = (size, at) => +((2 * Math.atan(size / 2 / head.distanceTo(at)) * 180) / Math.PI).toFixed(2);
  const g = system.guests[0].root; const gp = t.world(g);
  const seats = [...system.seats, ...system.guests.map((x) => x.slot)].map(t.world);
  let minGap = Infinity;
  for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) {
    const d = Math.hypot(seats[i].x - seats[j].x, seats[i].z - seats[j].z); if (d < minGap) minGap = d;
  }
  const cafe = t.world(system.cafe);
  const far = system.cafe.localToWorld(new t.V(0, 0, -0.27)); const near = system.cafe.localToWorld(new t.V(0, 0, 0.19));
  return {
    guestHeightDeg: deg(0.0555, gp), kidHeightDeg: deg(0.0416, t.world(system.guests[3].root)),
    headToCafeCentreM: +head.distanceTo(cafe).toFixed(3),
    reachToFrontEdgeM: +Math.hypot(near.x - head.x, near.z - head.z).toFixed(3), reachToBackEdgeM: +Math.hypot(far.x - head.x, far.z - head.z).toFixed(3),
    seats: system.seats.length, closestSeatsCm: +(minGap * 100).toFixed(1),
  };
});

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const setFov = (deg) => page.evaluate((f) => (window.IWER_DEVICE.fovy = (f * Math.PI) / 180), deg);
const lookAtCafe = (dy = 0, fov = 96) =>
  page.evaluate(async ([dy]) => {
    const t = window.__t; const c = t.world(window.__cafe.system.cafe);
    await t.call('look_at', { device: 'headset', target: { x: c.x, y: c.y + dy, z: c.z } }); await t.frames(3);
  }, [dy]).then(() => setFov(fov));
await setFov(96);
await lookAtCafe(0.12);
await shot('1-seated-headset-view');
await lookAtCafe(0, 40);
await shot('2-cafe-close');

/**
 * Pinch guest `index` at its grip and carry it so its feet hang over `target` (a world
 * point). With `shot`, a close screenshot is taken mid-carry, then it lets go.
 */
const pinchCarry = async (index, target, shot) => {
  const carried = await page.evaluate(async ([index, target]) => {
    const t = window.__t; const s = t.system;
    const guest = s.guests[index]; const grip = t.world(guest.root.getObjectByName('Grip'));
    // Hand from above and to the right, aiming at the guest, as one reaches over a table.
    await t.moveHand(grip.clone().add(new t.V(0.06, 0.12, 0.05)), 500);
    await t.call('look_at', { device: 'hand-right', target: { x: grip.x, y: grip.y, z: grip.z } });
    const orientation = (await t.call('get_transform', { device: 'hand-right' })).orientation;
    t.orientation = orientation;
    // Where the closed pinch sits relative to the hand, then open, line up and close on the grip.
    await t.call('set_select_value', { device: 'hand-right', value: 1 }); await t.frames(4);
    const offset = s.pinch.right.point.clone().sub(await t.hand());
    await t.call('set_select_value', { device: 'hand-right', value: 0 }); await t.frames(4);
    await t.moveHand(grip.clone().sub(offset), 500, orientation); await t.frames(2);
    await t.call('set_select_value', { device: 'hand-right', value: 1 }); await t.frames(4);
    const picked = s.carried?.guest === guest;
    // Carry: move so the guest's feet are 2 cm above the target.
    const feet = t.world(guest.root);
    const to = (await t.hand()).add(new t.V(target.x - feet.x, target.y + 0.02 - feet.y, target.z - feet.z));
    await t.moveHand((await t.hand()).add(new t.V(0, 0.04, 0)), 300, orientation);
    await t.moveHand(to, 700, orientation); await t.frames(10);
    return { picked, glowShown: s.glow.visible };
  }, [index, target]);
  if (shot) {
    await page.evaluate(async (i) => {
      const t = window.__t; const p = t.world(t.system.guests[i].root);
      await t.call('look_at', { device: 'headset', target: { x: p.x, y: p.y + 0.02, z: p.z } }); await t.frames(3);
    }, index);
    await setFov(22);
    await shot();
    await setFov(96);
  }
  const released = await page.evaluate(async (index) => {
    const t = window.__t; const s = t.system; const guest = s.guests[index];
    await t.call('set_select_value', { device: 'hand-right', value: 0 }); await t.frames(6);
    await t.moveHand((await t.hand()).add(new t.V(0.05, 0.12, 0.1)), 400, t.orientation);
    return { seated: !!guest.seat, seatedPose: guest.root.getObjectByName('Seated').visible, backOnBench: !guest.seat && t.world(guest.root).distanceTo(t.world(guest.slot)) < 0.002 };
  }, index);
  return { ...carried, ...released };
};

const seatTarget = await page.evaluate(() => {
  const t = window.__t; const tables = window.__cafe.system.cafe.children.filter((c) => c.name === 'table-2');
  const p = t.world(tables[0].getObjectByName('Seat-1')); return { x: p.x, y: p.y, z: p.z };
});
await setFov(96);
await lookAtCafe(0.05);
const toSeat = await pinchCarry(0, seatTarget, () => shot('4-guest-lifted'));
await lookAtCafe(0, 40);
await shot('3-guest-seated');
await page.evaluate(async () => {
  const t = window.__t; const p = t.world(t.system.guests[0].root);
  await t.call('look_at', { device: 'headset', target: { x: p.x, y: p.y + 0.02, z: p.z } }); await t.frames(8);
});
await setFov(22);
await shot('5-guest-seated-close');
await setFov(96);
const emptyFloor = await page.evaluate(() => { const p = window.__cafe.system.cafe.localToWorld(new window.__t.V(0.065, 0.026, -0.055)); return { x: p.x, y: p.y, z: p.z }; });
const toFloor = await pinchCarry(1, emptyFloor);

console.log(JSON.stringify({ setup, sizes, toSeat, toFloor }, null, 1));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await browser.close();
