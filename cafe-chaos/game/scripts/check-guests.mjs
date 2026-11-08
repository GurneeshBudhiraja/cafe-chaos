/**
 * Phase 2 check: guests arrive, wait with a timer, give up and leave.
 *
 * With patience shortened to a few seconds and arrivals every second or
 * two, from the seat at the emulated table:
 * 1. guests appear at the gate and the first reaches the bench's first
 *    slot and waits, with a patience bubble over its head facing the viewer;
 * 2. when its patience runs out it leaves: it heads back out and fades;
 * 3. it is gone afterwards, and the guest behind has moved up to the
 *    first slot;
 * 4. new guests keep arriving, and never more than the queue holds.
 *
 * Usage: dev server running, then `node scripts/check-guests.mjs`.
 * Output: artifacts/guests-*.png, and a pass/fail line.
 */

import { startHeadset } from './lib/headset.mjs';

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const PATIENCE = 14;
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: { x: -1.0, y: 0.98, z: 0.43 } }));
    await h.page.evaluate(() => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-left', position: { x: -0.65, y: 0.7, z: 0.58 } }));
    await h.page.evaluate((patience) => {
      const { system, guests } = window.__cafe;
      guests.patienceSeconds = patience;
      guests.spawnRange = [1, 2];
      system.replace();
    }, PATIENCE);
    await h.page.waitForFunction(() => window.__cafe.system.placed, null, { timeout: 15000 });
  },
});
const { page, pause } = h;

/** The guests as the page sees them. */
const read = () =>
  page.evaluate(() => {
    const { world, system, guests } = window.__cafe;
    const V = world.camera.position.constructor;
    const eye = world.camera.getWorldPosition(new V());
    const cafe = system.cafe;
    const bench = system.pieces.find((p) => p.name === 'waiting-bench');
    const slot1 = cafe.worldToLocal(bench.getObjectByName('Slot-1').getWorldPosition(new V()));
    return {
      arrived: guests.arrived,
      gaveUp: guests.gaveUp,
      guests: guests.guests.map((g) => {
        const bubbleAt = g.bubble.mesh.getWorldPosition(new V());
        const headAt = g.bubbleAnchor.getWorldPosition(new V());
        const normal = new V(0, 0, 1).applyQuaternion(g.bubble.mesh.getWorldQuaternion(world.camera.quaternion.clone()));
        const toEye = eye.clone().sub(bubbleAt).setY(0).normalize();
        return {
          name: g.root.name,
          kind: g.kind,
          state: g.state,
          spot: g.spot,
          patience: +g.patience.toFixed(1),
          opacity: +g.opacity.toFixed(2),
          atSlot1: g.root.position.distanceTo(slot1) < 0.004,
          bubbleShown: g.bubble.mesh.visible,
          bubbleAbove: +(bubbleAt.y - headAt.y).toFixed(3),
          bubbleFacing: +normal.setY(0).normalize().dot(toEye).toFixed(2),
        };
      }),
    };
  });

// --- 1. The first guest reaches the bench and waits with a bubble.
await page.waitForFunction(() => window.__cafe.guests.guests.some((g) => g.state === 'waiting'), null, { timeout: 60000 });
await pause(300);
let s = read();
s = await s;
const first = s.guests.find((g) => g.state === 'waiting');
check('a guest walks in from the gate and waits on the bench', !!first && first.spot === 0 && first.atSlot1 && first.opacity === 1, `${s.arrived} arrived; ${first?.name} ${first?.kind} at spot ${first?.spot}, on slot 1 ${first?.atSlot1}`);
check('a patience bubble sits over its head, facing the viewer', !!first && first.bubbleShown && first.bubbleAbove > 0.005 && first.bubbleAbove < 0.05 && first.bubbleFacing > 0.95, `shown ${first?.bubbleShown}, ${first?.bubbleAbove} m above the head, facing ${first?.bubbleFacing}`);
await h.head({ x: -1.0, y: 1.08, z: 0.1 }, { x: -1.32, y: 0.82, z: 0.08 }, 600);
await pause(300);
await h.screenshot('artifacts/guests-1-waiting.png');

// --- 2. Its patience runs out: it heads back out and fades.
const firstName = first?.name;
await page.waitForFunction((name) => window.__cafe.guests.guests.find((g) => g.root.name === name)?.state === 'leaving', firstName, { timeout: 30000 });
// Read it mid-way out (the walk out takes a few seconds; the harness's pauses run slow).
await page.waitForFunction((name) => (window.__cafe.guests.guests.find((g) => g.root.name === name)?.opacity ?? 0) < 0.9, firstName, { timeout: 15000 });
s = await read();
const leaving = s.guests.find((g) => g.name === firstName);
check('out of patience, it leaves and fades on the way', !!leaving && leaving.state === 'leaving' && leaving.opacity < 1 && !leaving.bubbleShown, `${firstName}: state ${leaving?.state}, opacity ${leaving?.opacity}, bubble ${leaving?.bubbleShown}`);
await h.screenshot('artifacts/guests-2-leaving.png');

// --- 3. Gone, and the next guest has moved up to the first slot.
await page.waitForFunction((name) => !window.__cafe.guests.guests.some((g) => g.root.name === name), firstName, { timeout: 30000 });
await pause(2500);
s = await read();
const atFront = s.guests.find((g) => g.spot === 0);
check('it is gone and the guest behind moved up to the first slot', !s.guests.some((g) => g.name === firstName) && !!atFront && atFront.name !== firstName && atFront.atSlot1 && s.gaveUp >= 1, `${s.gaveUp} gave up; at the front now: ${atFront?.name} (on slot 1 ${atFront?.atSlot1}); ${s.guests.length} present`);
await h.screenshot('artifacts/guests-3-shuffled.png');

// --- 4. Arrivals keep coming, within the queue's room.
let most = 0;
for (let i = 0; i < 8; i++) {
  await pause(900);
  const now = await read();
  most = Math.max(most, now.guests.filter((g) => g.state !== 'leaving').length);
}
s = await read();
check('guests keep arriving, never more than the queue holds', s.arrived >= 5 && most <= 6, `${s.arrived} arrived in all, at most ${most} waiting at once`);

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; errors ${errors.length}; ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
process.exit(results.every((r) => r.ok) && errors.length === 0 ? 0 : 1);
