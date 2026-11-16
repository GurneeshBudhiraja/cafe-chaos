/**
 * Start card check: where the card stands and that it keeps still.
 * 1. it stands below the eyes (its top edge under eye level), about 40 cm
 *    away, straight ahead, facing the eyes;
 * 2. looking up when it is put there does not put it higher;
 * 3. a nod, a lean and a small turn of the head do not move or turn it;
 * 4. turning well away brings it back in front, below the eyes again.
 *
 * Usage: dev server running, then `node scripts/check-menu-spot.mjs`.
 * Output: artifacts/menu-spot.png, and a pass/fail line.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const AHEAD = { x: -1.85, y: 1.22, z: 0.28 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({
  async prepare(h) {
    // Looking up (30 degrees) when the card is put up.
    await h.head(SEAT, { x: -1.85, y: 1.22 + Math.tan(Math.PI / 6), z: 0.28 });
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 30000 });
  },
});
const { page } = h;
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
await until(() => window.__cafe.game.phase === 'title' && window.__cafe.game.menu.card.open);
await page.waitForTimeout(800);
const pose = () => page.evaluate(() => {
  const m = window.__cafe.game.menu.card.mesh;
  m.updateWorldMatrix(true, false);
  const p = m.position;
  const e = window.__cafe.game.head;
  const top = m.localToWorld(m.position.clone().set(0, 0.28 / 2 / m.scale.y, 0));
  const n = m.getWorldDirection(m.position.clone());
  return { p: p.toArray(), q: m.quaternion.toArray(), top: top.toArray(), eye: e.toArray(), n: n.toArray() };
});
const a = await pose();
const dist = Math.hypot(...a.p.map((v, i) => v - a.eye[i]));
const down = (Math.atan2(a.eye[1] - a.p[1], Math.hypot(a.p[0] - a.eye[0], a.p[2] - a.eye[2])) * 180) / Math.PI;
check('below the eyes', a.top[1] < a.eye[1], `top edge ${((a.top[1] - a.eye[1]) * 100).toFixed(1)} cm from eye level, centre ${down.toFixed(0)}° down, ${(dist * 100).toFixed(0)} cm away (looked up 30° when put there)`);
const toEye = a.eye.map((v, i) => v - a.p[i]);
const len = Math.hypot(...toEye);
const facing = (Math.acos(toEye.reduce((s, v, i) => s + (v / len) * a.n[i], 0)) * 180) / Math.PI;
check('faces the eyes', facing < 3, `${facing.toFixed(1)}° off`);
await page.screenshot({ path: 'artifacts/menu-spot.png' });

// A nod down, a lean in, a small turn: it stays where it is, turned as it was.
await h.head(SEAT, { x: -1.85, y: 0.7, z: 0.28 }, 400);
await h.head({ x: -0.92, y: 1.17, z: 0.3 }, { x: -1.85, y: 0.9, z: 0.45 }, 400);
await page.waitForTimeout(600);
const b = await pose();
const moved = Math.hypot(...a.p.map((v, i) => v - b.p[i]));
const dot = Math.abs(a.q.reduce((s, v, i) => s + v * b.q[i], 0));
const turned = (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
check('keeps still while used', moved < 0.002 && turned < 0.5, `moved ${(moved * 1000).toFixed(1)} mm, turned ${turned.toFixed(2)}°`);

// Turn well away: it glides back in front, below the eyes.
await h.head(SEAT, { x: -0.85, y: 1.22, z: -0.72 }, 600);
await page.waitForTimeout(2500);
const c = await pose();
const back = (Math.atan2(c.p[0] - c.eye[0], c.p[2] - c.eye[2]) * 180) / Math.PI;
check('follows a big turn', Math.abs(Math.abs(back) - 180) < 8 && c.top[1] < c.eye[1], `now at heading ${back.toFixed(0)}° (wanted ±180), top ${((c.top[1] - c.eye[1]) * 100).toFixed(1)} cm from eye level`);

await h.finish();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : `ALL ${results.length} PASSED`);
process.exit(failed ? 1 : 0);
